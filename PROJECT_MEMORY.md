# 🧠 MEMÓRIA DO PROJETO - ENCOMED SAAS

> **DOCUMENTO DE MEMÓRIA VIVA & BASE DE CONHECIMENTO PERMANENTE**  
> *Instrução para a IA/Agente:* Sempre leia este documento antes de realizar tarefas e atualize-o ao concluir qualquer modificação relevante. Isso economiza tokens, evita regressoes e mantém a integridade arquitetural do SaaS.

---

## 📌 1. Visão Geral e Identidade do SaaS

- **Nome da Plataforma:** EncoMed (anteriormente Drogaria Aeroporto / Sistema Mãe)
- **Proposta de Valor:** SaaS B2B especializado em gestão de encomendas de medicamentos, listas de compras de reposição, conciliação inteligente de XML de NF-e com detecção de dosagem por IA, disparos automáticos via WhatsApp e governança multi-tenant com privacidade LGPD.
- **Modelo de Licenciamento:** Multi-tenant com White-Label (cada drogaria personaliza nome, slogan, logomarca, paleta de cores primária/secundária, cabeçalho de cupom 80mm e instâncias de WhatsApp).
- **Portal de Governança:** Área restrita do Super Admin (`/plataforma`) com auditoria contínua, isolamento de dados e sessão emergencial Break-Glass.

---

## 🛠️ 2. Stack Tecnológica

| Camada | Tecnologia / Ferramenta | Detalhes & Bibliotecas |
| :--- | :--- | :--- |
| **Frontend** | Vue 3 + TypeScript + Vite | Composition API (`<script setup lang="ts">`), Vue Router 4, Pinia 3 |
| **Ícones & UI** | Lucide Vue Next | Ícones vetoriais modernos (`Lock`, `Eye`, `EyeOff`, `ShieldCheck`, etc.) |
| **Estilos & Layout** | CSS Moderno / Design System Farmácia | Variáveis CSS personalizáveis, botões em pílula `rounded-full`, glassmorphism |
| **Backend & Banco** | Supabase (PostgreSQL 15+) | Row Level Security (RLS), triggers, schemas `public` e `auth`, RPCs seguras |
| **Serverless API** | Vercel Serverless Functions (`api/`) | Node.js com TypeScript: `whatsapp.ts`, `convidar-empresa.ts`, `xml-ai-match.ts` |
| **Mensageria** | WhatsApp (Evolution API / Baileys) | Disparo direto de templates com variáveis `{nome}`, `{medicamento}`, `{total}` |
| **Segurança & Sessão** | Cookies Híbridos + LocalStorage | `cookieStorage.ts` com `SameSite=Lax; Secure; Path=/` para persistência |
| **Inteligência Artificial** | EncoMed Pharma Match + Gemini LLM | Match fuzzy ponderado com guardrail clínico contra troca acidental de dosagens |

---

## 🎨 3. Design System da Farmácia (`ui-design-padrao-farmacia`)

Todas as páginas devem respeitar rigorosamente os padrões visuais estabelecidos:

1. **Botões em Pílula (`border-radius: 9999px` ou `.rounded-full`):**
   - `.btn-primary-pill`: Ação primária (Azul Cobalto `#2563eb`).
   - `.btn-outline-emerald`: Ações de sucesso, chegada ou exportação (Esmeralda `#059669`).
   - `.btn-outline-neutral`: Filtros, configurações e cancelamentos (Ardósia `#334155`).
2. **Paleta Semântica de Status:**
   - **Aguardando / Aguardo:** Fundo Âmbar `#fffbeb`, Borda `#fde68a`, Texto `#d97706`.
   - **Pedido Feito / Feito:** Fundo Azul `#eff6ff`, Borda `#bfdbfe`, Texto `#2563eb`.
   - **Chegou:** Fundo Esmeralda `#ecfdf5`, Borda `#a7f3d0`, Texto `#059669`.
   - **Entregue:** Fundo Verde Esmeralda `#ecfdf5`, Borda `#a7f3d0`, Texto `#047857`.
   - **Cancelada:** Fundo Rosa Claro `#fff1f2`, Borda `#fecdd3`, Texto `#be123c`.
   - **Urgente:** Vermelho Alerta `#fef2f2`, Texto `#dc2626`.
3. **Logotipo e Ativos Oficiais (Fundo 100% Transparente):**
   - Logo horizontal completo: `/encomed-logo.svg` (também exportado em PNG transparente `/encomed-logo.png`).
   - Ícone quadrado/símbolo 3D: `/encomed-icon.svg` (e PNG `/encomed-icon.png`).
   - Favicon do navegador: `/favicon.svg`.
   - *Regra:* Nunca renderizar fundos cinzas ou opacos sob o logo.

---

## 🗺️ 4. Mapeamento de Rotas e Telas

- **`/apresentacao` (`LandingView.vue`):** Landing page institucional do SaaS, demonstrador interativo com simulação de status, conciliação XML e prévia de customização de marca.
- **`/login` (`LoginView.vue`):** Acesso corporativo seguro com campo de senha com alternância de visibilidade (Eye/EyeOff), 2FA TOTP opcional e redefinição de senha com link de e-mail.
- **`/` e `/dashboard` (`DashboardView.vue`):** Painel operacional com cards de métricas (Clientes, Total, Pendentes, Entregues, A Receber), fila de pedidos prontos para aviso via WhatsApp e ranking de medicamentos mais pedidos.
- **`/encomendas` (`EncomendasView.vue`):** Gestão integral de encomendas de clientes, filtros por status, forma de pagamento, modal de histórico auditado e impressão de cupom térmico 80mm.
- **`/nova-encomenda` (`NovaEncomendaView.vue`):** Formulário ágil de criação com busca/cadastro de cliente, múltiplos itens, alertas de retenção de receita e pagamento antecipado.
- **`/compras` (`ComprasView.vue`):** Lista de compras consolidada com importação de NF-e via XML, motor semântico de dosagens e categorização preditiva.
- **`/clientes` (`ClientesView.vue`):** Cadastro de pacientes em conformidade com a LGPD (Art. 18), exibição auditada de CPF mascarado, exportação de relatório DSAR e anonimização irreversível.
- **`/relatorios` (`RelatoriosView.vue`):** Relatórios de vendas, faturamento por período e exportação para Excel estilizado.
- **`/configuracoes` (`ConfiguracoesView.vue`):** Estúdio White-Label, paletas de cores, instâncias de WhatsApp, bobina térmica e preferências de cookies LGPD.
- **`/plataforma` (`PlataformaView.vue`):** Painel exclusivo do Super Admin para criação e gestão de drogarias clientes, acompanhamento de limites e ativação de suporte emergencial Break-Glass.

---

## 🔒 5. Arquitetura de Autenticação, RLS e Sessão

### 5.1. Resolução do Deadlock de Login (Super Admin & Tenancy)
- **Problema Histórico:** Quando uma conta do Supabase Auth realizava o primeiro login, a linha correspondente na tabela `public.usuario` não possuía o `auth_user_id` preenchido. As políticas de Row Level Security (RLS) bloqueavam a consulta por e-mail, fazendo com que o frontend executasse `supabase.auth.signOut()` prematuramente e exibisse o erro genérico *"Não foi possível concluir a autenticação no momento"*.
- **Solução Implementada em `src/stores/auth.ts`:**
  - Auto-vinculação resiliente em memória no método `sincronizarSessaoAtiva()`.
  - Se o usuário autenticado for o proprietário pioneiro (`miguuel.laube@gmail.com`) ou contiver a flag `super_admin`, o sistema cria imediatamente o perfil de Super Admin em memória e tenta gravá-lo no banco.
  - Fallback automático para os usuários de homologação/demonstração (`initialUsuarios`).
  - Flexibilização do 2FA: `exigirMfa` é configurado como `false` por padrão no primeiro login, só exigindo TOTP se o usuário tiver explicitamente ativado a exigência na tabela `super_admin_politica`.
  - As chamadas RPC de telemetria (`verificar_bloqueio_login` e `registrar_evento_login`) foram blindadas com blocos `try/catch`, impedindo que oscilações no banco derrubem o login.

### 5.2. Persistência de Sessão e Cookies LGPD (`src/services/cookieStorage.ts`)
- O cliente Supabase utiliza o adaptador híbrido `supabaseCookieStorage`, gravando os tokens `sb-access-token` e `sb-refresh-token` em cookies seguros com flags `SameSite=Lax; Secure; Path=/` e espelhando no `localStorage`.
- As APIs serverless da Vercel (`api/whatsapp.ts`, `api/convidar-empresa.ts`, `api/xml-ai-match.ts`) inspecionam o cabeçalho `Cookie` caso o cabeçalho `Authorization: Bearer` não esteja presente.
- O banner de consentimento LGPD (`CookieBanner.vue`) permite ao usuário aceitar ou personalizar preferências (Essenciais, Preferências, Analíticos).

---

## 🗄️ 6. Estrutura de Banco de Dados (Supabase PostgreSQL)

- **`tenant`:** Cadastro das drogarias (nome, slug, plano, limite, email_admin, status).
- **`config_tenant`:** Configurações visuais White-Label, modelos de WhatsApp e opções de bobina.
- **`config_tenant_whatsapp_segredo`:** Tabela blindada exclusiva para chaves de API do WhatsApp (acesso apenas via backend/serverless).
- **`usuario`:** Operadores, administradores e super admins (`id`, `tenant_id`, `auth_user_id`, `nome`, `email`, `perfil`, `ativo`).
- **`funcionario`:** Funcionários do balcão identificados nas operações diárias.
- **`cliente`:** Pacientes cadastrados com conformidade LGPD (`cpf_hash` em SHA-256, `consentimento_em`, `base_legal`, `arquivado_em`, `excluido_em`).
- **`encomenda` & `encomenda_item`:** Registro das encomendas, códigos de rastreio (`ENC-YYYY-XXX`), itens e status.
- **`compra_item`:** Itens consolidados para pedidos aos distribuidores farmacêuticos.
- **`pagamento`:** Histórico de pagamentos e estornos parciais ou totais.
- **`log_auditoria`:** Trilha imutável de eventos (acessos, quebra de sigilo, anonimizações LGPD, break-glass).
- **`super_admin_politica` & `super_admin_break_glass`:** Governança e sessões emergenciais temporárias de 30 minutos.

---

## 📜 7. Histórico Cronológico de Atualizações

| Hash Commit | Data / Hora | Resumo das Alterações |
| :--- | :--- | :--- |
| `ceb5ffc` | 30/10/2026 | RPC de auto-vinculação segura, flexibilização de MFA no primeiro login e criação de migração de segurança 12. |
| `d409a5e` | 30/10/2026 | Novo logo vetorial oficial EncoMed 3D isométrico com fundo 100% transparente e geração de favicon SVG. |
| `53f194d` | 30/10/2026 | Persistência de sessão híbrida via cookies (`cookieStorage.ts`), banner global LGPD e atualização de APIs Vercel. |
| `8f15968` | 30/10/2026 | **Loop Autônomo (Ciclos 1 a 4):** Correção de métricas financeiras (expurgo de canceladas), persistência atômica com rollback em encomendas, compras e clientes, e adição do botão de ver senha (`Eye`/`EyeOff`) no login. |
| `3a8ba92` | 30/10/2026 | Refinamento responsivo do dashboard (grades `auto-fit`), substituição de logos antigos por SVGs transparentes na Landing Page e App. |
| `ea9a32e` | 30/10/2026 | **Blindagem Definitiva de Login:** Eliminação do deadlock de RLS para o proprietário (`miguuel.laube@gmail.com`), proteção com `try/catch` em todas as RPCs de autenticação e redirecionamento de senha. |
| `d35f3fe` | 30/10/2026 | Criação do documento central de memória do projeto (`PROJECT_MEMORY.md`). |
| `11afb77` | 30/10/2026 | **Anti-Cache Definitivo & UX de Autenticação:** Headers anti-cache em `vercel.json` (`s-maxage=0`, `Vercel-CDN-Cache-Control: no-store`) eliminando cache persistente de borda, meta tags anti-cache em `index.html`, botão de visibilidade de senha com alinhamento absoluto dentro do campo, pré-preenchimento automático no fluxo "Esqueci minha senha" e suporte a links de recuperação via URL query/hash. |
| `master` | 30/10/2026 | **Provisionamento com Senha Provisória & Primeiro Acesso Obrigatório:** Criação de empresas pelo Super Admin sem dependência de envio de e-mail, geração automática de senha provisória amigável, modal de cópia de credenciais para WhatsApp em 1 clique, e modal de definição obrigatória de senha definitiva (`PrimeiroAcessoModal.vue`) no primeiro login da drogaria. |

---

## 💡 8. Diretrizes para Futuras Sessões e Agentes

1. **Antes de codificar:** Consulte sempre o arquivo `PROJECT_MEMORY.md` para entender as regras vigentes e evitar quebrar fluxos estáveis.
2. **Ao modificar telas:** Siga estritamente o skill `ui-design-padrao-farmacia` (botões em pílula `rounded-full` e cores semânticas).
3. **Ao manipular dados de clientes:** Respeite as regras LGPD (`regras-lgpd-privacidade-dev`), mantendo CPF pseudonimizado via hash SHA-256.
4. **Ao alterar autenticação:** Não reintroduza validações síncronas que dependam exclusivamente do banco antes do usuário estar logado.
5. **Ao concluir tarefas:** Adicione uma nova linha na seção *7. Histórico Cronológico de Atualizações* e execute `npm run build` para garantir zero erros de TypeScript.

