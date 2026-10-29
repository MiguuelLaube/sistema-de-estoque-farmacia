-- ====================================================================
-- SISTEMA ENCOMED / DROGARIA AEROPORTO - HARDENING DE SEGURANÇA PRÉ-LANÇAMENTO
-- Migração 06: Zero-Trust Super Admin (2FA AAL2, Rate Limit, IP/Device Allowlist),
--              Blindagem Anti-Escalação (RLS/Triggers), Auditoria Imutável e Persistência
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 1. Ajustes de Persistência Completa sem Segredos no Perfil/Tenant
ALTER TABLE public.config_tenant
    ADD COLUMN IF NOT EXISTS mensagem_whatsapp_pedido TEXT DEFAULT 'Olá {cliente}! Confirmamos seu pedido de {medicamento} na farmácia. Em breve avisaremos assim que chegar.',
    ADD COLUMN IF NOT EXISTS mensagem_whatsapp_cobranca TEXT DEFAULT 'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível. Saldo a acertar: {saldo}.',
    ADD COLUMN IF NOT EXISTS ocultar_medicamentos_notificacao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS evolution_api_ativo BOOLEAN NOT NULL DEFAULT false;

-- Garantia explícita: remover colunas de segredos externos caso tenham existido
ALTER TABLE public.config_tenant
    DROP COLUMN IF EXISTS evolution_api_key,
    DROP COLUMN IF EXISTS evolution_api_url,
    DROP COLUMN IF EXISTS evolution_api_instance;

-- Tabela de Funcionários / Balconistas do Tenant
CREATE TABLE IF NOT EXISTS public.funcionario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cargo VARCHAR(120),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_funcionario_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_funcionario_tenant ON public.funcionario(tenant_id);

-- Campos operacionais complementares em encomenda
ALTER TABLE public.encomenda
    ADD COLUMN IF NOT EXISTS cliente_avisado BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cliente_avisado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cliente_avisado_por VARCHAR(255),
    ADD COLUMN IF NOT EXISTS historico JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Ajuste em log_auditoria para suportar eventos globais de plataforma (tenant_id NULL)
-- e invisibilidade de ações internas do super_admin para admins comuns
ALTER TABLE public.log_auditoria
    ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.log_auditoria
    ADD COLUMN IF NOT EXISTS usuario_email_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS nivel VARCHAR(20) NOT NULL DEFAULT 'INFO',
    ADD COLUMN IF NOT EXISTS visivel_tenant BOOLEAN NOT NULL DEFAULT true;

-- ====================================================================
-- 2. Tabelas de Segurança de Acesso, Rate Limiting, IP & Dispositivos
-- ====================================================================

-- 2.1. Controle de Tentativas de Login (Anti Brute-Force / Credential Stuffing)
CREATE TABLE IF NOT EXISTS public.seguranca_tentativa_login (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identificador_hash VARCHAR(64) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    sucesso BOOLEAN NOT NULL DEFAULT false,
    motivo VARCHAR(120),
    user_agent TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tentativa_login_hash_tempo
    ON public.seguranca_tentativa_login(identificador_hash, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tentativa_login_ip_tempo
    ON public.seguranca_tentativa_login(ip, criado_em DESC);

ALTER TABLE public.seguranca_tentativa_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguranca_tentativa_login FORCE ROW LEVEL SECURITY;

-- 2.2. Política Zero-Trust Exclusiva do Super Admin
CREATE TABLE IF NOT EXISTS public.super_admin_politica (
    usuario_id UUID PRIMARY KEY REFERENCES public.usuario(id) ON DELETE RESTRICT,
    mfa_obrigatorio BOOLEAN NOT NULL DEFAULT true CHECK (mfa_obrigatorio = true),
    restringir_ip BOOLEAN NOT NULL DEFAULT false,
    ips_permitidos TEXT[] NOT NULL DEFAULT '{}',
    exigir_dispositivo_confiavel BOOLEAN NOT NULL DEFAULT false,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_politica FORCE ROW LEVEL SECURITY;

-- 2.3. Dispositivos Confiáveis (Token Criptográfico Hasheado SHA-256)
CREATE TABLE IF NOT EXISTS public.super_admin_dispositivo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
    nome_dispositivo VARCHAR(120) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_registro VARCHAR(64),
    user_agent TEXT,
    ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    revogado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_dispositivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_dispositivo FORCE ROW LEVEL SECURITY;

-- 2.4. Sessões Temporárias de Suporte Emergencial Auditado (Break-Glass)
CREATE TABLE IF NOT EXISTS public.super_admin_break_glass (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    justificativa TEXT NOT NULL,
    ip VARCHAR(64),
    ativo BOOLEAN NOT NULL DEFAULT true,
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_break_glass ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_break_glass FORCE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. Funções Utilitárias Seguras (Sem Confiança em user_metadata!)
-- ====================================================================

-- Corrige search_path da função normalizar_descricao para encontrar unaccent em public ou extensions
CREATE OR REPLACE FUNCTION public.normalizar_descricao(texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
BEGIN
    IF texto IS NULL THEN
        RETURN '';
    END IF;
    RETURN UPPER(TRIM(REGEXP_REPLACE(unaccent(texto), '\s+', ' ', 'g')));
END;
$$;

-- Corrige chaves estrangeiras compostas com ON DELETE SET NULL para anular apenas a coluna opcional (preservando tenant_id NOT NULL)
ALTER TABLE public.compra_item
    DROP CONSTRAINT IF EXISTS fk_compra_classificacao,
    ADD CONSTRAINT fk_compra_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES public.classificacao(tenant_id, id) ON DELETE SET NULL (classificacao_id),
    DROP CONSTRAINT IF EXISTS fk_compra_fornecedor,
    ADD CONSTRAINT fk_compra_fornecedor FOREIGN KEY (tenant_id, fornecedor_id) REFERENCES public.fornecedor(tenant_id, id) ON DELETE SET NULL (fornecedor_id);

ALTER TABLE public.encomenda
    DROP CONSTRAINT IF EXISTS fk_encomenda_criado_por,
    ADD CONSTRAINT fk_encomenda_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (criado_por),
    DROP CONSTRAINT IF EXISTS fk_encomenda_entregue_por,
    ADD CONSTRAINT fk_encomenda_entregue_por FOREIGN KEY (tenant_id, entregue_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (entregue_por);

ALTER TABLE public.encomenda_item
    DROP CONSTRAINT IF EXISTS fk_item_classificacao,
    ADD CONSTRAINT fk_item_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES public.classificacao(tenant_id, id) ON DELETE SET NULL (classificacao_id),
    DROP CONSTRAINT IF EXISTS fk_item_compra,
    ADD CONSTRAINT fk_item_compra FOREIGN KEY (tenant_id, compra_item_id) REFERENCES public.compra_item(tenant_id, id) ON DELETE SET NULL (compra_item_id);

ALTER TABLE public.pagamento
    DROP CONSTRAINT IF EXISTS fk_pagamento_registrado_por,
    ADD CONSTRAINT fk_pagamento_registrado_por FOREIGN KEY (tenant_id, registrado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (registrado_por);

ALTER TABLE public.importacao_xml
    DROP CONSTRAINT IF EXISTS fk_importacao_criado_por,
    ADD CONSTRAINT fk_importacao_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (criado_por);

ALTER TABLE public.notificacao
    DROP CONSTRAINT IF EXISTS fk_notificacao_enviada_por,
    ADD CONSTRAINT fk_notificacao_enviada_por FOREIGN KEY (tenant_id, enviada_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (enviada_por);

-- Extrai IP real injetado pelo proxy reverso / PostgREST (não falsificável via payload JS)
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS VARCHAR
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
    v_ip TEXT;
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::JSON;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NOT NULL THEN
        v_ip := COALESCE(
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'cf-connecting-ip', ',', 1)), ''),
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'x-real-ip', ',', 1)), ''),
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'x-forwarded-for', ',', 1)), '')
        );
    END IF;

    RETURN LEFT(COALESCE(v_ip, '127.0.0.1'), 64);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_user_agent()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::JSON;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NOT NULL THEN
        RETURN LEFT(COALESCE(v_headers ->> 'user-agent', 'unknown'), 512);
    END IF;
    RETURN 'server-internal';
END;
$$;

-- Obtém ID interno do usuário autenticado na tabela public.usuario
CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM public.usuario
    WHERE auth_user_id = auth.uid()
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;
$$;

-- Obtém perfil verificado no banco (NUNCA de user_metadata!)
CREATE OR REPLACE FUNCTION public.current_usuario_perfil()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT perfil
    FROM public.usuario
    WHERE auth_user_id = auth.uid()
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;
$$;

-- Verifica se o usuário autenticado é super_admin E cumpriu MFA AAL2 + Política de IP
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_usuario_id UUID;
    v_aal TEXT;
    v_restringir_ip BOOLEAN;
    v_ips TEXT[];
    v_client_ip TEXT;
BEGIN
    -- Suporte exclusivo para suíte de testes automatizados rodando como role postgres
    IF auth.uid() IS NULL AND current_user = 'postgres' AND current_setting('app.is_super_admin', true) = 'true' THEN
        RETURN true;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND perfil = 'super_admin'
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
        RETURN false;
    END IF;

    -- Exigência obrigatória de 2FA (Authenticator Assurance Level 2 no JWT do Supabase Auth)
    v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
    IF v_aal <> 'aal2' THEN
        RETURN false;
    END IF;

    -- Verifica política opcional de restrição por endereço IP
    SELECT restringir_ip, ips_permitidos
    INTO v_restringir_ip, v_ips
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario_id;

    IF COALESCE(v_restringir_ip, false) = true THEN
        v_client_ip := public.request_client_ip();
        IF NOT (v_client_ip = ANY(COALESCE(v_ips, '{}'))) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$;

-- Verifica se há sessão Break-Glass ativa para o Super Admin
CREATE OR REPLACE FUNCTION public.active_break_glass_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT bg.tenant_id
    FROM public.super_admin_break_glass bg
    JOIN public.usuario u ON u.id = bg.usuario_id
    WHERE u.auth_user_id = auth.uid()
      AND u.perfil = 'super_admin'
      AND bg.ativo = true
      AND bg.expira_em > now()
      AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    ORDER BY bg.criado_em DESC
    LIMIT 1;
$$;

-- Obtém tenant_id estritamente da tabela public.usuario (ou Break-Glass auditado)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_tenant UUID;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        IF current_user = 'postgres' THEN
            RETURN NULLIF(current_setting('app.tenant_id', true), '')::UUID;
        END IF;
        RETURN NULL;
    END IF;

    SELECT tenant_id INTO v_tenant
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_tenant IS NOT NULL THEN
        RETURN v_tenant;
    END IF;

    -- Se for super_admin com Break-Glass ativo e auditado
    RETURN public.active_break_glass_tenant_id();
END;
$$;

-- ====================================================================
-- 4. Triggers de Blindagem do Super Admin e Imutabilidade de Auditoria
-- ====================================================================

CREATE OR REPLACE FUNCTION public.trg_proteger_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Permite manutenção controlada apenas pelo papel interno postgres com flag explícita
    IF current_user = 'postgres' AND current_setting('app.allow_super_admin_setup', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- 1. Bloqueia qualquer exclusão de conta super_admin
    IF TG_OP = 'DELETE' THEN
        IF OLD.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: a conta protegida de nível plataforma não pode ser excluída.';
        END IF;
        RETURN OLD;
    END IF;

    -- 2. Bloqueia criação de novas contas super_admin por qualquer usuário comum ou admin
    IF TG_OP = 'INSERT' THEN
        IF NEW.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: criação de conta super_admin não permitida por esta interface.';
        END IF;
        RETURN NEW;
    END IF;

    -- 3. Bloqueia rebaixamento, desativação ou alteração não autorizada de super_admin
    IF TG_OP = 'UPDATE' THEN
        IF OLD.perfil = 'super_admin' THEN
            IF NEW.perfil <> 'super_admin' THEN
                RAISE EXCEPTION 'Operação bloqueada: não é permitido rebaixar o perfil da conta super_admin.';
            END IF;
            IF NEW.ativo = false OR NEW.excluido_em IS NOT NULL THEN
                RAISE EXCEPTION 'Operação bloqueada: não é permitido desativar ou arquivar a conta super_admin.';
            END IF;
            IF NEW.tenant_id IS NOT NULL THEN
                RAISE EXCEPTION 'Operação bloqueada: super_admin não pode ser vinculado a um tenant comum.';
            END IF;
            IF NOT public.is_super_admin() OR OLD.auth_user_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Operação bloqueada: somente o próprio super_admin autenticado com 2FA pode atualizar seu registro.';
            END IF;
        ELSIF NEW.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: escalonamento de privilégio para super_admin negado.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuario_proteger_super_admin ON public.usuario;
CREATE TRIGGER trg_usuario_proteger_super_admin
BEFORE INSERT OR UPDATE OR DELETE ON public.usuario
FOR EACH ROW
EXECUTE FUNCTION public.trg_proteger_super_admin();

-- Imutabilidade do Log de Auditoria (LGPD / Marco Civil)
CREATE OR REPLACE FUNCTION public.trg_bloquear_mutacao_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user = 'postgres' AND current_setting('app.allow_audit_maintenance', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Operação negada: registros de log_auditoria são imutáveis e protegidos contra alteração ou exclusão.';
END;
$$;

DROP TRIGGER IF EXISTS trg_log_auditoria_imutavel ON public.log_auditoria;
CREATE TRIGGER trg_log_auditoria_imutavel
BEFORE UPDATE OR DELETE ON public.log_auditoria
FOR EACH ROW
EXECUTE FUNCTION public.trg_bloquear_mutacao_auditoria();

-- ====================================================================
-- 5. Reescrita das Políticas RLS (Invisibilidade Total do Super Admin e RBAC)
-- ====================================================================

-- 5.1. Usuario: Admin de tenant NUNCA vê, lista, edita ou exclui super_admin
DROP POLICY IF EXISTS usuario_tenant_all ON public.usuario;
DROP POLICY IF EXISTS usuario_select_isolado ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_insert ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_update ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_delete ON public.usuario;

CREATE POLICY usuario_select_isolado ON public.usuario
    FOR SELECT
    USING (
        public.is_super_admin()
        OR auth_user_id = auth.uid()
        OR (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND perfil <> 'super_admin'
        )
    );

CREATE POLICY usuario_admin_insert ON public.usuario
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = public.current_tenant_id()
        AND public.current_usuario_perfil() = 'admin'
        AND perfil IN ('admin', 'comprador', 'operador')
    );

CREATE POLICY usuario_admin_update ON public.usuario
    FOR UPDATE
    USING (
        (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND perfil <> 'super_admin'
        )
        OR (public.is_super_admin() AND auth_user_id = auth.uid())
    )
    WITH CHECK (
        (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND perfil IN ('admin', 'comprador', 'operador')
        )
        OR (public.is_super_admin() AND auth_user_id = auth.uid())
    );

CREATE POLICY usuario_admin_delete ON public.usuario
    FOR DELETE
    USING (
        tenant_id IS NOT NULL
        AND tenant_id = public.current_tenant_id()
        AND public.current_usuario_perfil() = 'admin'
        AND perfil IN ('admin', 'comprador', 'operador')
    );

-- 5.2. ConfigTenant: leitura pelo tenant, escrita apenas por Admin do tenant ou Super Admin
DROP POLICY IF EXISTS config_tenant_update ON public.config_tenant;
DROP POLICY IF EXISTS config_tenant_insert ON public.config_tenant;

CREATE POLICY config_tenant_update ON public.config_tenant
    FOR UPDATE
    USING (
        (tenant_id = public.current_tenant_id() AND public.current_usuario_perfil() = 'admin')
        OR public.is_super_admin()
    )
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.current_usuario_perfil() = 'admin')
        OR public.is_super_admin()
    );

CREATE POLICY config_tenant_insert ON public.config_tenant
    FOR INSERT
    WITH CHECK (public.is_super_admin());

-- 5.3. Funcionario: leitura pelo tenant, gestão por Admin (ou Super Admin em suporte)
ALTER TABLE public.funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funcionario_select ON public.funcionario;
DROP POLICY IF EXISTS funcionario_manage ON public.funcionario;

CREATE POLICY funcionario_select ON public.funcionario
    FOR SELECT
    USING (tenant_id = public.current_tenant_id());

CREATE POLICY funcionario_manage ON public.funcionario
    FOR ALL
    USING (
        tenant_id = public.current_tenant_id()
        AND (public.current_usuario_perfil() IN ('admin') OR public.active_break_glass_tenant_id() IS NOT NULL OR current_user = 'postgres')
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND (public.current_usuario_perfil() IN ('admin') OR public.active_break_glass_tenant_id() IS NOT NULL OR current_user = 'postgres')
    );

-- 5.4. Tabelas Operacionais: permitir também Break-Glass auditado quando ativo
DROP POLICY IF EXISTS cliente_tenant_all ON public.cliente;
CREATE POLICY cliente_tenant_all ON public.cliente
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS fornecedor_tenant_all ON public.fornecedor;
CREATE POLICY fornecedor_tenant_all ON public.fornecedor
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS compra_item_tenant_all ON public.compra_item;
CREATE POLICY compra_item_tenant_all ON public.compra_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS encomenda_tenant_all ON public.encomenda;
CREATE POLICY encomenda_tenant_all ON public.encomenda
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS encomenda_item_tenant_all ON public.encomenda_item;
CREATE POLICY encomenda_item_tenant_all ON public.encomenda_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS pagamento_tenant_all ON public.pagamento;
CREATE POLICY pagamento_tenant_all ON public.pagamento
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS "tenant_isolation_reserva" ON public.reserva;
CREATE POLICY "tenant_isolation_reserva" ON public.reserva
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS "tenant_isolation_reserva_item" ON public.reserva_item;
CREATE POLICY "tenant_isolation_reserva_item" ON public.reserva_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

-- 5.5. Log de Auditoria: Admin do tenant vê apenas logs visíveis do próprio tenant; Super Admin vê todos
DROP POLICY IF EXISTS log_auditoria_tenant_select ON public.log_auditoria;
DROP POLICY IF EXISTS log_auditoria_tenant_insert ON public.log_auditoria;

CREATE POLICY log_auditoria_tenant_select ON public.log_auditoria
    FOR SELECT
    USING (
        public.is_super_admin()
        OR (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND visivel_tenant = true
        )
    );

CREATE POLICY log_auditoria_tenant_insert ON public.log_auditoria
    FOR INSERT
    WITH CHECK (
        public.is_super_admin()
        OR (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id())
    );

-- 5.6. Políticas das tabelas exclusivas de Super Admin
DROP POLICY IF EXISTS super_admin_politica_all ON public.super_admin_politica;
CREATE POLICY super_admin_politica_all ON public.super_admin_politica
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

DROP POLICY IF EXISTS super_admin_dispositivo_all ON public.super_admin_dispositivo;
CREATE POLICY super_admin_dispositivo_all ON public.super_admin_dispositivo
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

DROP POLICY IF EXISTS super_admin_break_glass_all ON public.super_admin_break_glass;
CREATE POLICY super_admin_break_glass_all ON public.super_admin_break_glass
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

-- ====================================================================
-- 6. RPCs de Segurança (Rate Limit, Auditoria, IP/Device Gate, Break-Glass)
-- ====================================================================

-- 6.1. Verifica se identificador ou IP está bloqueado por excesso de tentativas (5 falhas / 15 min)
CREATE OR REPLACE FUNCTION public.verificar_bloqueio_login(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_falhas_id INT;
    v_falhas_ip INT;
    v_ultima_falha TIMESTAMPTZ;
    v_segundos_restantes INT := 0;
BEGIN
    v_hash := encode(digest(LOWER(TRIM(COALESCE(p_identificador, ''))), 'sha256'), 'hex');
    v_ip := public.request_client_ip();

    SELECT COUNT(*), MAX(criado_em)
    INTO v_falhas_id, v_ultima_falha
    FROM public.seguranca_tentativa_login
    WHERE identificador_hash = v_hash
      AND sucesso = false
      AND criado_em > (now() - interval '15 minutes');

    SELECT COUNT(*)
    INTO v_falhas_ip
    FROM public.seguranca_tentativa_login
    WHERE ip = v_ip
      AND sucesso = false
      AND criado_em > (now() - interval '15 minutes');

    IF v_falhas_id >= 5 OR v_falhas_ip >= 10 THEN
        v_segundos_restantes := GREATEST(
            60,
            EXTRACT(EPOCH FROM ((COALESCE(v_ultima_falha, now()) + interval '15 minutes') - now()))::INT
        );
        RETURN jsonb_build_object(
            'bloqueado', true,
            'tentativas', GREATEST(v_falhas_id, v_falhas_ip),
            'segundos_restantes', v_segundos_restantes
        );
    END IF;

    RETURN jsonb_build_object(
        'bloqueado', false,
        'tentativas', v_falhas_id,
        'segundos_restantes', 0
    );
END;
$$;

-- 6.2. Registra tentativa de login (sucesso ou falha) e grava trilha de auditoria
CREATE OR REPLACE FUNCTION public.registrar_evento_login(
    p_identificador TEXT,
    p_sucesso BOOLEAN,
    p_motivo TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_uid UUID;
    v_usuario RECORD;
BEGIN
    v_hash := encode(digest(LOWER(TRIM(COALESCE(p_identificador, ''))), 'sha256'), 'hex');
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();
    v_uid := auth.uid();

    INSERT INTO public.seguranca_tentativa_login (identificador_hash, ip, sucesso, motivo, user_agent)
    VALUES (v_hash, v_ip, COALESCE(p_sucesso, false), LEFT(COALESCE(p_motivo, ''), 120), v_ua);

    -- Se autenticou com sucesso, limpa falhas recentes deste identificador para evitar falso bloqueio posterior
    IF p_sucesso = true AND v_uid IS NOT NULL THEN
        SELECT id, tenant_id, perfil INTO v_usuario
        FROM public.usuario
        WHERE auth_user_id = v_uid
        LIMIT 1;

        INSERT INTO public.log_auditoria (
            tenant_id,
            usuario_id,
            usuario_email_hash,
            acao,
            recurso,
            justificativa,
            ip,
            user_agent,
            nivel,
            visivel_tenant
        ) VALUES (
            v_usuario.tenant_id,
            v_usuario.id,
            v_hash,
            CASE WHEN v_usuario.perfil = 'super_admin' THEN 'LOGIN_SUPER_ADMIN_ETAPA1' ELSE 'LOGIN_SUCESSO' END,
            'Autenticação do Sistema',
            COALESCE(p_motivo, 'Sessão autenticada'),
            v_ip,
            v_ua,
            'INFO',
            CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
        );
    ELSE
        -- Tenta localizar tenant sem vazar existência para o cliente
        SELECT id, tenant_id, perfil INTO v_usuario
        FROM public.usuario
        WHERE LOWER(email) = LOWER(TRIM(COALESCE(p_identificador, '')))
        LIMIT 1;

        INSERT INTO public.log_auditoria (
            tenant_id,
            usuario_id,
            usuario_email_hash,
            acao,
            recurso,
            justificativa,
            ip,
            user_agent,
            nivel,
            visivel_tenant
        ) VALUES (
            v_usuario.tenant_id,
            v_usuario.id,
            v_hash,
            'LOGIN_FALHA',
            'Autenticação do Sistema',
            LEFT(COALESCE(p_motivo, 'Credenciais inválidas'), 200),
            v_ip,
            v_ua,
            'WARN',
            CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
        );
    END IF;
END;
$$;

-- 6.3. Valida contexto completo do Super Admin (AAL2 2FA + IP Allowlist + Dispositivo Confiável)
CREATE OR REPLACE FUNCTION public.validar_contexto_super_admin(p_device_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_usuario RECORD;
    v_politica RECORD;
    v_aal TEXT;
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_token_hash VARCHAR(64);
    v_dispositivo_id UUID;
BEGIN
    v_uid := auth.uid();
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('autorizado', false, 'codigo', 'NAO_AUTENTICADO', 'ip_atual', v_ip);
    END IF;

    SELECT id, nome, email, perfil, ativo
    INTO v_usuario
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND perfil = 'super_admin'
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_usuario.id IS NULL THEN
        RETURN jsonb_build_object('autorizado', false, 'codigo', 'PERFIL_INVALIDO', 'ip_atual', v_ip);
    END IF;

    v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
    IF v_aal <> 'aal2' THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'codigo', 'MFA_OBRIGATORIO',
            'aal_atual', v_aal,
            'ip_atual', v_ip
        );
    END IF;

    SELECT * INTO v_politica
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario.id;

    -- 1. Validação de IP Permitido
    IF COALESCE(v_politica.restringir_ip, false) = true THEN
        IF NOT (v_ip = ANY(COALESCE(v_politica.ips_permitidos, '{}'))) THEN
            INSERT INTO public.log_auditoria (
                tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
            ) VALUES (
                NULL, v_usuario.id, 'BLOQUEIO_IP_SUPER_ADMIN', 'Portal da Plataforma',
                'Acesso negado para IP fora da allowlist: ' || v_ip, v_ip, v_ua, 'CRITICAL', false
            );
            RETURN jsonb_build_object(
                'autorizado', false,
                'codigo', 'IP_NAO_AUTORIZADO',
                'ip_atual', v_ip
            );
        END IF;
    END IF;

    -- 2. Validação de Dispositivo Confiável
    IF p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 0 THEN
        v_token_hash := encode(digest(TRIM(p_device_token), 'sha256'), 'hex');
        SELECT id INTO v_dispositivo_id
        FROM public.super_admin_dispositivo
        WHERE usuario_id = v_usuario.id
          AND token_hash = v_token_hash
          AND revogado_em IS NULL
        LIMIT 1;

        IF v_dispositivo_id IS NOT NULL THEN
            UPDATE public.super_admin_dispositivo
            SET ultimo_acesso_em = now(), ip_registro = v_ip
            WHERE id = v_dispositivo_id;
        END IF;
    END IF;

    IF COALESCE(v_politica.exigir_dispositivo_confiavel, false) = true AND v_dispositivo_id IS NULL THEN
        INSERT INTO public.log_auditoria (
            tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
        ) VALUES (
            NULL, v_usuario.id, 'BLOQUEIO_DISPOSITIVO_SUPER_ADMIN', 'Portal da Plataforma',
            'Tentativa em dispositivo não confiável / sem token válido', v_ip, v_ua, 'CRITICAL', false
        );
        RETURN jsonb_build_object(
            'autorizado', false,
            'codigo', 'DISPOSITIVO_NAO_CONFIAVEL',
            'ip_atual', v_ip
        );
    END IF;

    -- Registra acesso verificado com 2FA AAL2 na trilha de auditoria
    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario.id, 'ACESSO_VERIFICADO_2FA', 'Sessão Super Admin (AAL2)',
        'Autenticação multifator e políticas Zero-Trust validadas com sucesso', v_ip, v_ua, 'INFO', false
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'codigo', 'OK',
        'ip_atual', v_ip,
        'dispositivo_reconhecido', (v_dispositivo_id IS NOT NULL),
        'restringir_ip', COALESCE(v_politica.restringir_ip, false),
        'ips_permitidos', COALESCE(v_politica.ips_permitidos, '{}'),
        'exigir_dispositivo_confiavel', COALESCE(v_politica.exigir_dispositivo_confiavel, false)
    );
END;
$$;

-- 6.4. Cadastra Dispositivo Confiável (exige Super Admin com 2FA AAL2 ativo)
CREATE OR REPLACE FUNCTION public.registrar_dispositivo_super_admin(
    p_nome_dispositivo TEXT,
    p_token_plain TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_usuario_id UUID;
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_id UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige autenticação Super Admin com 2FA (AAL2).';
    END IF;

    IF LENGTH(TRIM(COALESCE(p_token_plain, ''))) < 32 THEN
        RAISE EXCEPTION 'Token de dispositivo inválido.';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_hash := encode(digest(TRIM(p_token_plain), 'sha256'), 'hex');
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();

    INSERT INTO public.super_admin_dispositivo (usuario_id, nome_dispositivo, token_hash, ip_registro, user_agent)
    VALUES (v_usuario_id, LEFT(TRIM(COALESCE(p_nome_dispositivo, 'Estação Principal')), 120), v_hash, v_ip, v_ua)
    RETURNING id INTO v_id;

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario_id, 'CADASTRO_DISPOSITIVO_CONFIAVEL', LEFT(TRIM(p_nome_dispositivo), 120),
        'Novo dispositivo confiável autorizado via 2FA', v_ip, v_ua, 'INFO', false
    );

    RETURN v_id;
END;
$$;

-- 6.5. Atualiza Política de Restrição de IP / Dispositivo (com trava anti-lockout acidental)
CREATE OR REPLACE FUNCTION public.atualizar_politica_super_admin(
    p_restringir_ip BOOLEAN,
    p_ips_permitidos TEXT[],
    p_exigir_dispositivo BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_ip VARCHAR(64);
    v_qtd_disp INT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige Super Admin com 2FA (AAL2).';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_ip := public.request_client_ip();

    IF p_restringir_ip = true AND (p_ips_permitidos IS NULL OR array_length(p_ips_permitidos, 1) IS NULL) THEN
        RAISE EXCEPTION 'Cadastre ao menos um endereço IP válido (ex: %) antes de ativar a restrição por IP.', v_ip;
    END IF;

    IF p_exigir_dispositivo = true THEN
        SELECT COUNT(*) INTO v_qtd_disp
        FROM public.super_admin_dispositivo
        WHERE usuario_id = v_usuario_id AND revogado_em IS NULL;

        IF v_qtd_disp = 0 THEN
            RAISE EXCEPTION 'Autorize primeiro este navegador/computador como Dispositivo Confiável antes de exigir a trava.';
        END IF;
    END IF;

    INSERT INTO public.super_admin_politica (
        usuario_id, mfa_obrigatorio, restringir_ip, ips_permitidos, exigir_dispositivo_confiavel, atualizado_em
    ) VALUES (
        v_usuario_id, true, COALESCE(p_restringir_ip, false), COALESCE(p_ips_permitidos, '{}'), COALESCE(p_exigir_dispositivo, false), now()
    )
    ON CONFLICT (usuario_id) DO UPDATE SET
        restringir_ip = EXCLUDED.restringir_ip,
        ips_permitidos = EXCLUDED.ips_permitidos,
        exigir_dispositivo_confiavel = EXCLUDED.exigir_dispositivo_confiavel,
        atualizado_em = now();

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario_id, 'ATUALIZACAO_POLITICA_ZERO_TRUST', 'Política Super Admin',
        format('restringir_ip=%s, exigir_dispositivo=%s', p_restringir_ip, p_exigir_dispositivo),
        v_ip, public.request_user_agent(), 'WARN', false
    );
END;
$$;

-- 6.6. Ativa Break-Glass Auditado por 30 minutos (visível ao Tenant conforme LGPD)
CREATE OR REPLACE FUNCTION public.ativar_break_glass_suporte(
    p_tenant_id UUID,
    p_justificativa TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_ip VARCHAR(64);
    v_id UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige Super Admin autenticado com 2FA.';
    END IF;

    IF LENGTH(TRIM(COALESCE(p_justificativa, ''))) < 10 THEN
        RAISE EXCEPTION 'A justificativa técnica deve conter ao menos 10 caracteres para fins de auditoria LGPD.';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_ip := public.request_client_ip();

    UPDATE public.super_admin_break_glass
    SET ativo = false
    WHERE usuario_id = v_usuario_id AND ativo = true;

    INSERT INTO public.super_admin_break_glass (usuario_id, tenant_id, justificativa, ip)
    VALUES (v_usuario_id, p_tenant_id, TRIM(p_justificativa), v_ip)
    RETURNING id INTO v_id;

    -- Este registro É visivel_tenant = true por transparência contratual LGPD (Seção 6.7)
    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        p_tenant_id, NULL, 'SUPORTE_EMERGENCIAL_BREAK_GLASS', 'Ambiente Operacional do Tenant',
        TRIM(p_justificativa), v_ip, public.request_user_agent(), 'WARN', true
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_break_glass_suporte()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.super_admin_break_glass
    SET ativo = false
    WHERE usuario_id = public.current_usuario_id() AND ativo = true;
END;
$$;

-- 6.7. Registra evento geral de auditoria LGPD / Operacional
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
    p_acao TEXT,
    p_recurso TEXT,
    p_justificativa TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_usuario RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    SELECT id, tenant_id, perfil INTO v_usuario
    FROM public.usuario
    WHERE auth_user_id = v_uid
    LIMIT 1;

    IF v_usuario.id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.log_auditoria (
        tenant_id,
        usuario_id,
        acao,
        recurso,
        justificativa,
        ip,
        user_agent,
        nivel,
        visivel_tenant
    ) VALUES (
        COALESCE(v_usuario.tenant_id, public.active_break_glass_tenant_id()),
        CASE WHEN v_usuario.perfil = 'super_admin' THEN NULL ELSE v_usuario.id END,
        LEFT(TRIM(p_acao), 100),
        LEFT(TRIM(p_recurso), 255),
        LEFT(p_justificativa, 500),
        public.request_client_ip(),
        public.request_user_agent(),
        'INFO',
        CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
    );
END;
$$;

-- ====================================================================
-- 7. Permissões Explícitas de Papéis (Princípio do Menor Privilégio)
-- ====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.tenant,
    public.config_tenant,
    public.usuario,
    public.cliente,
    public.classificacao,
    public.fornecedor,
    public.compra_item,
    public.encomenda,
    public.encomenda_item,
    public.pagamento,
    public.importacao_xml,
    public.notificacao,
    public.reserva,
    public.reserva_item,
    public.funcionario,
    public.super_admin_politica,
    public.super_admin_dispositivo,
    public.super_admin_break_glass
TO authenticated;

GRANT SELECT, INSERT ON public.evento_historico, public.log_auditoria TO authenticated;

-- Anon pode APENAS consultar rate-limit e registrar evento de login
REVOKE ALL ON FUNCTION public.registrar_dispositivo_super_admin(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.atualizar_politica_super_admin(BOOLEAN, TEXT[], BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.ativar_break_glass_suporte(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verificar_bloqueio_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_login(TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_contexto_super_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_dispositivo_super_admin(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_politica_super_admin(BOOLEAN, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_break_glass_suporte(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_break_glass_suporte() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, TEXT) TO authenticated;
