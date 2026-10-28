---
name: ui-design-padrao-farmacia
description: >-
  Padroniza o Design System da drogaria/farmácia em Vue.js e Tailwind/CSS,
  orientando o uso rigoroso de botões em pílula (rounded-full), paleta de cores
  semântica de status (Aguardo, Feito, Chegou, Urgente), cabeçalhos de categorias,
  cards horizontais de itens, toolbars de filtragem e caixas de diálogo modais.
  Use sempre que criar ou refatorar interfaces, componentes ou páginas no sistema.
---

# Design System Padrão da Farmácia (`ui-design-padrao-farmacia`)

Este guia define as diretrizes visuais e arquiteturais obrigatórias para todas as telas do sistema de farmácia/drogaria (Vue 3 + Tailwind/CSS). Toda nova tela ou componente deve respeitar estritamente essas convenções visuais para manter consistência absoluta de interface e experiência do usuário (UX).

---

## 1. Paleta de Cores e Tokens de Status

A interface opera com um sistema semântico de cores bem definido para os estágios operacionais de compras, encomendas e estoque:

| Status / Estado | Cor Base | Background (Fundo) | Borda | Texto | Ícone Recomendado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Aguardo / Aguardando** | Âmbar | `#fffbeb` (`amber-50`) | `#fde68a` (`amber-200`) | `#d97706` (`amber-600`) | `Clock` |
| **Feito / Pedido Feito** | Azul Royal | `#eff6ff` (`blue-50`) | `#bfdbfe` (`blue-200`) | `#2563eb` (`blue-600`) | `CheckCircle` |
| **Chegou** | Esmeralda | `#ecfdf5` (`emerald-50`) | `#a7f3d0` (`emerald-200`) | `#059669` (`emerald-600`) | `Package` |
| **Urgente** | Vermelho Alerta | `#fef2f2` (`red-50`) | `#fca5a5` (`red-200`) | `#dc2626` (`red-600`) | `Zap` |
| **Primário da Loja** | Azul Cobalto | `#2563eb` (`blue-600`) | Transparente | `#ffffff` | `Plus`, `Check` |
| **Neutro / Secundário** | Ardósia | `#f8fafc` (`slate-50`) | `#e2e8f0` (`slate-200`) | `#334155` (`slate-700`) | `Settings`, `Search` |

---

## 2. Padrão de Botões em Pílula (`rounded-full`)

Todos os botões de ação principal e barras de topo adotam o formato de **pílula 100% arredondada** (`border-radius: 9999px` ou `rounded-full`):

### A. Botão Primário em Pílula (`.btn-primary-pill`)
Utilizado para ações principais de criação (ex.: *Adicionar Item*, *Nova Encomenda*, *Novo Cliente*).
- **Tailwind Classes:**
  ```html
  <button class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full px-5 py-2 shadow-md hover:shadow-lg transition-all duration-150">
    <Plus class="w-4 h-4" />
    <span>Adicionar Item</span>
  </button>
  ```
- **CSS Vanilla correspondente:**
  ```css
  .btn-primary-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background-color: #2563eb;
    color: #ffffff;
    border: 1px solid transparent;
    border-radius: 9999px;
    padding: 0.45rem 1.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    transition: all 150ms ease;
  }
  .btn-primary-pill:hover {
    background-color: #1d4ed8;
  }
  ```

### B. Botão Esmeralda em Pílula (`.btn-outline-emerald`)
Utilizado para ações bem-sucedidas ou operações de lote (ex.: *Apagar Chegou*, *Exportar Excel*).
- **Tailwind Classes:**
  ```html
  <button class="inline-flex items-center gap-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-sm rounded-full px-4 py-2 transition-all duration-150">
    <Package class="w-4 h-4" />
    <span>Apagar Chegou</span>
  </button>
  ```
- **CSS Vanilla correspondente:**
  ```css
  .btn-outline-emerald {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background-color: #ffffff;
    color: #047857;
    border: 1px solid #6ee7b7;
    border-radius: 9999px;
    padding: 0.45rem 1.15rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }
  .btn-outline-emerald:hover {
    background-color: #ecfdf5;
    border-color: #34d399;
  }
  ```

### C. Botão Neutro em Pílula (`.btn-outline-neutral`)
Utilizado para ajustes, filtros ou ações secundárias (ex.: *Classificações*, *Opções*).
- **Tailwind Classes:**
  ```html
  <button class="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm rounded-full px-4 py-2 transition-all duration-150">
    <Settings class="w-4 h-4" />
    <span>Classificações</span>
  </button>
  ```
- **CSS Vanilla correspondente:**
  ```css
  .btn-outline-neutral {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background-color: #ffffff;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    padding: 0.45rem 1.15rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }
  .btn-outline-neutral:hover {
    background-color: #f8fafc;
    border-color: #94a3b8;
  }
  ```

---

## 3. Pílulas de Status Interativas (`pedido-status-pill`)

Componentes compactos para alternância rápida de status em tabelas e cards:

```html
<!-- Aguardo -->
<button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 bg-amber-50 text-amber-700 border-amber-200">
  <Clock class="w-3.5 h-3.5" />
  <span>Aguardo</span>
</button>

<!-- Feito -->
<button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 bg-blue-50 text-blue-700 border-blue-200">
  <CheckCircle class="w-3.5 h-3.5" />
  <span>Feito</span>
</button>

<!-- Chegou -->
<button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 bg-emerald-50 text-emerald-700 border-emerald-200">
  <Package class="w-3.5 h-3.5" />
  <span>Chegou</span>
</button>
```

---

## 4. Cards Horizontais de Itens (`pedido-item-card`)

Os itens de lista (pedidos, encomendas ou clientes) devem ser renderizados em **cards horizontais com borda suave, cantos arredondados (16px) e elevação no hover**:

```html
<div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200">
  <!-- Lado Esquerdo: Identificação e Alertas -->
  <div class="min-w-0 flex-1">
    <h4 class="text-sm font-bold text-slate-900 uppercase tracking-wide truncate">
      OZEMPIC 1MG CANETA INJETAVEL
    </h4>
    <div class="inline-flex items-center gap-1 text-xs font-bold text-red-600 mt-0.5">
      <Zap class="w-3 h-3" />
      <span>Urgente</span>
    </div>
  </div>

  <!-- Lado Direito: Ações e Pílulas -->
  <div class="flex items-center gap-2 flex-shrink-0">
    <!-- Pílulas de Status aqui -->
  </div>
</div>
```

---

## 5. Cabeçalhos de Categoria (`category-header-pill`)

Pílulas de identificação de agrupamentos em azul claro e caixa alta:

```html
<div class="flex items-center gap-2 mb-2">
  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200">
    <Tag class="w-3 h-3" />
    <span>FÓRMULA</span>
  </span>
  <span class="text-xs text-slate-500 font-medium">
    3 item(s)
  </span>
</div>
```

---

## 6. Barra de Filtros e Ordenação (`pedidos-filter-toolbar`)

Container em tom de fundo suave (`bg-slate-50` / `#f8fafc`) contendo selects estilizados, divisor vertical e botões com estados ativos:

```html
<div class="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl flex-wrap">
  <!-- Select Limpo -->
  <select class="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-blue-600 transition-all">
    <option value="all">Todas as classificações</option>
  </select>

  <!-- Divisor Vertical -->
  <div class="w-px h-5 bg-slate-200"></div>

  <!-- Botão Toggle de Ordenação -->
  <button class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-all">
    <ArrowUpDown class="w-3.5 h-3.5" />
    <span>A Z</span>
  </button>
</div>
```

---

## 7. Caixas de Diálogo Modais (`base44-modal-dialog`)

Todas as caixas de diálogo modais devem empregar:
1. **Backdrop com Desfoque Óptico:** `fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4`.
2. **Caixa Central Branca:** `bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-100`.
3. **Inputs Arredondados:** `w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all`.
4. **Rodapé com Botões:**
   - Cancelar: `px-5 py-2.5 rounded-xl border border-slate-200 font-semibold text-sm text-slate-700 hover:bg-slate-50`.
   - Confirmar: `px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold text-sm text-white shadow-md`.

---

## 8. Checklist de Qualidade Visual

Antes de finalizar qualquer página:
- [ ] Os botões de ação do topo utilizam o formato em pílula `rounded-full` (`btn-primary-pill`, `btn-outline-emerald`, `btn-outline-neutral`)?
- [ ] O campo de pesquisa tem altura confortável (44px), borda 12px e ícone `Search` embutido à esquerda?
- [ ] As cores de status respeitam o padrão: Âmbar (Aguardo), Azul (Feito), Verde (Chegou) e Vermelho (Urgente)?
- [ ] Os cards de itens têm cantos arredondados (16px) e não usam tabelas cruas sem estilização?
- [ ] Todos os modais possuem `backdrop-filter: blur(4px)` e cantos arredondados consistentes?
