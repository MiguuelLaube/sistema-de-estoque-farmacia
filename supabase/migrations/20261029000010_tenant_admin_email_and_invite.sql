-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 10
-- E-mail Personalizado de Gestores por Empresa e Convite com Link de Senha
-- ====================================================================

-- 1. Coluna de e-mail do administrador/gestor da empresa
ALTER TABLE public.tenant
    ADD COLUMN IF NOT EXISTS email_admin VARCHAR(255);

-- Preenche e-mails padrão nos tenants de exemplo caso estejam nulos
UPDATE public.tenant
SET email_admin = 'gestor@drogariaaeroporto.com.br'
WHERE slug = 'aeroporto' AND email_admin IS NULL;

UPDATE public.tenant
SET email_admin = 'gestor@farmaciaboaesperanca.com.br'
WHERE slug = 'boaesperanca' AND email_admin IS NULL;

-- 2. Permite que Super Admin crie e gerencie usuários vinculados a qualquer tenant
DROP POLICY IF EXISTS usuario_super_admin_all ON public.usuario;
CREATE POLICY usuario_super_admin_all ON public.usuario
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 3. Função RPC para provisionar nova empresa junto com a conta de admin vinculada
CREATE OR REPLACE FUNCTION public.provisionar_empresa_com_admin(
    p_nome_empresa TEXT,
    p_slug TEXT,
    p_plano TEXT DEFAULT 'basico',
    p_limite INTEGER DEFAULT 300,
    p_email_admin TEXT DEFAULT NULL,
    p_nome_admin TEXT DEFAULT 'Administrador'
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
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação negada: somente o Super Administrador pode provisionar novas empresas.';
    END IF;

    v_slug_limpo := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-z0-9-]', '', 'g'));
    IF LENGTH(v_slug_limpo) < 2 THEN
        RAISE EXCEPTION 'Identificador (slug) inválido.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenant WHERE slug = v_slug_limpo) THEN
        RAISE EXCEPTION 'O identificador "%" já está em uso por outra empresa.', v_slug_limpo;
    END IF;

    v_email_limpo := NULLIF(LOWER(TRIM(COALESCE(p_email_admin, ''))), '');

    -- Cria o Tenant
    INSERT INTO public.tenant (
        id,
        nome_empresa,
        slug,
        dominio,
        email_admin,
        status,
        plano,
        limite_encomendas_mes
    ) VALUES (
        v_tenant_id,
        TRIM(p_nome_empresa),
        v_slug_limpo,
        v_slug_limpo || '.plataforma.com.br',
        v_email_limpo,
        'ativo',
        COALESCE(p_plano, 'basico'),
        COALESCE(p_limite, 300)
    );

    -- Cria a Configuração Inicial do Tenant
    INSERT INTO public.config_tenant (
        tenant_id,
        nome_sistema,
        cor_primaria,
        cor_secundaria,
        header_title
    ) VALUES (
        v_tenant_id,
        TRIM(p_nome_empresa) || ' Encomendas',
        '#2563eb',
        '#1e293b',
        UPPER(TRIM(p_nome_empresa))
    );

    -- Se um e-mail de administrador foi informado, cadastra em auth.users e em public.usuario
    IF v_email_limpo IS NOT NULL THEN
        SELECT id INTO v_auth_user_id
        FROM auth.users
        WHERE LOWER(email) = v_email_limpo
        LIMIT 1;

        IF v_auth_user_id IS NULL THEN
            v_auth_user_id := gen_random_uuid();
            INSERT INTO auth.users (
                id,
                instance_id,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at,
                updated_at,
                role,
                aud
            ) VALUES (
                v_auth_user_id,
                '00000000-0000-0000-0000-000000000000',
                v_email_limpo,
                crypt(gen_random_uuid()::text, gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('nome', COALESCE(p_nome_admin, 'Administrador')),
                now(),
                now(),
                'authenticated',
                'authenticated'
            );
        END IF;

        INSERT INTO public.usuario (
            id,
            tenant_id,
            auth_user_id,
            nome,
            email,
            perfil,
            ativo
        ) VALUES (
            gen_random_uuid(),
            v_tenant_id,
            v_auth_user_id,
            COALESCE(p_nome_admin, 'Administrador'),
            v_email_limpo,
            'admin',
            true
        )
        ON CONFLICT (email) DO UPDATE
        SET tenant_id = v_tenant_id,
            perfil = 'admin',
            ativo = true;
    END IF;

    -- Auditoria
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
        v_tenant_id,
        public.current_usuario_id(),
        'PROVISIONAMENTO_TENANT',
        'Empresa ' || p_nome_empresa,
        'Provisionada via painel Super Admin com e-mail ' || COALESCE(v_email_limpo, 'não informado'),
        public.request_client_ip(),
        public.request_user_agent(),
        'INFO',
        false
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'tenant_id', v_tenant_id,
        'slug', v_slug_limpo,
        'email_admin', v_email_limpo
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;

-- 4. Função para atualizar os dados cadastrais da empresa
CREATE OR REPLACE FUNCTION public.atualizar_dados_empresa(
    p_tenant_id UUID,
    p_nome_empresa TEXT,
    p_plano TEXT,
    p_limite INTEGER,
    p_email_admin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_email_limpo TEXT;
    v_auth_user_id UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação negada.';
    END IF;

    v_email_limpo := NULLIF(LOWER(TRIM(COALESCE(p_email_admin, ''))), '');

    UPDATE public.tenant
    SET nome_empresa = TRIM(p_nome_empresa),
        plano = COALESCE(p_plano, plano),
        limite_encomendas_mes = COALESCE(p_limite, limite_encomendas_mes),
        email_admin = v_email_limpo,
        atualizado_em = now()
    WHERE id = p_tenant_id;

    -- Se informou e-mail, assegura vínculo do usuário admin
    IF v_email_limpo IS NOT NULL THEN
        SELECT id INTO v_auth_user_id
        FROM auth.users
        WHERE LOWER(email) = v_email_limpo
        LIMIT 1;

        IF v_auth_user_id IS NULL THEN
            v_auth_user_id := gen_random_uuid();
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
            ) VALUES (
                v_auth_user_id, '00000000-0000-0000-0000-000000000000', v_email_limpo,
                crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('nome', 'Administrador'), now(), now(), 'authenticated', 'authenticated'
            );
        END IF;

        INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo)
        VALUES (gen_random_uuid(), p_tenant_id, v_auth_user_id, 'Administrador', v_email_limpo, 'admin', true)
        ON CONFLICT (email) DO UPDATE
        SET tenant_id = p_tenant_id,
            perfil = 'admin',
            ativo = true;
    END IF;

    RETURN jsonb_build_object('sucesso', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_dados_empresa(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
