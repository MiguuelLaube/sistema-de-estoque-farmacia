-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 08
-- Proteção contra Ataques, Rate Limiting de API/SQL e Timeouts de Query
-- ====================================================================

-- 1. Timeouts estritos de execução SQL no PostgreSQL para evitar DoS / Queries lentas
ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE authenticated SET statement_timeout = '10s';

-- 2. Tabela de controle de janelas de Rate Limiting (API + Mutações SQL)
CREATE TABLE IF NOT EXISTS public.rate_limit_requisicao (
    chave VARCHAR(160) NOT NULL,
    escopo VARCHAR(80) NOT NULL,
    janela_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contagem INTEGER NOT NULL DEFAULT 1,
    bloqueios_acumulados INTEGER NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chave, escopo)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_atualizado_em
    ON public.rate_limit_requisicao (atualizado_em);

ALTER TABLE public.rate_limit_requisicao ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy pública: apenas funções SECURITY DEFINER manipulam esta tabela
REVOKE ALL ON public.rate_limit_requisicao FROM anon, authenticated;

-- 3. Função RPC e interna para validar e incrementar Rate Limit por Usuário ou IP
CREATE OR REPLACE FUNCTION public.verificar_rate_limit_requisicao(
    p_escopo TEXT,
    p_limite INTEGER DEFAULT 60,
    p_janela_segundos INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid TEXT;
    v_ip TEXT;
    v_chave TEXT;
    v_agora TIMESTAMPTZ := clock_timestamp();
    v_janela_inicio TIMESTAMPTZ;
    v_contagem INTEGER;
    v_segundos_restantes INTEGER;
BEGIN
    v_uid := auth.uid()::text;
    v_ip := COALESCE(public.request_client_ip(), 'ip_desconhecido');

    -- Chave composta priorizando o usuário autenticado + IP
    v_chave := COALESCE('uid:' || v_uid, 'ip:' || v_ip);

    -- Limpeza oportunista leve de registros expirados há mais de 15 minutos
    DELETE FROM public.rate_limit_requisicao
    WHERE atualizado_em < (v_agora - INTERVAL '15 minutes')
      AND random() < 0.03;

    INSERT INTO public.rate_limit_requisicao (chave, escopo, janela_inicio, contagem, atualizado_em)
    VALUES (v_chave, LEFT(COALESCE(p_escopo, 'geral'), 80), v_agora, 1, v_agora)
    ON CONFLICT (chave, escopo) DO UPDATE
    SET
        contagem = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora
            THEN 1
            ELSE public.rate_limit_requisicao.contagem + 1
        END,
        janela_inicio = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora
            THEN v_agora
            ELSE public.rate_limit_requisicao.janela_inicio
        END,
        bloqueios_acumulados = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) > v_agora
                 AND public.rate_limit_requisicao.contagem >= p_limite
            THEN public.rate_limit_requisicao.bloqueios_acumulados + 1
            ELSE public.rate_limit_requisicao.bloqueios_acumulados
        END,
        atualizado_em = v_agora
    RETURNING janela_inicio, contagem INTO v_janela_inicio, v_contagem;

    v_segundos_restantes := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM ((v_janela_inicio + make_interval(secs => p_janela_segundos)) - v_agora)))::INTEGER
    );

    IF v_contagem > p_limite THEN
        RETURN jsonb_build_object(
            'permitido', false,
            'contagem', v_contagem,
            'limite', p_limite,
            'restantes', 0,
            'segundos_restantes', v_segundos_restantes
        );
    END IF;

    RETURN jsonb_build_object(
        'permitido', true,
        'contagem', v_contagem,
        'limite', p_limite,
        'restantes', GREATEST(0, p_limite - v_contagem),
        'segundos_restantes', v_segundos_restantes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_rate_limit_requisicao(TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- 4. Trigger de proteção SQL contra Flood de Escritas (INSERT / UPDATE / DELETE) via PostgREST
CREATE OR REPLACE FUNCTION public.trg_limitar_mutacoes_sql()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check JSONB;
BEGIN
    -- Se for execução administrativa direta no SQL Editor (sem JWT e sem cabeçalho HTTP), não bloqueia
    IF auth.uid() IS NULL AND public.request_client_ip() IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Limite de 90 operações de escrita por minuto por usuário/IP em cada tabela operacional
    v_check := public.verificar_rate_limit_requisicao('sql_mut_' || TG_TABLE_NAME, 90, 60);

    IF COALESCE((v_check->>'permitido')::boolean, true) = false THEN
        RAISE EXCEPTION 'Limite de segurança de requisições SQL excedido para a tabela %. Aguarde % segundos.',
            TG_TABLE_NAME,
            COALESCE(v_check->>'segundos_restantes', '15')
            USING ERRCODE = 'P0001';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplica o escudo anti-flood nas tabelas operacionais (FOR EACH STATEMENT para permitir lotes legítimos mas barrar flood de requisições)
DROP TRIGGER IF EXISTS trg_rate_limit_sql_cliente ON public.cliente;
CREATE TRIGGER trg_rate_limit_sql_cliente
    BEFORE INSERT OR UPDATE OR DELETE ON public.cliente
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_encomenda ON public.encomenda;
CREATE TRIGGER trg_rate_limit_sql_encomenda
    BEFORE INSERT OR UPDATE OR DELETE ON public.encomenda
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_encomenda_item ON public.encomenda_item;
CREATE TRIGGER trg_rate_limit_sql_encomenda_item
    BEFORE INSERT OR UPDATE OR DELETE ON public.encomenda_item
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_compra_item ON public.compra_item;
CREATE TRIGGER trg_rate_limit_sql_compra_item
    BEFORE INSERT OR UPDATE OR DELETE ON public.compra_item
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_pagamento ON public.pagamento;
CREATE TRIGGER trg_rate_limit_sql_pagamento
    BEFORE INSERT OR UPDATE OR DELETE ON public.pagamento
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_fornecedor ON public.fornecedor;
CREATE TRIGGER trg_rate_limit_sql_fornecedor
    BEFORE INSERT OR UPDATE OR DELETE ON public.fornecedor
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_classificacao ON public.classificacao;
CREATE TRIGGER trg_rate_limit_sql_classificacao
    BEFORE INSERT OR UPDATE OR DELETE ON public.classificacao
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_funcionario ON public.funcionario;
CREATE TRIGGER trg_rate_limit_sql_funcionario
    BEFORE INSERT OR UPDATE OR DELETE ON public.funcionario
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_config_tenant ON public.config_tenant;
CREATE TRIGGER trg_rate_limit_sql_config_tenant
    BEFORE INSERT OR UPDATE OR DELETE ON public.config_tenant
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

NOTIFY pgrst, 'reload schema';
