---
title: Diagnóstico e Correção de Login & RLS do Super Admin (EncoMed)
date: 2026-10-30
tags: [auth, supabase, rls, super-admin, security, troubleshooting, athena-memory, gotrue, database-error-querying-schema]
status: resolved
author: Antigravity (Athena Memory System)
---

# 🧠 Memória Técnica: Login, GoTrue Schema e Senhas Provisórias

## 1. Contexto do Problema & Causa Raiz de "Database error querying schema"

### 1.1. Em qual etapa acontece?
O erro acontece no **próprio login** (`supabase.auth.signInWithPassword`), quando o servidor de autenticação do Supabase (GoTrue) faz a busca interna do usuário via `SELECT * FROM auth.users WHERE LOWER(email) = LOWER(?)`.

### 1.2. Qual a causa raiz exata?
1. **Campos `NULL` em `auth.users`:**
   O GoTrue é escrito em Go e mapeia os campos de token (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `reauthentication_token`, `phone_change`, `phone_change_token`) para tipos primitivos `string` (não-ponteiros).
   Quando usuários são inseridos via SQL direto ou procedures incompletas sem preencher esses tokens, eles ficam como `NULL` no PostgreSQL.
   O driver SQL do Go falha ao escanear a linha: `sql: Scan error on column index X: converting NULL to string is unsupported` e responde com HTTP 500 `"Database error querying schema"`.
2. **Ausência de Registro em `auth.identities`:**
   O GoTrue exige que todo usuário com login por e-mail/senha possua um registro em `auth.identities` com `provider = 'email'`. Sem isso, o usuário não consegue autenticar ou tem a credencial rejeitada.

---

## 2. Solução Arquitetural Aplicada

1. **Saneamento Preventivo em `auth.users`:**
   - Todos os tokens com valor `NULL` são convertidos em string vazia `''`.
   - `email_confirmed_at` e `confirmed_at` são definidos como `now()`.
2. **Sincronização em `auth.identities`:**
   - Inserção com dados `{"sub": user_id, "email": email}` para o provedor `'email'`.
3. **Função Centralizada `public.gerenciar_auth_user()`:**
   - Toda geração de senha provisória ou cadastro de gestor utiliza esta rotina `SECURITY DEFINER`, garantindo que nenhuma conta seja criada com campos inválidos.
4. **Governança de Senhas Provisórias:**
   - Suporte a expiração temporal (`senha_provisoria_expira_em`).
   - Bloqueio de acesso para senhas provisórias expiradas.
   - Forçamento de primeiro acesso (`exigir_troca_senha = true`).
   - Desativação atômica das flags provisórias após troca para senha definitiva.
5. **Testes Automatizados:**
   - Suíte `npm run test:auth` cobrindo geração, login bem-sucedido, rejeição de senha incorreta, rejeição de senha expirada e transição para senha definitiva.

---

## 3. Testes Automatizados no Pipeline
Comando para executar a bateria:
```bash
npm run test:auth
```
Resultado: 5 testes cobrindo todas as variações de estado do ciclo de vida da senha provisória com 100% de sucesso.
