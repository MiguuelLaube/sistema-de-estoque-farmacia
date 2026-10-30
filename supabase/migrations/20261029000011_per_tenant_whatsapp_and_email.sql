-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 11
-- Isolamento Multi-Tenant Estrito de WhatsApp e E-mail por Empresa
-- ====================================================================

-- 1. Colunas de credenciais e instâncias isoladas de WhatsApp por empresa
ALTER TABLE public.config_tenant
    ADD COLUMN IF NOT EXISTS whatsapp_instance_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS whatsapp_api_url TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_numero_conectado VARCHAR(40);

-- 2. Backfill: Garante que cada empresa existente possua um identificador exclusivo de instância
UPDATE public.config_tenant c
SET whatsapp_instance_name = 'encomed_' || REGEXP_REPLACE(LOWER(t.slug), '[^a-z0-9_-]', '', 'g')
FROM public.tenant t
WHERE c.tenant_id = t.id
  AND (c.whatsapp_instance_name IS NULL OR c.whatsapp_instance_name = '');

-- Preenchimentos específicos padrão
UPDATE public.config_tenant c
SET whatsapp_instance_name = 'encomed_aeroporto'
FROM public.tenant t
WHERE c.tenant_id = t.id AND t.slug = 'aeroporto';

UPDATE public.config_tenant c
SET whatsapp_instance_name = 'encomed_boaesperanca'
FROM public.tenant t
WHERE c.tenant_id = t.id AND t.slug = 'boaesperanca';

-- 3. Atualiza a função de provisionamento para gerar automaticamente a instância isolada da empresa
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
    v_instance_name TEXT;
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

    -- Cria a Configuração Inicial com Instância Exclusiva de WhatsApp
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
        'PROVISIONAMENTO_TENANT',
        'Empresa ' || p_nome_empresa,
        'Provisionada com instância exclusiva de WhatsApp (' || v_instance_name || ') e gestor ' || COALESCE(v_email_limpo, 'não informado'),
        public.request_client_ip(),
        public.request_user_agent(),
        'INFO',
        false
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'tenant_id', v_tenant_id,
        'slug', v_slug_limpo,
        'email_admin', v_email_limpo,
        'whatsapp_instance_name', v_instance_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
