-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 14 (CORRIGIDA)
-- Correção Definitiva de RLS Super Admin & RPC de Provisionamento
-- (Sem dependência de ON CONFLICT para evitar erro 42P10)
-- ====================================================================

-- 1. Torna a função is_super_admin() 100% à prova de falhas:
-- Reconhece tanto pelo e-mail do JWT (miguuel.laube@gmail.com) quanto pela tabela usuario
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Reconhecimento direto do criador e proprietário da plataforma
    IF LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'miguuel.laube@gmail.com' THEN
        RETURN true;
    END IF;

    -- Verificação na tabela usuario para outros administradores
    IF EXISTS (
        SELECT 1 FROM public.usuario
        WHERE auth_user_id = auth.uid()
          AND perfil = 'super_admin'
          AND ativo = true
          AND excluido_em IS NULL
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;

-- 2. Vincula o seu usuário na tabela public.usuario com perfil super_admin (sem ON CONFLICT)
DO $$
DECLARE
    v_auth_id UUID;
    v_user_nome TEXT;
BEGIN
    SELECT id, COALESCE(raw_user_meta_data->>'nome', 'Miguel Laube (Super Admin)')
    INTO v_auth_id, v_user_nome
    FROM auth.users
    WHERE LOWER(email) = 'miguuel.laube@gmail.com'
    LIMIT 1;

    IF v_auth_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.usuario WHERE LOWER(email) = 'miguuel.laube@gmail.com') THEN
            UPDATE public.usuario
            SET auth_user_id = v_auth_id,
                perfil = 'super_admin',
                ativo = true
            WHERE LOWER(email) = 'miguuel.laube@gmail.com';
        ELSE
            INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo)
            VALUES (v_auth_id, NULL, v_auth_id, v_user_nome, 'miguuel.laube@gmail.com', 'super_admin', true);
        END IF;
    END IF;
END $$;

-- 3. Políticas de RLS para o Super Admin gerenciar tenant e usuario irrestritamente
ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_super_admin_all ON public.tenant;
CREATE POLICY tenant_super_admin_all ON public.tenant
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS usuario_super_admin_all ON public.usuario;
CREATE POLICY usuario_super_admin_all ON public.usuario
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 4. Função oficial de provisionamento de empresa com senha provisória (SECURITY DEFINER)
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
    VALUES (v_tenant_id, TRIM(p_nome_empresa) || ' Encomendas', '#2563eb', '#1e293b', UPPER(TRIM(p_nome_empresa)), 'encomed_' || v_slug_limpo);

    IF v_email_limpo IS NOT NULL THEN
        SELECT id INTO v_auth_user_id FROM auth.users WHERE LOWER(email) = v_email_limpo LIMIT 1;
        IF v_auth_user_id IS NULL THEN
            v_auth_user_id := gen_random_uuid();
            INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
            VALUES (v_auth_user_id, '00000000-0000-0000-0000-000000000000', v_email_limpo, crypt(v_senha_final, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', COALESCE(p_nome_admin, 'Administrador'), 'exigir_troca_senha', true), now(), now(), 'authenticated', 'authenticated');
        ELSE
            UPDATE auth.users
            SET encrypted_password = crypt(v_senha_final, gen_salt('bf')),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('exigir_troca_senha', true),
                updated_at = now()
            WHERE id = v_auth_user_id;
        END IF;

        IF EXISTS (SELECT 1 FROM public.usuario WHERE tenant_id = v_tenant_id AND LOWER(email) = v_email_limpo) THEN
            UPDATE public.usuario
            SET auth_user_id = COALESCE(public.usuario.auth_user_id, v_auth_user_id),
                perfil = 'admin',
                ativo = true,
                exigir_troca_senha = true,
                nome = COALESCE(p_nome_admin, 'Administrador')
            WHERE tenant_id = v_tenant_id AND LOWER(email) = v_email_limpo;
        ELSE
            INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo, exigir_troca_senha)
            VALUES (gen_random_uuid(), v_tenant_id, v_auth_user_id, COALESCE(p_nome_admin, 'Administrador'), v_email_limpo, 'admin', true, true);
        END IF;
    END IF;

    RETURN jsonb_build_object('sucesso', true, 'tenant_id', v_tenant_id, 'senha_provisoria', v_senha_final, 'email_admin', v_email_limpo);
END;
$$;
GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- 5. Atualiza o cache do Supabase PostgREST
NOTIFY pgrst, 'reload schema';
