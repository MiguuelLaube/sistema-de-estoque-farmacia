---
title: Diagnóstico e Correção de Login & RLS do Super Admin (EncoMed)
date: 2026-10-30
tags: [auth, supabase, rls, super-admin, security, troubleshooting, athena-memory]
status: resolved
author: Antigravity (Athena Memory System)
---

# 🧠 Memória Técnica: Login do Super Admin e Provisionamento de Empresas

## 1. Contexto do Problema
O usuário relatou dois sintomas correlacionados:
1. **Erro ao cadastrar empresa na Plataforma (`/plataforma`):**
   > *"Não foi possível criar a empresa (verifique se o identificador já está em uso)., mas eu não tenho nenhuma empresa cadastrada"*
2. **Falha de autenticação na tela de login (`/login`):**
   > Exibição do banner: *"Não foi possível concluir a autenticação no momento."* ao tentar logar com `miguuel.laube@gmail.com`.

---

## 2. Diagnóstico de Causa Raiz (Root Cause Analysis)

### 2.1. O que causou o erro no Login:
- **Cache do Navegador:** A captura de tela revelou o layout anterior ao commit `11afb77` (sem o botão de alternância de olho `Eye/EyeOff` no campo de senha e exibindo a string legada `'Não foi possível concluir a autenticação no momento.'` em vez da nova sanitização).
- **Senha Incompatível / Esquecida no Supabase Auth:** A chamada para `supabase.auth.signInWithPassword` retornava `Invalid login credentials` (400).
- **Rate Limit de E-mails do Supabase:** Ao clicar em "Esqueci minha senha", o Supabase retornava `{"code":429,"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}` (limite de envio de e-mails gratuitos atingido por hora), impedindo a recuperação via link por e-mail.

### 2.2. O que causou o erro de "Empresa já em uso" com lista vazia:
- **Deadlock de RLS no PostgreSQL:** A função `public.is_super_admin()` realiza a validação:
  ```sql
  SELECT id FROM public.usuario 
  WHERE auth_user_id = auth.uid() AND perfil = 'super_admin' AND ativo = true;
  ```
  No banco real do Supabase, o registro de `miguuel.laube@gmail.com` na tabela `public.usuario` não possuía o `auth_user_id` vinculado.
- **Consequências do Deadlock:**
  1. `public.is_super_admin()` retornava `false`.
  2. O `SELECT * FROM tenant` retornava 0 linhas (lista vazia).
  3. O `INSERT INTO tenant` era barrado pela RLS com erro `42501 (violates row-level security policy)`.
  4. O frontend engolia o `tErr` e exibia a mensagem estática de fallback: *"Não foi possível criar a empresa (verifique se o identificador já está em uso)."*.

---

## 3. Ações Corretivas Executadas

1. **Refatoração do Tratamento de Erros (`src/stores/auth.ts`):**
   - No método `provisionarTenant()`, substituído o erro genérico estático por verificação explícita de `tErr.code`:
     - `23505`: Notifica duplicidade de identificador/slug.
     - `42501`: Notifica violação de RLS e instrui a execução do script SQL.
     - Outros: Exibe `tErr.message` original.

2. **Script SQL de Restauração Imediata (Executar no Supabase SQL Editor):**
   - Redefine a senha de `miguuel.laube@gmail.com` de forma direta via `crypt('...', gen_salt('bf'))`, contornando o limite de e-mails (`over_email_send_rate_limit`).
   - Define `email_confirmed_at = now()` para validação instantânea.
   - Vincula `auth.users.id` em `public.usuario.auth_user_id` com perfil `'super_admin'`.
   - Implementa a RPC `public.provisionar_empresa_com_admin` com `SECURITY DEFINER`.

---

## 4. Script SQL Oficial para o Supabase

```sql
-- 1. Redefine a senha e confirma a conta imediatamente (bypassa limite de e-mail)
DO $$
DECLARE
    v_user_id UUID;
    v_nova_senha TEXT := 'Admin@Encomed2026'; -- Senha definitiva de acesso
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = 'miguuel.laube@gmail.com';

    IF v_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = crypt(v_nova_senha, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"perfil":"super_admin","nome":"Miguel Laube"}'::jsonb,
            updated_at = now()
        WHERE id = v_user_id;
    ELSE
        INSERT INTO auth.users (
            id, instance_id, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
        ) VALUES (
            gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'miguuel.laube@gmail.com', crypt(v_nova_senha, gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}'::jsonb,
            '{"perfil":"super_admin","nome":"Miguel Laube"}'::jsonb,
            now(), now(), 'authenticated', 'authenticated'
        );
    END IF;
END $$;

-- 2. Vincula o Super Admin na tabela public.usuario
INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo)
SELECT 
    u.id, 
    NULL, 
    u.id, 
    COALESCE(u.raw_user_meta_data->>'nome', 'Miguel Laube (Super Admin)'), 
    u.email, 
    'super_admin', 
    true
FROM auth.users u
WHERE LOWER(u.email) = 'miguuel.laube@gmail.com'
ON CONFLICT (email) DO UPDATE 
SET auth_user_id = EXCLUDED.auth_user_id,
    perfil = 'super_admin',
    ativo = true;

-- 3. Habilita permissão global de Super Admin nas políticas
DROP POLICY IF EXISTS usuario_super_admin_all ON public.usuario;
CREATE POLICY usuario_super_admin_all ON public.usuario
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS tenant_super_admin_all ON public.tenant;
CREATE POLICY tenant_super_admin_all ON public.tenant
    FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 4. Cria a RPC oficial de provisionamento (SECURITY DEFINER)
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

        INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo, exigir_troca_senha)
        VALUES (gen_random_uuid(), v_tenant_id, v_auth_user_id, COALESCE(p_nome_admin, 'Administrador'), v_email_limpo, 'admin', true, true)
        ON CONFLICT (email) DO UPDATE
        SET tenant_id = v_tenant_id, auth_user_id = COALESCE(public.usuario.auth_user_id, v_auth_user_id), perfil = 'admin', ativo = true, exigir_troca_senha = true;
    END IF;

    RETURN jsonb_build_object('sucesso', true, 'tenant_id', v_tenant_id, 'senha_provisoria', v_senha_final, 'email_admin', v_email_limpo);
END;
$$;
GRANT EXECUTE ON FUNCTION public.provisionar_empresa_com_admin(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
```
