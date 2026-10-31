<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useComprasStore } from '../stores/compras';
import { useEncomendasStore } from '../stores/encomendas';
import type { StatusCompra, CompraItem } from '../types';
import {
  parsearXmlNfe,
  extrairMetadadosXmlNfe,
  analisarXmlComIA,
  type ProdutoExtraidoXml,
  type MetadadosXmlNfe,
} from '../utils/xmlParser';
import { exportarRelatorioExcel } from '../utils/reportExporter';
import {
  Package,
  FileSpreadsheet,
  Settings,
  Plus,
  Search,
  ShoppingCart,
  Zap,
  ArrowUpDown,
  Clock,
  CheckCircle,
  Check,
  X,
  Upload,
  Tag,
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const comprasStore = useComprasStore();
const encomendasStore = useEncomendasStore();

// Modals
const showNovoItemModal = ref(false);
const showImportXmlModal = ref(false);
const showConfirmarChegouXmlModal = ref(false);
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
    sugestoesAutocomplete.value = todosItens
      .filter((i) => i.name.toUpperCase().includes(termo.toUpperCase()))
      .slice(0, 5);
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

// ============================================================================
// XML + INTELIGÊNCIA ARTIFICIAL (SELEÇÃO AUTOMÁTICA + CONFIRMAÇÃO EXPLÍCITA)
// ============================================================================
const xmlFileInput = ref<HTMLInputElement | null>(null);
const xmlFileName = ref('');
const xmlMetadados = ref<MetadadosXmlNfe>({});
const xmlCorrespondencias = ref<ProdutoExtraidoXml[]>([]);
const xmlAnalisandoIa = ref(false);
const xmlMotorIa = ref('EncoMed Pharma AI');
const xmlImporting = ref(false);
const arrastandoXml = ref(false);
const itensAlvoConfirmacao = ref<ProdutoExtraidoXml[]>([]);
const feedbackBanner = ref<string | null>(null);

function mostrarAvisoSucesso(msg: string) {
  feedbackBanner.value = msg;
  setTimeout(() => {
    if (feedbackBanner.value === msg) feedbackBanner.value = null;
  }, 5000);
}

const resumoAnaliseXml = computed(() => {
  const total = xmlCorrespondencias.value.length;
  const identificadosIa = xmlCorrespondencias.value.filter((i) => i.itemCorrespondente).length;
  const selecionados = xmlCorrespondencias.value.filter(
    (i) => i.selecionado && i.itemCorrespondente && i.itemCorrespondente.status !== 'Chegou'
  ).length;
  const alertasDosagem = xmlCorrespondencias.value.filter((i) => i.alertaDosagem).length;
  return { total, identificadosIa, selecionados, alertasDosagem };
});

const encomendasAfetadasConfirmacao = computed(() => {
  const compraIds = new Set(
    itensAlvoConfirmacao.value
      .map((m) => m.itemCorrespondente?.id)
      .filter((id): id is string => Boolean(id))
  );
  if (compraIds.size === 0) return 0;
  return encomendasStore.currentTenantEncomendas.filter(
    (enc) =>
      enc.status !== 'Entregue' &&
      enc.status !== 'Cancelada' &&
      enc.itens?.some((it) => it.compra_item_id && compraIds.has(it.compra_item_id))
  ).length;
});

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

async function mudarStatusCompra(item: CompraItem, novoStatus: StatusCompra) {
  await comprasStore.atualizarStatus(item.id, novoStatus, (id, status) => {
    encomendasStore.sincronizarStatusPorCompra(id, status);
  });
}

async function alternarUrgencia(item: CompraItem) {
  await comprasStore.alternarUrgencia(item.id);
}

function abrirEditarItem(item: CompraItem) {
  itemEmEdicao.value = { ...item };
  showEditarItemModal.value = true;
}

async function salvarEdicaoItem() {
  if (!itemEmEdicao.value || !itemEmEdicao.value.descricao.trim()) return;
  await comprasStore.atualizarItemCompra(itemEmEdicao.value.id, {
    descricao: itemEmEdicao.value.descricao,
    classificacao_id: itemEmEdicao.value.classificacao_id,
    quantidade: itemEmEdicao.value.quantidade,
  });
  showEditarItemModal.value = false;
}

async function excluirItem(id: string) {
  if (confirm('Deseja realmente remover este item da lista de compras?')) {
    await comprasStore.removerItemCompra(id);
    showEditarItemModal.value = false;
  }
}

function abrirModalNovoItem() {
  novoItemNome.value = '';
  novoItemClassificacaoId.value = comprasStore.currentClassificacoes[0]?.id || '';
  novoItemQuantidade.value = '';
  showNovoItemModal.value = true;
}

async function salvarNovoItem() {
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

  try {
    await comprasStore.encontrarOuCriarCompraItem(
      descUpper,
      novoItemClassificacaoId.value,
      qtd,
      false,
      false
    );
  } catch (err: any) {
    alert(err?.message || 'Não foi possível salvar o item de compra.');
    return;
  }

  showNovoItemModal.value = false;
}

async function criarNovaClassificacao() {
  if (!novaClassificacaoNome.value.trim()) return;
  const nomeUpper = novaClassificacaoNome.value.trim().toUpperCase();
  const existe = comprasStore.currentClassificacoes.some((c) => c.nome === nomeUpper);
  if (existe) {
    alert('Classificação já cadastrada!');
    return;
  }
  const criada = await comprasStore.adicionarClassificacao(nomeUpper);
  if (!criada) {
    alert(comprasStore.erroOperacao || 'Não foi possível cadastrar a categoria.');
    return;
  }
  novaClassificacaoNome.value = '';
}

async function removerClassificacao(id: string) {
  const ok = await comprasStore.removerClassificacao(id);
  if (!ok) alert(comprasStore.erroOperacao || 'Não foi possível excluir a categoria.');
}

function abrirImportacaoXML() {
  xmlFileInput.value?.click();
}

async function lerArquivoXmlComIA(file: File) {
  if (!file.name.toLowerCase().endsWith('.xml')) {
    alert('Por favor, selecione um arquivo válido com extensão .xml');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('O arquivo XML excede o tamanho máximo permitido (5 MB).');
    return;
  }

  xmlFileName.value = file.name;
  xmlAnalisandoIa.value = true;

  try {
    const conteudo = await file.text();
    const extraidos = parsearXmlNfe(conteudo);
    if (extraidos.length === 0) {
      alert('Nenhum produto foi localizado no XML selecionado.');
      return;
    }

    xmlMetadados.value = extrairMetadadosXmlNfe(conteudo);

    // A IA identifica os medicamentos que chegaram e os seleciona automaticamente (selecionado = true),
    // porém NUNCA altera o status sem a confirmação explícita do operador!
    const analise = await analisarXmlComIA(extraidos, comprasStore.currentCompras);
    xmlCorrespondencias.value = analise.correspondencias;
    xmlMotorIa.value = analise.motorUtilizado;
    showImportXmlModal.value = true;
  } catch (err: any) {
    alert(`Falha ao ler XML: ${err.message || 'Arquivo mal formatado.'}`);
  } finally {
    xmlAnalisandoIa.value = false;
  }
}

function processarArquivoXml(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    lerArquivoXmlComIA(file);
  }
  input.value = '';
}

function aoSoltarArquivoXml(event: DragEvent) {
  arrastandoXml.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    lerArquivoXmlComIA(file);
  }
}

// Solicita confirmação explícita para um item individual antes de mudar para "Chegou"
function solicitarConfirmacaoIndividual(match: ProdutoExtraidoXml) {
  if (!match.itemCorrespondente || match.itemCorrespondente.status === 'Chegou') return;
  itensAlvoConfirmacao.value = [match];
  showConfirmarChegouXmlModal.value = true;
}

// Solicita confirmação explícita para todos os itens auto-selecionados pela IA
function solicitarConfirmacaoSelecionados() {
  const selecionadosValidos = xmlCorrespondencias.value.filter(
    (m) => m.selecionado && m.itemCorrespondente && m.itemCorrespondente.status !== 'Chegou'
  );
  if (selecionadosValidos.length === 0) {
    alert('Selecione ao menos um medicamento identificado para mudar o status para "Chegou".');
    return;
  }
  itensAlvoConfirmacao.value = selecionadosValidos;
  showConfirmarChegouXmlModal.value = true;
}

// Executa efetivamente a mudança para "Chegou" APÓS o usuário confirmar no diálogo de segurança
function efetivarMudancaStatusChegouConfirmada() {
  xmlImporting.value = true;
  const processadosIds = new Set<string>();
  let atualizados = 0;

  for (const match of itensAlvoConfirmacao.value) {
    const alvo = match.itemCorrespondente;
    if (alvo && alvo.status !== 'Chegou' && !processadosIds.has(alvo.id)) {
      mudarStatusCompra(alvo, 'Chegou');
      alvo.status = 'Chegou';
      processadosIds.add(alvo.id);
      atualizados++;
    }
  }

  xmlImporting.value = false;
  showConfirmarChegouXmlModal.value = false;

  // Se todos os selecionados do modal principal foram baixados, fecha o modal principal também
  const restamSelecionados = xmlCorrespondencias.value.some(
    (m) => m.selecionado && m.itemCorrespondente && m.itemCorrespondente.status !== 'Chegou'
  );
  if (!restamSelecionados) {
    showImportXmlModal.value = false;
  }

  mostrarAvisoSucesso(
    `${atualizados} medicamento(s) confirmados e atualizados para "Chegou"! As encomendas vinculadas foram sincronizadas.`
  );
}

async function executarArquivarChegou() {
  const qtd = await comprasStore.arquivarChegou();
  showArquivarChegouModal.value = false;
  mostrarAvisoSucesso(`${qtd} item(ns) com status "Chegou" foram arquivados com sucesso.`);
}

function exportarPlanilhaExcel() {
  const cfg = authStore.currentConfig;
  const tenant = authStore.currentTenant;
  exportarRelatorioExcel({
    nomeArquivoBase: `lista_pedidos_${tenant.slug || 'farmacia'}`,
    tituloRelatorio: 'Lista Consolidada de Pedidos e Reposição',
    subtituloRelatorio: 'Itens filtrados por classificação e status operacional',
    nomeLoja: cfg.header_title || cfg.nome_sistema || 'EncoMed',
    corPrimariaHex: cfg.cor_primaria || '#2563eb',
    colunas: [
      { cabecalho: 'Medicamento / Produto', largura: 38, alinhamento: 'left', tipo: 'texto' },
      { cabecalho: 'Classificação', largura: 20, alinhamento: 'left', tipo: 'texto' },
      { cabecalho: 'Quantidade', largura: 14, alinhamento: 'center', tipo: 'inteiro' },
      { cabecalho: 'Status Atual', largura: 18, alinhamento: 'center', tipo: 'texto' },
      { cabecalho: 'Prioridade', largura: 15, alinhamento: 'center', tipo: 'texto' },
    ],
    linhas: itensFiltrados.value.map((i) => [
      i.descricao,
      i.classificacao?.nome || 'OUTROS',
      i.quantidade,
      i.status,
      i.urgente ? 'URGENTE' : 'Normal',
    ]),
  });
}
</script>

<template>
  <div class="pedidos-page" style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 3rem;">
    <!-- Top Action Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="font-size: 1.6rem; font-weight: 700; color: var(--text-main); font-family: var(--font-heading); margin: 0;">
          Pedidos & Conciliação NF-e
        </h1>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin: 3px 0 0;">
          Lista de compras da farmácia e leitura inteligente de XML com IA
        </p>
      </div>

      <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
        <button
          @click="showArquivarChegouModal = true"
          class="btn-outline-emerald"
          id="btn-apagar-chegou"
          title="Arquivar todos os itens com status Chegou"
        >
          <Package :size="16" />
          <span>Apagar Chegou</span>
        </button>

        <button
          @click="exportarPlanilhaExcel"
          class="btn-outline-emerald"
          id="btn-exportar-excel"
          title="Exportar lista atual para planilha Excel (.xlsx)"
        >
          <FileSpreadsheet :size="16" />
          <span>Exportar Excel (.xlsx)</span>
        </button>

        <button
          @click="showClassificacoesModal = true"
          class="btn-outline-neutral"
          id="btn-abrir-classificacoes"
        >
          <Settings :size="16" />
          <span>Classificações</span>
        </button>

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

    <!-- Banner de Sucesso -->
    <div
      v-if="feedbackBanner"
      style="padding: 0.75rem 1.15rem; border-radius: 9999px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; align-self: flex-start;"
    >
      <span>✅</span>
      <span>{{ feedbackBanner }}</span>
    </div>

    <!-- Full-width Search Input -->
    <div style="position: relative; width: 100%;">
      <Search :size="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted);" />
      <input
        v-model="buscaTexto"
        type="text"
        placeholder="Buscar medicamento por nome..."
        style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid var(--border-card); background: #ffffff; padding-left: 2.6rem; padding-right: 1rem; font-size: 0.92rem; color: #0f172a; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.03); transition: border-color 0.15s ease;"
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
          <span>Itens ({{ itensFiltrados.length }})</span>
        </button>

        <button
          @click="activeViewTab = 'xml'"
          class="sub-tab-btn"
          :class="{ active: activeViewTab === 'xml' }"
        >
          <Sparkles :size="14" />
          <span>Importar XML com IA</span>
        </button>
      </div>
    </div>

    <!-- FILTER & SORT BAR -->
    <div v-if="activeViewTab === 'items'" class="pedidos-filter-toolbar">
      <select v-model="filtroClassificacao" class="filter-toolbar-select">
        <option value="all">Todas as classificações</option>
        <option v-for="c in comprasStore.currentClassificacoes" :key="c.id" :value="c.id">
          {{ c.nome }}
        </option>
      </select>

      <select v-model="filtroStatus" class="filter-toolbar-select">
        <option value="all">Todos os status</option>
        <option value="aguardo">Aguardo</option>
        <option value="feito">Feito</option>
        <option value="chegou">Chegou</option>
      </select>

      <div class="toolbar-divider"></div>

      <span style="font-size: 0.78rem; font-weight: 600; color: #64748b;">Ordenar</span>

      <button
        @click="ordenarUrgentes = !ordenarUrgentes"
        class="filter-toolbar-btn"
        :class="{ 'active-urgent': ordenarUrgentes }"
        title="Mostrar itens urgentes primeiro"
      >
        <Zap :size="14" />
        <span>Urgentes</span>
      </button>

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
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span class="category-header-pill">
            <Tag :size="12" />
            <span>{{ grupo.nome }}</span>
          </span>
          <span style="font-size: 0.8rem; color: #64748b; font-weight: 500;">
            {{ grupo.itens.length }} item(s)
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div
            v-for="item in grupo.itens"
            :key="item.id"
            class="pedido-item-card"
            :id="'item-card-' + item.id"
          >
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

            <div style="display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0; flex-wrap: wrap;">
              <button
                @click="mudarStatusCompra(item, 'Aguardando')"
                class="pedido-status-pill"
                :class="{ 'active-aguardo': item.status === 'Aguardando' }"
              >
                <Clock :size="13" />
                <span>Aguardo</span>
              </button>

              <button
                @click="mudarStatusCompra(item, 'Pedido Feito')"
                class="pedido-status-pill"
                :class="{ 'active-feito': item.status === 'Pedido Feito' }"
              >
                <CheckCircle :size="13" />
                <span>Feito</span>
              </button>

              <button
                @click="mudarStatusCompra(item, 'Chegou')"
                class="pedido-status-pill"
                :class="{ 'active-chegou': item.status === 'Chegou' }"
              >
                <Package :size="13" />
                <span>Chegou</span>
              </button>

              <button
                @click="alternarUrgencia(item)"
                class="btn-icon-urgent"
                :class="{ 'active-urgent': item.urgente }"
                :title="item.urgente ? 'Remover urgência' : 'Marcar como urgência'"
              >
                <Zap :size="15" />
              </button>

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

    <!-- XML IMPORT TAB WITH AI -->
    <div v-else-if="activeViewTab === 'xml'" class="card" style="padding: 2rem;">
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
        <span class="category-header-pill">
          <Sparkles :size="13" />
          <span>CONCILIAÇÃO INTELIGENTE POR IA</span>
        </span>
      </div>

      <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.4rem;">
        Importação de XML da Nota Fiscal Eletrônica (NF-e)
      </h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; max-width: 720px; line-height: 1.55;">
        Envie o arquivo <code>.xml</code> recebido da distribuidora. A <strong>IA Farmacêutica do EncoMed</strong> analisa abreviações fiscais, princípios ativos e concentrações (mg/mcg), <strong>pré-seleciona automaticamente</strong> os medicamentos que chegaram e solicita sua <strong>confirmação final</strong> antes de alterar o status para <em>"Chegou"</em>.
      </p>

      <input
        type="file"
        ref="xmlFileInput"
        accept=".xml"
        @change="processarArquivoXml"
        style="display: none;"
      />

      <!-- Área Drag & Drop -->
      <div
        @dragover.prevent="arrastandoXml = true"
        @dragleave.prevent="arrastandoXml = false"
        @drop.prevent="aoSoltarArquivoXml"
        @click="!xmlAnalisandoIa && abrirImportacaoXML()"
        :style="{
          borderColor: arrastandoXml ? 'var(--color-primary)' : '#cbd5e1',
          background: arrastandoXml ? 'hsla(var(--primary), 0.05)' : '#f8fafc',
        }"
        style="border: 2px dashed; border-radius: 18px; padding: 2.75rem 1.5rem; text-align: center; cursor: pointer; transition: all 0.2s ease;"
      >
        <div v-if="xmlAnalisandoIa" style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
          <Loader2 class="animate-spin" :size="36" style="color: var(--color-primary);" />
          <div style="font-weight: 700; font-size: 1rem; color: #0f172a;">
            IA identificando medicamentos e validando concentrações...
          </div>
          <div style="font-size: 0.82rem; color: #64748b;">
            Cruzando itens da NF-e com sua lista de compras pendentes
          </div>
        </div>

        <div v-else style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
          <div style="width: 56px; height: 56px; border-radius: 9999px; background: #eff6ff; color: var(--color-primary); display: flex; align-items: center; justify-content: center;">
            <Upload :size="26" />
          </div>
          <div style="font-weight: 700; font-size: 1rem; color: #0f172a;">
            Arraste o arquivo XML da distribuidora aqui ou clique para selecionar
          </div>
          <div style="font-size: 0.82rem; color: #64748b;">
            Suporta XML oficial SEFAZ NF-e v4.00 (até 5 MB) • Nenhum dado pessoal de paciente é enviado
          </div>
          <button type="button" class="btn-primary-pill" style="margin-top: 0.4rem;">
            <Sparkles :size="16" />
            <span>Selecionar XML e Analisar com IA</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: ADICIONAR ITEM -->
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

              <div v-if="showSugestoes" class="autocomplete-dropdown">
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

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="button" @click="showNovoItemModal = false" class="modal-btn-cancelar">
              Cancelar
            </button>
            <button type="submit" class="modal-btn-adicionar" id="btn-confirmar-adicionar-item">
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
            <button @click="criarNovaClassificacao" class="btn-primary-pill">
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
          <button @click="showClassificacoesModal = false" class="btn-outline-neutral">
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
            <button @click="showEditarItemModal = false" class="btn-outline-neutral">
              Cancelar
            </button>
            <button @click="salvarEdicaoItem" class="btn-primary-pill">
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- MODAL ETAPA 1: REVISÃO DOS ITENS IDENTIFICADOS E SELECIONADOS (IA) -->
    <!-- ================================================================== -->
    <div v-if="showImportXmlModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 920px; width: 100%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
            <Sparkles :size="20" style="color: var(--color-primary);" />
            <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0;">
              Análise de NF-e por Inteligência Artificial
            </h3>
            <span class="badge badge-pedido-feito" style="font-size: 0.7rem;">{{ xmlMotorIa }}</span>
          </div>
          <button @click="showImportXmlModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Resumo da Análise IA -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
            <div style="padding: 0.75rem 0.9rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
              <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">ARQUIVO NF-E</div>
              <div style="font-size: 0.86rem; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ xmlMetadados.numeroNota ? `NF #${xmlMetadados.numeroNota} • ` : '' }}{{ xmlFileName }}
              </div>
              <div v-if="xmlMetadados.fornecedorNome" style="font-size: 0.7rem; color: #64748b;">
                {{ xmlMetadados.fornecedorNome }}
              </div>
            </div>

            <div style="padding: 0.75rem 0.9rem; border-radius: 12px; background: #eff6ff; border: 1px solid #bfdbfe;">
              <div style="font-size: 0.72rem; color: #1d4ed8; font-weight: 700;">IDENTIFICADOS PELA IA</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #1e40af;">
                {{ resumoAnaliseXml.identificadosIa }} de {{ resumoAnaliseXml.total }}
              </div>
            </div>

            <div style="padding: 0.75rem 0.9rem; border-radius: 12px; background: #ecfdf5; border: 1px solid #a7f3d0;">
              <div style="font-size: 0.72rem; color: #047857; font-weight: 700;">AUTO-SELECIONADOS</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #065f46;">
                {{ resumoAnaliseXml.selecionados }} item(ns)
              </div>
            </div>

            <div
              v-if="resumoAnaliseXml.alertasDosagem > 0"
              style="padding: 0.75rem 0.9rem; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a;"
            >
              <div style="font-size: 0.72rem; color: #b45309; font-weight: 700;">ALERTA DE DOSAGEM</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #92400e;">
                {{ resumoAnaliseXml.alertasDosagem }} p/ revisar
              </div>
            </div>
          </div>

          <div style="padding: 0.65rem 0.9rem; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 0.8rem; margin-bottom: 1rem;">
            🤖 <strong>Seleção Automática Inteligente:</strong> A IA já marcou automaticamente os medicamentos compatíveis que chegaram nesta nota. Revise a seleção abaixo e clique em <strong>"Revisar e Confirmar Chegada"</strong> — nenhum status será alterado sem a sua confirmação.
          </div>

          <div class="table-container" style="max-height: 360px; overflow-y: auto;">
            <table class="data-table" style="font-size: 0.82rem;">
              <thead>
                <tr>
                  <th style="width: 38px; text-align: center;">
                    <input
                      type="checkbox"
                      :checked="resumoAnaliseXml.selecionados > 0"
                      @change="(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        xmlCorrespondencias.forEach((it) => {
                          if (it.itemCorrespondente && it.itemCorrespondente.status !== 'Chegou') {
                            it.selecionado = checked;
                          }
                        });
                      }"
                    />
                  </th>
                  <th>Produto Faturado no XML</th>
                  <th>Diagnóstico IA</th>
                  <th>Pedido Vinculado na Farmácia</th>
                  <th style="text-align: right;">Ação Individual</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="it in xmlCorrespondencias"
                  :key="it.id"
                  :style="{
                    background: it.selecionado ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                  }"
                >
                  <td style="text-align: center;">
                    <input
                      type="checkbox"
                      v-model="it.selecionado"
                      :disabled="!it.itemCorrespondente || it.itemCorrespondente.status === 'Chegou'"
                      style="width: 16px; height: 16px; accent-color: #059669;"
                    />
                  </td>

                  <td>
                    <div style="font-weight: 700; color: #0f172a;">{{ it.nomeOriginal }}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 0.6rem; margin-top: 2px;">
                      <span v-if="it.quantidade">Qtd NF: <strong>{{ it.quantidade }}</strong></span>
                      <span v-if="it.ean">EAN: {{ it.ean }}</span>
                    </div>
                  </td>

                  <td>
                    <span
                      v-if="it.alertaDosagem"
                      class="badge"
                      style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-size: 0.71rem;"
                    >
                      ⚠️ Dosagem Divergente
                    </span>
                    <span
                      v-else-if="it.tipoMatch === 'exato'"
                      class="badge badge-chegou"
                      style="font-size: 0.71rem;"
                    >
                      ✨ IA {{ Math.round(it.confiancaIa * 100) }}% Exato
                    </span>
                    <span
                      v-else-if="it.tipoMatch === 'ia_semantico'"
                      class="badge badge-pedido-feito"
                      style="font-size: 0.71rem;"
                    >
                      🤖 IA {{ Math.round(it.confiancaIa * 100) }}% Semântico
                    </span>
                    <span
                      v-else-if="it.tipoMatch === 'aproximado'"
                      class="badge"
                      style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 0.71rem;"
                    >
                      Sugestão {{ Math.round(it.confiancaIa * 100) }}%
                    </span>
                    <span
                      v-else
                      class="badge"
                      style="background: #f1f5f9; color: #64748b; font-size: 0.71rem;"
                    >
                      Fora da Lista
                    </span>

                    <div style="font-size: 0.71rem; color: #64748b; margin-top: 3px; max-width: 230px; line-height: 1.3;">
                      {{ it.motivoIa }}
                    </div>
                  </td>

                  <td>
                    <div v-if="it.itemCorrespondente && it.sugestoesAproximadas.length <= 1">
                      <div style="font-weight: 700; color: #0f172a;">{{ it.itemCorrespondente.descricao }}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);">
                        Status atual: <strong>{{ it.itemCorrespondente.status }}</strong>
                      </div>
                    </div>

                    <div v-else-if="it.sugestoesAproximadas.length > 0">
                      <select
                        v-model="it.itemCorrespondente"
                        @change="it.selecionado = true; it.alertaDosagem = false"
                        class="form-select"
                        style="font-size: 0.78rem; padding: 5px 8px;"
                      >
                        <option
                          v-for="sug in it.sugestoesAproximadas"
                          :key="sug.item.id"
                          :value="sug.item"
                        >
                          {{ sug.item.descricao }} ({{ Math.round(sug.score * 100) }}%)
                        </option>
                      </select>
                      <div v-if="it.itemCorrespondente" style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">
                        Status atual: {{ it.itemCorrespondente.status }}
                      </div>
                    </div>

                    <div v-else style="color: var(--text-muted); font-size: 0.78rem;">
                      Sem pedido aguardando este item
                    </div>
                  </td>

                  <td style="text-align: right; white-space: nowrap;">
                    <button
                      v-if="it.itemCorrespondente"
                      type="button"
                      @click="solicitarConfirmacaoIndividual(it)"
                      class="btn-outline-emerald"
                      :disabled="it.itemCorrespondente.status === 'Chegou'"
                      style="font-size: 0.72rem; padding: 4px 10px;"
                    >
                      <Check :size="12" />
                      <span>{{ it.itemCorrespondente.status === 'Chegou' ? 'Já Chegou' : 'Mudar p/ Chegou' }}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <span style="font-size: 0.8rem; color: #64748b;">
            <strong>{{ resumoAnaliseXml.selecionados }}</strong> medicamento(s) selecionado(s) para confirmação
          </span>
          <div style="display: flex; gap: 0.65rem;">
            <button type="button" @click="showImportXmlModal = false" class="btn-outline-neutral">
              Cancelar
            </button>
            <button
              type="button"
              @click="solicitarConfirmacaoSelecionados"
              class="btn-primary-pill"
              id="btn-confirmar-importacao-xml"
              :disabled="xmlImporting || resumoAnaliseXml.selecionados === 0"
            >
              <CheckCircle :size="16" />
              <span>Mudar Selecionados para "Chegou" ({{ resumoAnaliseXml.selecionados }})</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- MODAL ETAPA 2: CONFIRMAÇÃO EXPLÍCITA ANTES DE MUDAR PARA "CHEGOU"  -->
    <!-- ================================================================== -->
    <div v-if="showConfirmarChegouXmlModal" class="modal-backdrop" style="z-index: 70;">
      <div class="base44-modal-dialog" style="max-width: 540px;">
        <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.85rem;">
          <div style="width: 40px; height: 40px; border-radius: 9999px; background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <ShieldAlert :size="20" />
          </div>
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0;">
              Confirmar Mudança de Status para "Chegou"?
            </h3>
            <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0;">
              A IA pré-selecionou estes medicamentos, mas aguarda sua autorização final.
            </p>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.85rem 1rem; max-height: 210px; overflow-y: auto; margin-bottom: 1rem;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">
            Medicamentos que passarão para "Chegou" ({{ itensAlvoConfirmacao.length }}):
          </div>
          <div
            v-for="m in itensAlvoConfirmacao"
            :key="m.id"
            style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.83rem;"
          >
            <div>
              <strong style="color: #0f172a;">{{ m.itemCorrespondente?.descricao }}</strong>
              <div style="font-size: 0.72rem; color: #64748b;">NF-e: {{ m.nomeOriginal }}</div>
            </div>
            <span class="badge badge-chegou" style="font-size: 0.7rem;">→ Chegou</span>
          </div>
        </div>

        <div
          v-if="encomendasAfetadasConfirmacao > 0"
          style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.75rem 0.9rem; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 0.8rem; margin-bottom: 1.15rem;"
        >
          <AlertTriangle :size="16" style="flex-shrink: 0; margin-top: 2px;" />
          <div>
            <strong>Impacto nas Encomendas:</strong> {{ encomendasAfetadasConfirmacao }} encomenda(s) de clientes estão vinculadas a estes medicamentos e serão atualizadas automaticamente (disparando o aviso do WhatsApp se todos os itens da encomenda tiverem chegado).
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.65rem;">
          <button
            type="button"
            @click="showConfirmarChegouXmlModal = false"
            class="btn-outline-neutral"
          >
            Voltar e Revisar
          </button>
          <button
            type="button"
            @click="efetivarMudancaStatusChegouConfirmada"
            class="btn-primary-pill"
            style="background: #059669;"
            id="btn-autorizar-mudanca-chegou-ia"
            :disabled="xmlImporting"
          >
            <Check :size="16" />
            <span>Sim, Confirmar Status "Chegou"</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO: ARQUIVAR CHEGOU -->
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
          <button @click="showArquivarChegouModal = false" class="btn-outline-neutral">
            Cancelar
          </button>
          <button @click="executarArquivarChegou" class="btn-primary-pill" id="btn-confirmar-arquivar-chegou">
            Confirmar Arquivamento
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
