-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 13
-- Senha Provisória de Primeiro Acesso & Provisionamento sem Dependência de E-mail
-- ====================================================================

-- 1. Colunas de controle de primeiro acesso em public.usuario
ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS exigir_troca_senha BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS senha_provisoria_ativa BOOLEAN DEFAULT false;

-- 2. Atualização da função de provisionamento de empresa para aceitar senha provisória
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
    v_instance_name TEXT;
    v_senha_final TEXT;
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
    v_senha_final := COALESCE(NULLIF(TRIM(p_senha_provisoria), ''), 'EncoMed@' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'));
    v_instance_name := 'encomed_' || v_slug_limpo;

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

    -- Configuração Inicial com WhatsApp Isolado
    INSERT INTO public.config_tenant (
        tenant_id,
        nome_sistema,
        cor_primaria,
        cor_secundaria,
        header_title,
        whatsapp_instance_name
    ) VALUES (
        v_tenant_id,
        TRIM(p_nome_empresa) || ' Encomendas',
        '#2563eb',
        '#1e293b',
        UPPER(TRIM(p_nome_empresa)),
        v_instance_name
    );

    -- Se informado e-mail de administrador, cadastra no auth.users sem envio de email
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
                crypt(v_senha_final, gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('nome', COALESCE(p_nome_admin, 'Administrador'), 'exigir_troca_senha', true),
                now(),
                now(),
                'authenticated',
                'authenticated'
            );
        ELSE
            -- Se o usuário já existe em auth.users, atualiza a senha para a provisória e confirma o e-mail
            UPDATE auth.users
            SET encrypted_password = crypt(v_senha_final, gen_salt('bf')),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('exigir_troca_senha', true),
                updated_at = now()
            WHERE id = v_auth_user_id;
        END IF;

        INSERT INTO public.usuario (
            id,
            tenant_id,
            auth_user_id,
            nome,
            email,
            perfil,
            ativo,
            exigir_troca_senha,
            senha_provisoria_ativa
        ) VALUES (
            gen_random_uuid(),
            v_tenant_id,
            v_auth_user_id,
            COALESCE(p_nome_admin, 'Administrador'),
            v_email_limpo,
            'admin',
            true,
            true,
            true
        )
        ON CONFLICT (email) DO UPDATE
        SET tenant_id = v_tenant_id,
            auth_user_id = COALESCE(public.usuario.auth_user_id, v_auth_user_id),
            perfil = 'admin',
            ativo = true,
            exigir_troca_senha = true,
            senha_provisoria_ativa = true;
    END IF;

    -- Trilha de Auditoria
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
        'PROVISIONAMENTO_TENANT_SENHA_PROVISORIA',
        'Empresa ' || p_nome_empresa,
        'Provisionada com senha provisória de primeiro acesso para gestor ' || COALESCE(v_email_limpo, 'sem email'),
        public.request_client_ip(),
        public.request_user_agent(),
        'info',
        false
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'tenant_id', v_tenant_id,
        'email_admin', v_email_limpo,
        'senha_provisoria', v_senha_final,
        'mensagem', 'Empresa provisionada com sucesso com senha provisória.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- 3. Função para o Super Admin redefinir a senha provisória de uma empresa existente
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
    v_senha_final TEXT;
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

    -- Localiza ou cria em auth.users pelo e-mail
    SELECT id INTO v_auth_user_id FROM auth.users WHERE LOWER(email) = LOWER(v_user_row.email) LIMIT 1;
    IF v_auth_user_id IS NULL THEN
        v_auth_user_id := gen_random_uuid();
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES (v_auth_user_id, '00000000-0000-0000-0000-000000000000', LOWER(v_user_row.email), crypt(v_senha_final, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', v_user_row.nome, 'exigir_troca_senha', true), now(), now(), 'authenticated', 'authenticated');
    ELSE
        UPDATE auth.users
        SET encrypted_password = crypt(v_senha_final, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('exigir_troca_senha', true),
            updated_at = now()
        WHERE id = v_auth_user_id;
    END IF;

    -- Atualiza em public.usuario
    UPDATE public.usuario
    SET auth_user_id = v_auth_user_id,
        exigir_troca_senha = true,
        senha_provisoria_ativa = true
    WHERE id = v_user_row.id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'email', v_user_row.email,
        'nome', v_user_row.nome,
        'senha_provisoria', v_senha_final,
        'mensagem', 'Nova senha provisória gerada com sucesso.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redefinir_senha_provisoria_tenant(UUID, TEXT) TO authenticated;

