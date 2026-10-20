# Sistema Mãe de Encomendas Multi-tenant

> Plataforma SaaS multi-tenant para encomendas sob pedido de medicamentos e produtos especiais, consolidada a partir do *Drogaria Aeroporto Manager*.

---

## 🚀 Visão Geral e Stack Tecnológica

O sistema foi arquitetado segundo as diretrizes de especificação funcional e arquitetural:

- **Frontend:** Vue 3 (Composition API) + Vite + TypeScript + Pinia + Vue Router.
- **Estilização:** Design System moderno com Custom Properties CSS, Glassmorphism, badges dinâmicas, micro-animações e tipografia moderna (Google Fonts *Inter* e *Outfit*).
- **Backend & Banco de Dados:** PostgreSQL no Supabase com isolamento rigoroso via **Row Level Security (RLS)**, chaves estrangeiras compostas `(tenant_id, id)` e triggers transacionais.
- **Borda & Infraestrutura:** Preparado para deploy contínuo na **Cloudflare Pages** (com `wrangler.toml`).

---

## 🏢 Arquitetura Multi-tenant & Segurança (RLS)

1. **Modelo de Banco Compartilhado / Schema Compartilhado:**
   - Todas as tabelas de negócio possuem `tenant_id NOT NULL`.
   - RLS ativado e forçado (`FORCE ROW LEVEL SECURITY`) com falha fechada.
   - O `current_tenant_id()` é extraído automaticamente de `app.tenant_id` ou claims do JWT do Supabase Auth.
   - Chaves estrangeiras compostas `(tenant_id, id)` impedem que registros de um tenant façam referência a outro tenant.

2. **Perfis de Acesso (RBAC):**
   - **Super-administrador da plataforma:** Visualiza apenas métricas agregadas e dados de controle de assinaturas dos tenants.
   - **Administrador:** Acesso completo dentro da sua empresa, relatórios consolidados e autorização de alçadas (ex.: entrega com saldo devedor).
   - **Operador / Balcão:** Registro e acompanhamento de encomendas, clientes e recebimento de pagamentos.
   - **Comprador / Financeiro:** Gestão de pedidos a distribuidoras, importação de notas fiscais XML e exportação de relatórios.

---

## 📦 Regras de Negócio Implementadas

- **Vínculo Encomenda ↔ Compras (Seção 3.3):**
  - Ao criar um item em uma encomenda, o sistema busca na lista de compras um item aberto com a mesma descrição normalizada e categoria. Se existir, vincula e soma; caso contrário, cria automaticamente em `Aguardando`.
  - Quando a mercadoria física chega (`Chegou`), todos os itens de encomenda vinculados herdam o status imediatamente.
- **Status Derivado (Seção 5.2):**
  - O status da encomenda reflete o menor estágio entre seus itens: `Aguardando` < `Pedido Feito` < `Chegou`.
  - `Entregue` só é marcado quando todos os itens estão em `Chegou`.
- **Pagamentos & Estornos (Seção 5.4):**
  - Situação financeira calculada: `Não pago` (0), `Parcial` (0 < pago < total) e `Pago` (pago >= total).
  - Pagamentos nunca são deletados; correções são efetuadas por estorno rastreável com motivo obrigatório.
- **Notificação Direta no WhatsApp (Seção 2.4 & 8):**
  - Geração de link direto `wa.me` com modelo de mensagem configurável por tenant e interpolação de `{cliente}` e `{medicamento}`.
- **Conformidade LGPD (Seção 7):**
  - CPF opcional e validado por dígitos verificadores.
  - Mascaramento em tela nas listas (`123.***.***-45`) com revelação auditada.
  - Detecção de duplicidade em tempo real.
  - Exportação dos dados do titular conforme Art. 18.

---

## 📂 Estrutura de Arquivos

```text
├── supabase/
│   ├── migrations/
│   │   ├── 20261020000001_initial_schema.sql     # Tabelas, índices e FKs compostas
│   │   ├── 20261020000002_rls_policies.sql        # Funções de tenant e políticas RLS
│   │   └── 20261020000003_triggers_and_business_rules.sql # Sincronização automática
│   └── seed.sql                                  # Dados de teste para 2 tenants
├── src/
│   ├── data/
│   │   └── mockData.ts                           # Estado inicial para validação
│   ├── router/
│   │   └── index.ts                              # Rotas Vue Router
│   ├── services/
│   │   └── supabase.ts                           # Conexão cliente Supabase
│   ├── stores/
│   │   ├── auth.ts                               # Tenant switcher & theming dinâmico
│   │   ├── clientes.ts                           # Validação, duplicidade & LGPD
│   │   ├── compras.ts                            # Agrupamentos, XML & cotações
│   │   └── encomendas.ts                         # Encomendas, status & pagamentos
│   ├── types/
│   │   └── index.ts                              # Tipagem TypeScript completa
│   ├── utils/
│   │   └── isolationTests.ts                     # Bateria de testes de isolamento
│   ├── views/
│   │   ├── DashboardView.vue                     # Início e métricas consolidadas
│   │   ├── EncomendasView.vue                    # Abas, pagamentos e WhatsApp
│   │   ├── ComprasView.vue                       # Agrupamentos, XML e Chegou
│   │   ├── ClientesView.vue                      # Formulário, validação e busca
│   │   ├── RelatoriosView.vue                    # A receber e auditoria
│   │   ├── ConfiguracoesView.vue                 # Cores, templates e governança
│   │   └── PlataformaView.vue                    # Super-admin e break-glass
│   ├── App.vue                                   # Layout e alternadores rápidos
│   ├── main.ts                                   # Inicialização da aplicação
│   └── style.css                                 # Design system e variáveis CSS
├── scripts/
│   └── run-isolation-tests.ts                    # Runner de testes de isolamento
├── wrangler.toml                                 # Configuração Cloudflare Pages
└── package.json
```

---

## 🛠️ Como Executar o Projeto

### 1. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```
Acesse em: `http://localhost:5173/`

### 2. Rodar a bateria de testes de isolamento multi-tenant:
```bash
npm run test:isolation
```

### 3. Gerar build de produção:
```bash
npm run build
```

### 4. Conectar a um projeto Supabase real:
Copie o arquivo `.env.example` para `.env` e preencha suas chaves:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
VITE_DATA_MODE=supabase
```
Em seguida, execute as migrações SQL da pasta `supabase/migrations/` no SQL Editor do dashboard do seu projeto Supabase.
