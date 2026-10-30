-- ====================================================================
-- Migração 16: Correção das falhas de criação/gravação (categorias, clientes, etc.)
--
-- CAUSA RAIZ:
--   Todas as policies de INSERT/UPDATE (cliente, classificacao, compra_item,
--   encomenda, pagamento, funcionario...) usam
--       WITH CHECK (tenant_id = public.current_tenant_id())
--   e current_tenant_id() depende de public.usuario.auth_user_id = auth.uid().
--   O administrador da drogaria (tenant.email_admin) existia em auth.users, mas
--   NÃO tinha linha vinculada em public.usuario. Resultado: current_tenant_id()
--   = NULL e 100% das gravações eram rejeitadas pelo RLS (42501), enquanto o
--   frontend deixava o usuário entrar com um perfil montado em memória.
--
-- ESTA MIGRAÇÃO (idempotente, sem passos manuais):
--   1. Garante colunas de apoio em tenant/usuario.
--   2. vincular_meu_usuario_auth(): passa a criar/vincular automaticamente o
--      administrador do tenant a partir de tenant.email_admin.
--   3. Reparo de dados: vincula usuários existentes ao auth.users pelo e-mail
--      e provisiona o admin de cada tenant que ainda não tem linha em usuario.
--   4. Torna o rate-limit SQL "fail-open" se a infraestrutura dele estiver
--      incompleta (função/tabela ausente), sem nunca afrouxar o limite real.
-- ====================================================================

-- 1. Colunas de apoio (no-op quando já existem)
ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS email_admin VARCHAR(255);
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS exigir_troca_senha BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS senha_provisoria_ativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS senha_provisoria_expira_em TIMESTAMPTZ;

-- 2. RPC de vínculo com auto-provisionamento do administrador do tenant
CREATE OR REPLACE FUNCTION public.vincular_meu_usuario_auth()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_meta JSONB;
    v_user RECORD;
    v_tenant RECORD;
    v_exigir_troca BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Não autenticado.');
    END IF;

    SELECT LOWER(email), COALESCE(raw_user_meta_data, '{}'::jsonb)
      INTO v_email, v_meta
    FROM auth.users
    WHERE id = v_uid;

    IF v_email IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'E-mail não localizado na sessão de autenticação.');
    END IF;

    -- 1. Já vinculado ao auth_user_id
    SELECT * INTO v_user
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_user.id IS NOT NULL THEN
        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
    END IF;

    -- 2. Existe pelo e-mail (ainda sem auth_user_id): vincula
    SELECT * INTO v_user
    FROM public.usuario
    WHERE LOWER(email) = v_email
      AND ativo = true
      AND excluido_em IS NULL
    ORDER BY (auth_user_id IS NULL) DESC, criado_em ASC
    LIMIT 1;

    IF v_user.id IS NOT NULL THEN
        IF v_user.auth_user_id IS NULL THEN
            UPDATE public.usuario
            SET auth_user_id = v_uid, atualizado_em = now()
            WHERE id = v_user.id;
            v_user.auth_user_id := v_uid;
        END IF;
        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
    END IF;

    -- 3. Administrador de uma drogaria (tenant.email_admin): cria o vínculo automaticamente
    SELECT t.id, t.nome_empresa INTO v_tenant
    FROM public.tenant t
    WHERE LOWER(t.email_admin) = v_email
      AND t.status = 'ativo'
    ORDER BY t.criado_em ASC
    LIMIT 1;

    IF v_tenant.id IS NOT NULL THEN
        v_exigir_troca := COALESCE((v_meta ->> 'exigir_troca_senha')::boolean, false);

        INSERT INTO public.usuario (
            id, tenant_id, auth_user_id, nome, email, perfil, ativo,
            exigir_troca_senha, senha_provisoria_ativa
        )
        VALUES (
            v_uid, v_tenant.id, v_uid,
            COALESCE(NULLIF(v_meta ->> 'nome', ''), 'Administrador'),
            v_email, 'admin', true,
            v_exigir_troca, v_exigir_troca
        )
        ON CONFLICT (id) DO UPDATE
            SET auth_user_id = EXCLUDED.auth_user_id,
                ativo = true,
                excluido_em = NULL,
                atualizado_em = now()
        RETURNING * INTO v_user;

        RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
    END IF;

    -- 4. Super Admin pioneiro
    IF v_email = 'miguuel.laube@gmail.com' THEN
        INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo)
        VALUES (v_uid, NULL, v_uid, 'Miguel Laube (Super Admin)', v_email, 'super_admin', true)
        ON CONFLICT (id) DO NOTHING;

        SELECT * INTO v_user FROM public.usuario WHERE id = v_uid;
        IF v_user.id IS NOT NULL THEN
            RETURN jsonb_build_object('sucesso', true, 'usuario', row_to_json(v_user));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'sucesso', false,
        'mensagem', 'Usuário não cadastrado em nenhuma empresa. Peça ao Super Admin para provisionar sua conta (e-mail do administrador da empresa).'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_meu_usuario_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_meu_usuario_auth() TO authenticated;

-- 3. Reparo de dados existentes (sem passo manual)
-- 3.1 Vincula usuários já cadastrados (exceto super_admin, protegido por trigger) ao auth.users pelo e-mail
UPDATE public.usuario u
SET auth_user_id = a.id, atualizado_em = now()
FROM auth.users a
WHERE u.auth_user_id IS NULL
  AND u.perfil <> 'super_admin'
  AND u.ativo = true
  AND u.excluido_em IS NULL
  AND LOWER(u.email) = LOWER(a.email)
  AND NOT EXISTS (SELECT 1 FROM public.usuario x WHERE x.auth_user_id = a.id);

-- 3.2 Provisiona o admin de cada tenant que ainda não possui linha em usuario
INSERT INTO public.usuario (id, tenant_id, auth_user_id, nome, email, perfil, ativo, exigir_troca_senha, senha_provisoria_ativa)
SELECT a.id, t.id, a.id,
       COALESCE(NULLIF(a.raw_user_meta_data ->> 'nome', ''), 'Administrador'),
       LOWER(a.email), 'admin', true,
       COALESCE((a.raw_user_meta_data ->> 'exigir_troca_senha')::boolean, false),
       COALESCE((a.raw_user_meta_data ->> 'exigir_troca_senha')::boolean, false)
FROM public.tenant t
JOIN auth.users a ON LOWER(a.email) = LOWER(t.email_admin)
WHERE t.status = 'ativo'
  AND NOT EXISTS (SELECT 1 FROM public.usuario x WHERE x.auth_user_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.usuario x WHERE x.id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.usuario x WHERE x.tenant_id = t.id AND LOWER(x.email) = LOWER(a.email));

-- 4. Rate-limit SQL fail-open apenas quando a infraestrutura estiver ausente/incompleta
--    (o bloqueio real por excesso de requisições continua levantando P0001)
CREATE OR REPLACE FUNCTION public.trg_limitar_mutacoes_sql()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check JSONB;
BEGIN
    IF auth.uid() IS NULL AND public.request_client_ip() IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_check := public.verificar_rate_limit_requisicao('sql_mut_' || TG_TABLE_NAME, 90, 60);

    IF COALESCE((v_check ->> 'permitido')::boolean, true) = false THEN
        RAISE EXCEPTION 'Limite de segurança de requisições SQL excedido para a tabela %. Aguarde % segundos.',
            TG_TABLE_NAME,
            COALESCE(v_check ->> 'segundos_restantes', '15')
            USING ERRCODE = 'P0001';
    END IF;

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN undefined_function OR undefined_table THEN
        RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';
