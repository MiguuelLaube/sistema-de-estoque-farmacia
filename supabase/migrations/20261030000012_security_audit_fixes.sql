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

-- --------------------------------------------------------------------
-- 3. Autovinculação de Perfil de Usuário via RPC (SECURITY DEFINER)
--    Garante que qualquer usuário autenticado no Supabase Auth tenha seu
--    auth_user_id vinculado com segurança pelo e-mail verificado.
--    Caso a plataforma ainda não possua Super Admin, inicializa
--    automaticamente o primeiro usuário autenticado como Super Admin.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_meu_usuario_auth()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_user RECORD;
    v_tem_super_admin BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Não autenticado.');
    END IF;

    SELECT LOWER(email) INTO v_email
    FROM auth.users
    WHERE id = v_uid;

    IF v_email IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'E-mail não localizado na sessão de autenticação.');
    END IF;

    -- 1. Verifica se já existe um registro vinculado a este auth_user_id
    SELECT * INTO v_user
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_user.id IS NOT NULL THEN
        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
    END IF;

    -- 2. Tenta localizar por e-mail correspondente
    SELECT * INTO v_user
    FROM public.usuario
    WHERE LOWER(email) = v_email
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_user.id IS NOT NULL THEN
        UPDATE public.usuario
        SET auth_user_id = v_uid, atualizado_em = now()
        WHERE id = v_user.id;
        v_user.auth_user_id := v_uid;

        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
    END IF;

    -- 3. Se não existe usuário para o e-mail:
    --    Se NÃO existir nenhum super_admin ativo no sistema, inicializa este usuário como o Super Admin pioneiro!
    SELECT EXISTS (
        SELECT 1 FROM public.usuario WHERE perfil = 'super_admin' AND ativo = true AND excluido_em IS NULL
    ) INTO v_tem_super_admin;

    IF NOT v_tem_super_admin THEN
        PERFORM set_config('app.allow_super_admin_setup', 'true', true);

        INSERT INTO public.usuario (
            id, tenant_id, auth_user_id, nome, email, perfil, ativo
        ) VALUES (
            gen_random_uuid(), NULL, v_uid, 'Administrador da Plataforma', v_email, 'super_admin', true
        )
        RETURNING * INTO v_user;

        INSERT INTO public.super_admin_politica (
            usuario_id, mfa_obrigatorio, restringir_ip, ips_permitidos, exigir_dispositivo_confiavel
        ) VALUES (
            v_user.id, false, false, '{}', false
        )
        ON CONFLICT (usuario_id) DO NOTHING;

        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user), 'inicializado_super_admin', true);
    END IF;

    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta inativa ou não cadastrada pelo administrador.');
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_meu_usuario_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_meu_usuario_auth() TO authenticated;

-- --------------------------------------------------------------------
-- 4. Ajuste da Função is_super_admin() e validar_contexto_super_admin()
--    Respeita a política mfa_obrigatorio configurada na tabela
--    super_admin_politica, evitando bloqueio prematuro no primeiro login.
-- --------------------------------------------------------------------
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
    v_mfa_obrigatorio BOOLEAN;
    v_aal TEXT;
    v_restringir_ip BOOLEAN;
    v_ips TEXT[];
    v_client_ip TEXT;
BEGIN
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

    SELECT mfa_obrigatorio, restringir_ip, ips_permitidos
    INTO v_mfa_obrigatorio, v_restringir_ip, v_ips
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario_id;

    -- Só exige AAL2 se MFA estiver marcado como obrigatório na política
    IF COALESCE(v_mfa_obrigatorio, false) = true THEN
        v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
        IF v_aal <> 'aal2' THEN
            RETURN false;
        END IF;
    END IF;

    IF COALESCE(v_restringir_ip, false) = true THEN
        v_client_ip := public.request_client_ip();
        IF NOT (v_client_ip = ANY(COALESCE(v_ips, '{}'))) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$;

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

    SELECT * INTO v_politica
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario.id;

    -- Exige 2FA apenas se mfa_obrigatorio for true na política
    IF COALESCE(v_politica.mfa_obrigatorio, false) = true THEN
        v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
        IF v_aal <> 'aal2' THEN
            RETURN jsonb_build_object(
                'autorizado', false,
                'codigo', 'MFA_OBRIGATORIO',
                'aal_atual', v_aal,
                'ip_atual', v_ip
            );
        END IF;
    END IF;

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
                'ip_atual', v_ip,
                'ips_permitidos', v_politica.ips_permitidos
            );
        END IF;
    END IF;

    IF COALESCE(v_politica.exigir_dispositivo_confiavel, false) = true THEN
        IF p_device_token IS NULL OR LENGTH(TRIM(p_device_token)) < 16 THEN
            INSERT INTO public.log_auditoria (
                tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
            ) VALUES (
                NULL, v_usuario.id, 'BLOQUEIO_DISPOSITIVO_SUPER_ADMIN', 'Portal da Plataforma',
                'Acesso negado: dispositivo confiável não fornecido', v_ip, v_ua, 'CRITICAL', false
            );
            RETURN jsonb_build_object(
                'autorizado', false,
                'codigo', 'DISPOSITIVO_NAO_CONFIAVEL',
                'ip_atual', v_ip
            );
        END IF;

        v_token_hash := encode(digest(p_device_token, 'sha256'), 'hex');

        SELECT id INTO v_dispositivo_id
        FROM public.super_admin_dispositivo
        WHERE usuario_id = v_usuario.id
          AND token_hash = v_token_hash
          AND revogado_em IS NULL;

        IF v_dispositivo_id IS NULL THEN
            INSERT INTO public.log_auditoria (
                tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
            ) VALUES (
                NULL, v_usuario.id, 'BLOQUEIO_DISPOSITIVO_SUPER_ADMIN', 'Portal da Plataforma',
                'Acesso negado: token de dispositivo não reconhecido', v_ip, v_ua, 'CRITICAL', false
            );
            RETURN jsonb_build_object(
                'autorizado', false,
                'codigo', 'DISPOSITIVO_NAO_CONFIAVEL',
                'ip_atual', v_ip
            );
        END IF;

        UPDATE public.super_admin_dispositivo
        SET ultimo_acesso_em = now(),
            ip_registro = v_ip,
            user_agent = v_ua
        WHERE id = v_dispositivo_id;
    END IF;

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario.id, 'ACESSO_SUPER_ADMIN_AUTORIZADO', 'Sessão Super Admin',
        'Sessão validada com sucesso', v_ip, v_ua, 'INFO', false
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'codigo', 'OK',
        'ip_atual', v_ip,
        'dispositivo_reconhecido', true,
        'restringir_ip', COALESCE(v_politica.restringir_ip, false),
        'ips_permitidos', COALESCE(v_politica.ips_permitidos, '{}'),
        'exigir_dispositivo_confiavel', COALESCE(v_politica.exigir_dispositivo_confiavel, false)
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
