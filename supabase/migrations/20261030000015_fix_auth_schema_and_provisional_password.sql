-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 15
-- Correção Definitiva de Schema em auth.users, Saneamento de Tokens,
-- Vinculação em auth.identities e Fluxo Confiável de Senha Provisória
-- ====================================================================

-- 1. Garante as colunas de controle de primeiro acesso e expiração na tabela usuario
ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS exigir_troca_senha BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS senha_provisoria_ativa BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS senha_provisoria_expira_em TIMESTAMPTZ DEFAULT NULL;

-- 2. SANEAMENTO EM auth.users (Elimina a causa raiz do erro "Database error querying schema")
-- O servidor GoTrue do Supabase falha com 500 se qualquer coluna de token em auth.users contiver NULL
UPDATE auth.users
SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmed_at = COALESCE(confirmed_at, now())
WHERE 
    confirmation_token IS NULL 
    OR recovery_token IS NULL 
    OR email_change IS NULL 
    OR email_change_token_new IS NULL 
    OR email_change_token_current IS NULL 
    OR phone_change IS NULL 
    OR phone_change_token IS NULL 
    OR reauthentication_token IS NULL;

-- 3. VINCULAÇÃO EM auth.identities (Obrigatória para o GoTrue validar login por e-mail/senha)
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT 
    u.id,
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', LOWER(u.email)),
    'email',
    u.id::text,
    u.last_sign_in_at,
    u.created_at,
    now()
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i 
    WHERE i.user_id = u.id AND i.provider = 'email'
);

-- 4. FUNÇÃO CENTRALIZADA DE GESTÃO DE USUÁRIO AUTH (SECURITY DEFINER)
-- Insere ou atualiza usuários em auth.users garantindo todos os campos exigidos pelo GoTrue
CREATE OR REPLACE FUNCTION public.gerenciar_auth_user(
    p_user_id UUID,
    p_email TEXT,
    p_password TEXT,
    p_nome TEXT,
    p_exigir_troca BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_uid UUID := p_user_id;
    v_email TEXT := LOWER(TRIM(p_email));
    v_hash TEXT;
BEGIN
    v_hash := crypt(p_password, gen_salt('bf'));

    SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_uid IS NULL THEN
        v_uid := COALESCE(p_user_id, gen_random_uuid());
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            invited_at,
            confirmation_token,
            confirmation_sent_at,
            recovery_token,
            recovery_sent_at,
            email_change_token_new,
            email_change,
            email_change_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at,
            phone,
            phone_confirmed_at,
            phone_change,
            phone_change_token,
            phone_change_sent_at,
            confirmed_at,
            email_change_token_current,
            email_change_confirm_status,
            banned_until,
            reauthentication_token,
            reauthentication_sent_at,
            is_sso_user,
            deleted_at,
            is_anonymous
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_uid,
            'authenticated',
            'authenticated',
            v_email,
            v_hash,
            now(),
            NULL,
            '',    -- confirmation_token (NUNCA NULL)
            NULL,
            '',    -- recovery_token (NUNCA NULL)
            NULL,
            '',    -- email_change_token_new (NUNCA NULL)
            '',    -- email_change (NUNCA NULL)
            NULL,
            NULL,
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('nome', p_nome, 'exigir_troca_senha', p_exigir_troca),
            false,
            now(),
            now(),
            NULL,
            NULL,
            '',    -- phone_change
            '',    -- phone_change_token
            NULL,
            now(), -- confirmed_at
            '',    -- email_change_token_current
            0,
            NULL,
            '',    -- reauthentication_token
            NULL,
            false,
            NULL,
            false
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_hash,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            confirmed_at = COALESCE(confirmed_at, now()),
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change = COALESCE(email_change, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change_token_current = COALESCE(email_change_token_current, ''),
            phone_change = COALESCE(phone_change, ''),
            phone_change_token = COALESCE(phone_change_token, ''),
            reauthentication_token = COALESCE(reauthentication_token, ''),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', p_nome, 'exigir_troca_senha', p_exigir_troca),
            updated_at = now()
        WHERE id = v_uid;
    END IF;

    -- Garante a identidade em auth.identities
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email') THEN
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_uid,
            v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_email),
            'email',
            v_uid::text,
            NULL,
            now(),
            now()
        );
    ELSE
        UPDATE auth.identities
        SET identity_data = jsonb_build_object('sub', v_uid::text, 'email', v_email),
            updated_at = now()
        WHERE user_id = v_uid AND provider = 'email';
    END IF;

    RETURN v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gerenciar_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, anon;

-- 5. ATUALIZA A RPC DE PROVISIONAMENTO DE EMPRESA COM SENHA PROVISÓRIA
CREATE OR REPLACE FUNCTION public.provisionar_empresa_com_admin(
    p_nome_empresa TEXT,
    p_slug TEXT,
    p_plano TEXT DEFAULT 'basico',
    p_limite INTEGER DEFAULT 300,
    p_email_admin TEXT DEFAULT NULL,
    p_nome_admin TEXT DEFAULT 'Administrador',
    p_senha_provisoria TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_slug_limpo TEXT;
    v_email_limpo TEXT;
    v_auth_user_id UUID;
    v_senha_final TEXT;
    v_expira_em TIMESTAMPTZ := now() + interval '7 days';
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação negada: somente o Super Administrador pode cadastrar novas farmácias.';
    END IF;

    v_slug_limpo := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-z0-9-]', '', 'g'));
    IF EXISTS (SELECT 1 FROM public.tenant WHERE slug = v_slug_limpo) THEN
        RAISE EXCEPTION 'O identificador (slug) "%" já está em uso por outra empresa.', v_slug_limpo;
    END IF;

    v_email_limpo := NULLIF(LOWER(TRIM(COALESCE(p_email_admin, ''))), '');
    v_senha_final := COALESCE(NULLIF(TRIM(p_senha_provisoria), ''), 'EncoMed@' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'));

    INSERT INTO public.tenant (id, nome_empresa, slug, dominio, email_admin, status, plano, limite_encomendas_mes)
    VALUES (v_tenant_id, TRIM(p_nome_empresa), v_slug_limpo, v_slug_limpo || '.plataforma.com.br', v_email_limpo, 'ativo', COALESCE(p_plano, 'basico'), COALESCE(p_limite, 300));

    INSERT INTO public.config_tenant (tenant_id, nome_sistema, cor_primaria, cor_secundaria, header_title, whatsapp_instance_name)
    VALUES (v_tenant_id, TRIM(p_nome_empresa) || ' Encomendas', '#2563eb', '#1e293b', UPPER(TRIM(p_nome_empresa)), 'encomed_' || v_slug_limpo)
    ON CONFLICT (tenant_id) DO NOTHING;

    IF v_email_limpo IS NOT NULL THEN
        -- Cria ou atualiza com segurança em auth.users e auth.identities
        v_auth_user_id := public.gerenciar_auth_user(
            NULL,
            v_email_limpo,
            v_senha_final,
            COALESCE(p_nome_admin, 'Administrador'),
            true
        );

        IF EXISTS (SELECT 1 FROM public.usuario WHERE tenant_id = v_tenant_id AND LOWER(email) = v_email_limpo) THEN
            UPDATE public.usuario
            SET auth_user_id = v_auth_user_id,
                perfil = 'admin',
                ativo = true,
                exigir_troca_senha = true,
                senha_provisoria_ativa = true,
                senha_provisoria_expira_em = v_expira_em,
                nome = COALESCE(p_nome_admin, 'Administrador')
            WHERE tenant_id = v_tenant_id AND LOWER(email) = v_email_limpo;
        ELSE
            INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo, exigir_troca_senha, senha_provisoria_ativa, senha_provisoria_expira_em)
            VALUES (gen_random_uuid(), v_tenant_id, v_auth_user_id, COALESCE(p_nome_admin, 'Administrador'), v_email_limpo, 'admin', true, true, true, v_expira_em);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'sucesso', true,
        'tenant_id', v_tenant_id,
        'senha_provisoria', v_senha_final,
        'email_admin', v_email_limpo,
        'expira_em', v_expira_em
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- 6. ATUALIZA A RPC DE REDEFINIÇÃO DE SENHA PROVISÓRIA
CREATE OR REPLACE FUNCTION public.redefinir_senha_provisoria_tenant(
    p_tenant_id UUID,
    p_senha_provisoria TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_row RECORD;
    v_auth_user_id UUID;
    v_senha_final TEXT;
    v_expira_em TIMESTAMPTZ := now() + interval '7 days';
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação negada: somente o Super Administrador pode redefinir senhas provisórias.';
    END IF;

    SELECT u.id, u.email, u.auth_user_id, u.nome
    INTO v_user_row
    FROM public.usuario u
    WHERE u.tenant_id = p_tenant_id
      AND u.perfil = 'admin'
      AND u.ativo = true
      AND u.excluido_em IS NULL
    ORDER BY u.criado_em ASC
    LIMIT 1;

    IF v_user_row.id IS NULL THEN
        RAISE EXCEPTION 'Nenhum administrador ativo encontrado para esta empresa.';
    END IF;

    v_senha_final := COALESCE(NULLIF(TRIM(p_senha_provisoria), ''), 'EncoMed@' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'));

    -- Atualiza em auth.users e auth.identities
    v_auth_user_id := public.gerenciar_auth_user(
        v_user_row.auth_user_id,
        v_user_row.email,
        v_senha_final,
        COALESCE(v_user_row.nome, 'Administrador'),
        true
    );

    UPDATE public.usuario
    SET auth_user_id = v_auth_user_id,
        exigir_troca_senha = true,
        senha_provisoria_ativa = true,
        senha_provisoria_expira_em = v_expira_em
    WHERE id = v_user_row.id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'email', v_user_row.email,
        'nome', v_user_row.nome,
        'senha_provisoria', v_senha_final,
        'expira_em', v_expira_em,
        'mensagem', 'Nova senha provisória gerada com sucesso.'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.redefinir_senha_provisoria_tenant(UUID, TEXT) TO authenticated;

-- 7. Atualiza o cache do PostgREST
NOTIFY pgrst, 'reload schema';
