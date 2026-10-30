-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 12
-- Correções da auditoria de segurança (QA/Cibersegurança)
--   1. Segredos de WhatsApp saem de config_tenant (legível por todo o tenant)
--      para tabela blindada, acessível só via RPC e só por Admin/Super Admin.
--   2. Empresa SUSPENSA/CANCELADA passa a ser bloqueada no banco (RLS),
--      e não apenas "marcada" na interface.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Tabela blindada de credenciais de servidor WhatsApp próprio
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_tenant_whatsapp_segredo (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenant(id) ON DELETE CASCADE,
    api_url TEXT,
    api_key TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.config_tenant_whatsapp_segredo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_tenant_whatsapp_segredo FORCE ROW LEVEL SECURITY;

-- Nenhuma policy = nenhum acesso direto via PostgREST. Só as funções abaixo (SECURITY DEFINER).
REVOKE ALL ON public.config_tenant_whatsapp_segredo FROM PUBLIC, anon, authenticated;

-- Migra valores eventualmente já gravados na migração 11 e remove as colunas expostas
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'config_tenant' AND column_name = 'whatsapp_api_key'
    ) THEN
        INSERT INTO public.config_tenant_whatsapp_segredo (tenant_id, api_url, api_key)
        SELECT tenant_id, NULLIF(whatsapp_api_url, ''), NULLIF(whatsapp_api_key, '')
        FROM public.config_tenant
        WHERE NULLIF(whatsapp_api_key, '') IS NOT NULL OR NULLIF(whatsapp_api_url, '') IS NOT NULL
        ON CONFLICT (tenant_id) DO NOTHING;
    END IF;
END $$;

ALTER TABLE public.config_tenant
    DROP COLUMN IF EXISTS whatsapp_api_url,
    DROP COLUMN IF EXISTS whatsapp_api_key,
    DROP COLUMN IF EXISTS whatsapp_numero_conectado;

-- Autorização comum: Admin do próprio tenant OU Super Admin com Break-Glass ativo nesse tenant
CREATE OR REPLACE FUNCTION public.pode_gerir_whatsapp_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p_tenant_id IS NOT NULL
        AND (
            (p_tenant_id = public.current_tenant_id() AND public.current_usuario_perfil() = 'admin')
            OR (public.is_super_admin() AND p_tenant_id = public.active_break_glass_tenant_id())
        );
$$;

-- A LEITURA da chave NÃO é exposta por RPC: operadores também enviam mensagens e uma RPC
-- liberada a "authenticated" entregaria a chave a qualquer funcionário do tenant.
-- Quem lê a chave é apenas o backend (/api/whatsapp) usando SUPABASE_SERVICE_ROLE_KEY
-- (variável exclusiva de servidor), depois de validar o tenant do usuário sob RLS.
GRANT SELECT ON public.config_tenant_whatsapp_segredo TO service_role;

-- Status seguro para a tela de configuração (nunca devolve a chave)
CREATE OR REPLACE FUNCTION public.status_whatsapp_credenciais(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
BEGIN
    IF NOT public.pode_gerir_whatsapp_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Operação negada.';
    END IF;

    SELECT api_url, (api_key IS NOT NULL AND api_key <> '') AS chave_configurada
    INTO v_row
    FROM public.config_tenant_whatsapp_segredo
    WHERE tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'api_url', COALESCE(v_row.api_url, ''),
        'chave_configurada', COALESCE(v_row.chave_configurada, false)
    );
END;
$$;

-- Gravação (p_api_key NULL = mantém a atual; '' = remove)
CREATE OR REPLACE FUNCTION public.salvar_whatsapp_credenciais(
    p_tenant_id UUID,
    p_api_url TEXT,
    p_api_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT := NULLIF(BTRIM(COALESCE(p_api_url, '')), '');
BEGIN
    IF NOT public.pode_gerir_whatsapp_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Operação negada.';
    END IF;

    IF v_url IS NOT NULL AND v_url !~* '^https://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{2,5})?(/[^[:space:]]*)?$' THEN
        RAISE EXCEPTION 'A URL do servidor deve usar https:// e ser um endereço público válido.';
    END IF;

    INSERT INTO public.config_tenant_whatsapp_segredo (tenant_id, api_url, api_key, atualizado_em)
    VALUES (p_tenant_id, v_url, NULLIF(p_api_key, ''), now())
    ON CONFLICT (tenant_id) DO UPDATE
    SET api_url = v_url,
        api_key = CASE
            WHEN p_api_key IS NULL THEN public.config_tenant_whatsapp_segredo.api_key
            ELSE NULLIF(p_api_key, '')
        END,
        atualizado_em = now();

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        p_tenant_id, public.current_usuario_id(), 'ATUALIZACAO_CREDENCIAIS_WHATSAPP',
        'Servidor WhatsApp próprio', 'Credenciais atualizadas (valores não registrados)',
        public.request_client_ip(), public.request_user_agent(), 'INFO', true
    );

    RETURN jsonb_build_object('sucesso', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pode_gerir_whatsapp_tenant(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.status_whatsapp_credenciais(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_whatsapp_credenciais(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_whatsapp_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.status_whatsapp_credenciais(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_whatsapp_credenciais(UUID, TEXT, TEXT) TO authenticated;

-- --------------------------------------------------------------------
-- 2. Empresa suspensa/cancelada NÃO acessa mais dados (bloqueio no RLS)
--    Super Admin em Break-Glass continua podendo entrar para suporte.
-- --------------------------------------------------------------------
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

    SELECT u.tenant_id INTO v_tenant
    FROM public.usuario u
    JOIN public.tenant t ON t.id = u.tenant_id
    WHERE u.auth_user_id = v_uid
      AND u.ativo = true
      AND u.excluido_em IS NULL
      AND t.status = 'ativo'
    LIMIT 1;

    IF v_tenant IS NOT NULL THEN
        RETURN v_tenant;
    END IF;

    -- Super Admin com Break-Glass ativo e auditado (suporte pode atuar mesmo em empresa suspensa)
    RETURN public.active_break_glass_tenant_id();
END;
$$;

NOTIFY pgrst, 'reload schema';
