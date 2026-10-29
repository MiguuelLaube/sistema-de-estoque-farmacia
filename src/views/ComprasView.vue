<script setup lang="ts">
import { ref, computed } from 'vue';
import { useComprasStore } from '../stores/compras';
import { useEncomendasStore } from '../stores/encomendas';
import type { StatusCompra, CompraItem } from '../types';
import { parsearXmlNfe, correlacionarProdutos, type ProdutoExtraidoXml } from '../utils/xmlParser';
import {
  Package,
  FileSpreadsheet,
  Settings,
  Plus,
  Search,
  ShoppingCart,
  FileText,
  Zap,
  ArrowUpDown,
  Clock,
  CheckCircle,
  X,
  Upload,
  Tag,
} from 'lucide-vue-next';

const comprasStore = useComprasStore();
const encomendasStore = useEncomendasStore();

// Modals
const showNovoItemModal = ref(false);
const showImportXmlModal = ref(false);
const showArquivarChegouModal = ref(false);
const showClassificacoesModal = ref(false);
const showEditarItemModal = ref(false);
const itemEmEdicao = ref<CompraItem | null>(null);

// Active Tab ('items' | 'xml')
const activeViewTab = ref<'items' | 'xml'>('items');

// Filter & Sort State
const buscaTexto = ref('');
const filtroClassificacao = ref<string>('all');
const filtroStatus = ref<string>('all');
const ordenarUrgentes = ref(false);
const ordenarAZ = ref(false);

// Form: Novo Item Modal
const novoItemNome = ref('');
const novoItemClassificacaoId = ref('');
const novoItemQuantidade = ref<number | ''>('');
const novaClassificacaoNome = ref('');

// Autocomplete suggestions for New Item
const sugestoesAutocomplete = ref<Array<{ name: string; classification?: string }>>([]);
const showSugestoes = ref(false);

function buscarSugestoes(termo: string) {
  novoItemNome.value = termo.toUpperCase();
  if (termo.length >= 2) {
    const todosItens = comprasStore.currentCompras.map((i) => ({
      name: i.descricao,
      classification: i.classificacao?.nome,
    }));
    sugestoesAutocomplete.value = todosItens.filter((i) =>
      i.name.toUpperCase().includes(termo.toUpperCase())
    ).slice(0, 5);
    showSugestoes.value = sugestoesAutocomplete.value.length > 0;
  } else {
    showSugestoes.value = false;
  }
}

function selecionarSugestao(sug: { name: string; classification?: string }) {
  novoItemNome.value = sug.name;
  if (sug.classification) {
    const classObj = comprasStore.currentClassificacoes.find((c) => c.nome === sug.classification);
    if (classObj) {
      novoItemClassificacaoId.value = classObj.id;
    }
  }
  showSugestoes.value = false;
}

// XML Real Import State
const xmlFileInput = ref<HTMLInputElement | null>(null);
const xmlFileName = ref('');
const xmlCorrespondencias = ref<ProdutoExtraidoXml[]>([]);
const xmlImporting = ref(false);

// Items filtered and grouped by classification
const itensFiltrados = computed(() => {
  let list = comprasStore.currentCompras;

  if (buscaTexto.value.trim()) {
    const q = buscaTexto.value.toLowerCase().trim();
    list = list.filter((i) => i.descricao.toLowerCase().includes(q));
  }

  if (filtroClassificacao.value !== 'all') {
    list = list.filter((i) => i.classificacao_id === filtroClassificacao.value);
  }

  if (filtroStatus.value !== 'all') {
    list = list.filter((i) => {
      const st = i.status.toLowerCase();
      if (filtroStatus.value === 'aguardo') return st === 'aguardando' || st === 'aguardo';
      if (filtroStatus.value === 'feito') return st === 'pedido feito' || st === 'feito';
      if (filtroStatus.value === 'chegou') return st === 'chegou';
      return i.status === filtroStatus.value;
    });
  }

  // Sorting
  return [...list].sort((a, b) => {
    if (ordenarUrgentes.value) {
      const uA = a.urgente ? 1 : 0;
      const uB = b.urgente ? 1 : 0;
      if (uA !== uB) return uB - uA;
    }
    if (ordenarAZ.value) {
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    }
    return 0;
  });
});

const gruposPorClassificacao = computed(() => {
  const grupos: Record<string, { nome: string; itens: CompraItem[] }> = {};

  for (const item of itensFiltrados.value) {
    const nome = item.classificacao?.nome || 'OUTROS';
    if (!grupos[nome]) {
      grupos[nome] = { nome, itens: [] };
    }
    grupos[nome].itens.push(item);
  }

  return Object.values(grupos).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
});

function mudarStatusCompra(item: CompraItem, novoStatus: StatusCompra) {
  comprasStore.atualizarStatus(item.id, novoStatus, (id, status) => {
    encomendasStore.sincronizarStatusPorCompra(id, status);
  });
}

function alternarUrgencia(item: CompraItem) {
  item.urgente = !item.urgente;
}

function abrirEditarItem(item: CompraItem) {
  itemEmEdicao.value = { ...item };
  showEditarItemModal.value = true;
}

function salvarEdicaoItem() {
  if (!itemEmEdicao.value || !itemEmEdicao.value.descricao.trim()) return;
  comprasStore.atualizarItemCompra(itemEmEdicao.value.id, {
    descricao: itemEmEdicao.value.descricao,
    classificacao_id: itemEmEdicao.value.classificacao_id,
    quantidade: itemEmEdicao.value.quantidade,
  });
  showEditarItemModal.value = false;
}

function excluirItem(id: string) {
  if (confirm('Deseja realmente remover este item da lista de compras?')) {
    comprasStore.removerItemCompra(id);
    showEditarItemModal.value = false;
  }
}

function abrirModalNovoItem() {
  novoItemNome.value = '';
  novoItemClassificacaoId.value = comprasStore.currentClassificacoes[0]?.id || '';
  novoItemQuantidade.value = '';
  showNovoItemModal.value = true;
}

function salvarNovoItem() {
  if (!novoItemNome.value.trim()) {
    alert('Informe o nome do medicamento.');
    return;
  }
  if (!novoItemClassificacaoId.value) {
    alert('Selecione uma classificação.');
    return;
  }

  const descUpper = novoItemNome.value.trim().toUpperCase();
  const qtd = typeof novoItemQuantidade.value === 'number' && novoItemQuantidade.value > 0 ? novoItemQuantidade.value : 1;

  comprasStore.encontrarOuCriarCompraItem(
    descUpper,
    novoItemClassificacaoId.value,
    qtd,
    false,
    false
  );

  showNovoItemModal.value = false;
}

function criarNovaClassificacao() {
  if (!novaClassificacaoNome.value.trim()) return;
  const nomeUpper = novaClassificacaoNome.value.trim().toUpperCase();
  const existe = comprasStore.currentClassificacoes.some((c) => c.nome === nomeUpper);
  if (existe) {
    alert('Classificação já cadastrada!');
    return;
  }
  comprasStore.adicionarClassificacao(nomeUpper);
  novaClassificacaoNome.value = '';
}

function removerClassificacao(id: string) {
  comprasStore.removerClassificacao(id);
}

function abrirImportacaoXML() {
  xmlFileInput.value?.click();
}

// Leitor real de arquivos XML no navegador via FileReader/DOMParser (Documento Seção 3 / Pág. 9)
function processarArquivoXml(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  if (!file.name.toLowerCase().endsWith('.xml')) {
    alert('Por favor, selecione um arquivo válido com extensão .xml');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('O arquivo XML excede o tamanho máximo permitido (5 MB).');
    input.value = '';
    return;
  }

  xmlFileName.value = file.name;
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const conteudo = e.target?.result as string;
      const extraidos = parsearXmlNfe(conteudo);
      if (extraidos.length === 0) {
        alert('Nenhum produto foi localizado no XML selecionado.');
        return;
      }
      xmlCorrespondencias.value = correlacionarProdutos(extraidos, comprasStore.currentCompras);
      showImportXmlModal.value = true;
    } catch (err: any) {
      alert(`Falha ao ler XML: ${err.message || 'Arquivo mal formatado.'}`);
    }
  };

  reader.readAsText(file);
  input.value = '';
}

function marcarItemChegou(match: ProdutoExtraidoXml) {
  if (!match.itemCorrespondente) return;
  mudarStatusCompra(match.itemCorrespondente, 'Chegou');
  match.itemCorrespondente.status = 'Chegou';
  alert(`Item "${match.itemCorrespondente.descricao}" marcado como Chegou!`);
}

function confirmarImportacaoXML() {
  xmlImporting.value = true;
  let atualizados = 0;

  for (const match of xmlCorrespondencias.value) {
    if (match.selecionado && match.itemCorrespondente && match.itemCorrespondente.status !== 'Chegou') {
      mudarStatusCompra(match.itemCorrespondente, 'Chegou');
      atualizados++;
    }
  }

  xmlImporting.value = false;
  showImportXmlModal.value = false;
  alert(`${atualizados} item(ns) da lista de compras foram marcados como "Chegou" e integrados às encomendas!`);
}

function executarArquivarChegou() {
  const qtd = comprasStore.arquivarChegou();
  showArquivarChegouModal.value = false;
  alert(`${qtd} item(ns) com status "Chegou" foram arquivados e salvos no histórico local.`);
}

function exportarCsv() {
  comprasStore.exportarParaCSV(itensFiltrados.value);
}
</script>

<template>
  <div class="pedidos-page" style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem;">
    <!-- Top Action Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="font-size: 1.6rem; font-weight: 700; color: var(--text-main); font-family: var(--font-heading); margin: 0;">
          Pedidos
        </h1>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin: 3px 0 0;">
          Lista de compras para a farmácia
        </p>
      </div>

      <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
        <!-- Apagar Chegou (emerald green outline pill button) -->
        <button
          @click="showArquivarChegouModal = true"
          class="btn-outline-emerald"
          id="btn-apagar-chegou"
          title="Apagar todos os itens com status Chegou"
        >
          <Package :size="16" />
          <span>Apagar Chegou</span>
        </button>

        <!-- Exportar Excel (emerald green outline pill button) -->
        <button
          @click="exportarCsv"
          class="btn-outline-emerald"
          id="btn-exportar-excel"
          title="Exportar lista atual para Excel (CSV)"
        >
          <FileSpreadsheet :size="16" />
          <span>Exportar Excel</span>
        </button>

        <!-- Classificações (neutral outline pill button with gear icon) -->
        <button
          @click="showClassificacoesModal = true"
          class="btn-outline-neutral"
          id="btn-abrir-classificacoes"
        >
          <Settings :size="16" />
          <span>Classificações</span>
        </button>

        <!-- Adicionar Item (primary blue pill button with + icon) -->
        <button
          @click="abrirModalNovoItem"
          class="btn-primary-pill"
          id="btn-adicionar-item"
        >
          <Plus :size="16" />
          <span>Adicionar Item</span>
        </button>
      </div>
    </div>

    <!-- Full-width Search Input -->
    <div style="position: relative; width: 100%;">
      <Search :size="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted);" />
      <input
        v-model="buscaTexto"
        type="text"
        placeholder="Buscar medicamento por nome..."
        style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid #e2e8f0; background: #ffffff; padding-left: 2.6rem; padding-right: 1rem; font-size: 0.92rem; color: #0f172a; outline: none; transition: border-color 0.15s ease;"
        id="input-busca-pedidos"
      />
    </div>

    <!-- Navigation / Sub-tabs: Itens & Importar XML -->
    <div>
      <div class="sub-tabs-container">
        <button
          @click="activeViewTab = 'items'"
          class="sub-tab-btn"
          :class="{ active: activeViewTab === 'items' }"
        >
          <ShoppingCart :size="14" />
          <span>Itens</span>
        </button>

        <button
          @click="activeViewTab = 'xml'"
          class="sub-tab-btn"
          :class="{ active: activeViewTab === 'xml' }"
        >
          <FileText :size="14" />
          <span>Importar XML</span>
        </button>
      </div>
    </div>

    <!-- FILTER & SORT BAR (Light gray pill container matching screenshot) -->
    <div v-if="activeViewTab === 'items'" class="pedidos-filter-toolbar">
      <!-- Select: Todas as classificações -->
      <select v-model="filtroClassificacao" class="filter-toolbar-select">
        <option value="all">Todas as classificações</option>
        <option v-for="c in comprasStore.currentClassificacoes" :key="c.id" :value="c.id">
          {{ c.nome }}
        </option>
      </select>

      <!-- Select: Todos os status -->
      <select v-model="filtroStatus" class="filter-toolbar-select">
        <option value="all">Todos os status</option>
        <option value="aguardo">Aguardo</option>
        <option value="feito">Feito</option>
        <option value="chegou">Chegou</option>
      </select>

      <div class="toolbar-divider"></div>

      <span style="font-size: 0.78rem; font-weight: 600; color: #64748b;">Ordenar</span>

      <!-- Urgentes toggle button with Zap icon -->
      <button
        @click="ordenarUrgentes = !ordenarUrgentes"
        class="filter-toolbar-btn"
        :class="{ 'active-urgent': ordenarUrgentes }"
        title="Mostrar itens urgentes primeiro"
      >
        <Zap :size="14" />
        <span>Urgentes</span>
      </button>

      <!-- A-Z toggle button with sort icon -->
      <button
        @click="ordenarAZ = !ordenarAZ"
        class="filter-toolbar-btn"
        :class="{ 'active-az': ordenarAZ }"
      >
        <ArrowUpDown :size="14" />
        <span>A Z</span>
      </button>
    </div>

    <!-- ITEMS VIEW TAB -->
    <div v-if="activeViewTab === 'items'" style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div v-if="gruposPorClassificacao.length === 0" class="empty-state-card">
        <ShoppingCart :size="40" style="margin: 0 auto 0.75rem; opacity: 0.4;" />
        <p style="color: var(--text-muted); font-size: 0.95rem;">Nenhum item na lista de pedidos</p>
      </div>

      <div
        v-for="grupo in gruposPorClassificacao"
        :key="grupo.nome"
        style="display: flex; flex-direction: column; gap: 0.75rem;"
      >
        <!-- Category Tag Header (Blue pill matching screenshot 1) -->
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span class="category-header-pill">
            <Tag :size="12" />
            <span>{{ grupo.nome }}</span>
          </span>
          <span style="font-size: 0.8rem; color: #64748b; font-weight: 500;">
            {{ grupo.itens.length }} item(s)
          </span>
        </div>

        <!-- Items Cards List -->
        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div
            v-for="item in grupo.itens"
            :key="item.id"
            class="pedido-item-card"
            :id="'item-card-' + item.id"
          >
            <!-- Left Info: Name & Urgent flag -->
            <div style="min-width: 0; flex: 1;">
              <h4
                class="pedido-item-name"
                :class="{ 'text-red-urgent': item.urgente }"
              >
                {{ item.descricao }}
              </h4>

              <div
                v-if="item.urgente"
                class="urgent-subtitle"
              >
                <Zap :size="11" />
                <span>Urgente</span>
              </div>
            </div>

            <!-- Right Controls: Status Pills (Aguardo, Feito, Chegou), Lightning Zap button, Gear Settings -->
            <div style="display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0;">
              <!-- Aguardo Pill -->
              <button
                @click="mudarStatusCompra(item, 'Aguardando')"
                class="pedido-status-pill"
                :class="{ 'active-aguardo': item.status === 'Aguardando' }"
              >
                <Clock :size="13" />
                <span>Aguardo</span>
              </button>

              <!-- Feito Pill -->
              <button
                @click="mudarStatusCompra(item, 'Pedido Feito')"
                class="pedido-status-pill"
                :class="{ 'active-feito': item.status === 'Pedido Feito' }"
              >
                <CheckCircle :size="13" />
                <span>Feito</span>
              </button>

              <!-- Chegou Pill -->
              <button
                @click="mudarStatusCompra(item, 'Chegou')"
                class="pedido-status-pill"
                :class="{ 'active-chegou': item.status === 'Chegou' }"
              >
                <Package :size="13" />
                <span>Chegou</span>
              </button>

              <!-- Urgent Lightning Bolt Toggle Button -->
              <button
                @click="alternarUrgencia(item)"
                class="btn-icon-urgent"
                :class="{ 'active-urgent': item.urgente }"
                :title="item.urgente ? 'Remover urgência' : 'Marcar como urgência'"
              >
                <Zap :size="15" />
              </button>

              <!-- Gear Settings / Edit Button -->
              <button
                @click="abrirEditarItem(item)"
                class="btn-icon-gear"
                title="Editar ou excluir item"
              >
                <Settings :size="15" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- XML IMPORT TAB -->
    <div v-else-if="activeViewTab === 'xml'" class="card" style="padding: 2rem;">
      <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Importação de XML de Notas Fiscais</h3>
      <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.5rem;">
        Selecione o arquivo .xml da NF-e para conferir medicamentos faturados e atualizar os pedidos para "Chegou".
      </p>

      <input
        type="file"
        ref="xmlFileInput"
        accept=".xml"
        @change="processarArquivoXml"
        style="display: none;"
      />

      <button @click="abrirImportacaoXML" class="btn btn-primary">
        <Upload :size="16" />
        <span>Selecionar Arquivo XML</span>
      </button>
    </div>

    <!-- MODAL: ADICIONAR ITEM (matching screenshot 2 exactly) -->
    <div v-if="showNovoItemModal" class="modal-backdrop">
      <div class="base44-modal-dialog">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; font-family: var(--font-heading); margin: 0;">
            Adicionar Item
          </h3>
          <button
            @click="showNovoItemModal = false"
            style="background: none; border: none; cursor: pointer; color: #64748b; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;"
          >
            <X :size="20" />
          </button>
        </div>

        <form @submit.prevent="salvarNovoItem" style="display: flex; flex-direction: column; gap: 1.15rem;">
          <!-- Nome do Medicamento with Autocomplete -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Nome do Medicamento
            </label>
            <div style="position: relative;">
              <input
                :value="novoItemNome"
                @input="buscarSugestoes(($event.target as HTMLInputElement).value)"
                type="text"
                placeholder="Ex: PARACETAMOL 500MG"
                class="base44-modal-input"
                required
                id="input-novo-item-nome"
                autofocus
              />

              <div
                v-if="showSugestoes"
                class="autocomplete-dropdown"
              >
                <button
                  v-for="(sug, idx) in sugestoesAutocomplete"
                  :key="idx"
                  type="button"
                  @mousedown="selecionarSugestao(sug)"
                  class="autocomplete-item"
                >
                  <span style="font-weight: 600; font-size: 0.88rem;">{{ sug.name }}</span>
                  <span v-if="sug.classification" style="font-size: 0.72rem; color: #64748b;">{{ sug.classification }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Classificação Select -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Classificação
            </label>
            <select
              v-model="novoItemClassificacaoId"
              class="base44-modal-input"
              required
              id="select-novo-item-classificacao"
            >
              <option value="" disabled selected>Selecione uma classificação</option>
              <option v-for="c in comprasStore.currentClassificacoes" :key="c.id" :value="c.id">
                {{ c.nome }}
              </option>
            </select>
          </div>

          <!-- Quantidade (opcional) -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Quantidade <span style="font-weight: 400; color: #64748b; font-size: 0.82rem;">(opcional)</span>
            </label>
            <input
              v-model.number="novoItemQuantidade"
              type="number"
              min="1"
              placeholder="—"
              class="base44-modal-input"
              id="input-novo-item-qtd"
            />
          </div>

          <!-- Footer Action Buttons: Cancelar & Adicionar -->
          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
            <button
              type="button"
              @click="showNovoItemModal = false"
              class="modal-btn-cancelar"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="modal-btn-adicionar"
              id="btn-confirmar-adicionar-item"
            >
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: CLASSIFICAÇÕES -->
    <div v-if="showClassificacoesModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 460px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem; font-weight: 700;">Gerenciar Classificações</h3>
          <button @click="showClassificacoesModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
            <input
              v-model="novaClassificacaoNome"
              type="text"
              placeholder="Nova classificação..."
              class="form-input"
              @keydown.enter.prevent="criarNovaClassificacao"
            />
            <button @click="criarNovaClassificacao" class="btn btn-primary btn-sm">
              <Plus :size="15" />
              <span>Criar</span>
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 250px; overflow-y: auto;">
            <div
              v-for="c in comprasStore.currentClassificacoes"
              :key="c.id"
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.75rem; background: var(--bg-body); border-radius: var(--radius-md); border: 1px solid var(--border-color);"
            >
              <span style="font-weight: 600; font-size: 0.88rem;">{{ c.nome }}</span>
              <button
                @click="removerClassificacao(c.id)"
                style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.78rem; font-weight: 600;"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showClassificacoesModal = false" class="btn btn-secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: EDITAR / EXCLUIR ITEM -->
    <div v-if="showEditarItemModal && itemEmEdicao" class="modal-backdrop">
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem; font-weight: 700;">Editar Item de Compra</h3>
          <button @click="showEditarItemModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <label class="form-label">Nome do Medicamento</label>
            <input v-model="itemEmEdicao.descricao" type="text" class="form-input" />
          </div>

          <div>
            <label class="form-label">Classificação</label>
            <select v-model="itemEmEdicao.classificacao_id" class="form-select">
              <option v-for="c in comprasStore.currentClassificacoes" :key="c.id" :value="c.id">
                {{ c.nome }}
              </option>
            </select>
          </div>

          <div>
            <label class="form-label">Quantidade</label>
            <input v-model.number="itemEmEdicao.quantidade" type="number" min="1" class="form-input" />
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between;">
          <button
            @click="excluirItem(itemEmEdicao.id)"
            class="btn btn-sm btn-outline-destructive"
          >
            Excluir Item
          </button>
          <div style="display: flex; gap: 0.5rem;">
            <button @click="showEditarItemModal = false" class="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button @click="salvarEdicaoItem" class="btn btn-primary btn-sm">
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: IMPORTAR XML (Documento Seção 3 / Pág. 9) -->
    <div v-if="showImportXmlModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Processamento de XML de Nota Fiscal (NF-e)</h3>
          <button @click="showImportXmlModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div style="background: var(--bg-body); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 1rem; font-size: 0.85rem;">
            <div><strong>Arquivo:</strong> {{ xmlFileName }}</div>
            <div><strong>Total de Produtos Identificados:</strong> {{ xmlCorrespondencias.length }}</div>
            <div style="color: var(--text-muted); font-size: 0.78rem; margin-top: 4px;">
              * A importação de XML altera o status dos itens correspondentes para <strong>"Chegou"</strong> (sem duplicar itens).
            </div>
          </div>

          <div class="table-container" style="max-height: 340px; overflow-y: auto;">
            <table class="data-table" style="font-size: 0.82rem;">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center;">
                    <input
                      type="checkbox"
                      @change="(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        xmlCorrespondencias.forEach((it) => {
                          if (it.itemCorrespondente) it.selecionado = checked;
                        });
                      }"
                    />
                  </th>
                  <th>Produto no XML</th>
                  <th>Correspondência</th>
                  <th>Item no Estoque</th>
                  <th style="text-align: right;">Ação</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in xmlCorrespondencias" :key="it.id">
                  <td style="text-align: center;">
                    <input
                      type="checkbox"
                      v-model="it.selecionado"
                      :disabled="!it.itemCorrespondente || it.itemCorrespondente.status === 'Chegou'"
                    />
                  </td>

                  <td>
                    <div style="font-weight: 600;">{{ it.nomeOriginal }}</div>
                    <div v-if="it.quantidade" style="font-size: 0.72rem; color: var(--text-muted);">
                      Qtd NF: {{ it.quantidade }}
                    </div>
                  </td>

                  <td>
                    <span
                      v-if="it.tipoMatch === 'exato'"
                      class="badge badge-chegou"
                      style="font-size: 0.72rem;"
                    >
                      Exata
                    </span>
                    <span
                      v-else-if="it.tipoMatch === 'aproximado'"
                      class="badge"
                      style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 0.72rem;"
                    >
                      Aproximada
                    </span>
                    <span
                      v-else
                      class="badge"
                      style="background: #f1f5f9; color: #64748b; font-size: 0.72rem;"
                    >
                      Não localizado
                    </span>
                  </td>

                  <td>
                    <!-- Correspondência exata -->
                    <div v-if="it.tipoMatch === 'exato' && it.itemCorrespondente">
                      <div style="font-weight: 600;">{{ it.itemCorrespondente.descricao }}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);">
                        Status atual: {{ it.itemCorrespondente.status }}
                      </div>
                    </div>

                    <!-- Seleção manual em caso de correspondência aproximada (Documento Pág. 9) -->
                    <div v-else-if="it.tipoMatch === 'aproximado'">
                      <select
                        v-model="it.itemCorrespondente"
                        @change="it.selecionado = true"
                        class="form-select"
                        style="font-size: 0.78rem; padding: 4px 6px;"
                      >
                        <option
                          v-for="sug in it.sugestoesAproximadas"
                          :key="sug.item.id"
                          :value="sug.item"
                        >
                          {{ sug.item.descricao }} ({{ Math.round(sug.score * 100) }}% match)
                        </option>
                      </select>
                    </div>

                    <div v-else style="color: var(--text-muted); font-size: 0.78rem;">
                      Item não consta em compras abertas
                    </div>
                  </td>

                  <td style="text-align: right; white-space: nowrap;">
                    <button
                      v-if="it.itemCorrespondente"
                      @click="marcarItemChegou(it)"
                      class="btn btn-sm btn-secondary"
                      :disabled="it.itemCorrespondente.status === 'Chegou'"
                      style="font-size: 0.72rem; padding: 4px 8px;"
                    >
                      <Check :size="12" />
                      <span>{{ it.itemCorrespondente.status === 'Chegou' ? 'Já Chegou' : 'Marcar Chegou' }}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showImportXmlModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button
            @click="confirmarImportacaoXML"
            class="btn btn-primary"
            id="btn-confirmar-importacao-xml"
            :disabled="xmlImporting"
          >
            <Upload :size="16" />
            <span>Confirmar Selecionados como "Chegou"</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO: ARQUIVAR CHEGOU (Spec 5.6) -->
    <div v-if="showArquivarChegouModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Arquivar Itens Chegou</h3>
          <button @click="showArquivarChegouModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 0.75rem;">
            Os itens com status <strong>Chegou</strong> serão retirados da lista ativa de compras para liberar espaço para novos pedidos.
          </p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            O histórico continuará preservado para relatórios e cruzamento de custos. Deseja arquivar agora?
          </p>
        </div>
        <div class="modal-footer">
          <button @click="showArquivarChegouModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="executarArquivarChegou" class="btn btn-primary" id="btn-confirmar-arquivar-chegou">
            Confirmar Arquivamento
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
