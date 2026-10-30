<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import type { Encomenda, StatusEncomenda, Funcionario } from '../types';
import {
  Package,
  Clock,
  CheckCircle,
  CheckCircle2,
  Trash2,
  ArrowUpDown,
  Search,
  User,
  Pill,
  DollarSign,
  XCircle,
  Pencil,
  Printer,
  Copy,
  AlertTriangle,
  Plus,
  History,
  Check,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-vue-next';
import type { TipoModeloWhatsApp } from '../services/evolutionApi';
import HistoricoClienteModal from '../components/HistoricoClienteModal.vue';
import type { Cliente } from '../types';

const router = useRouter();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();

// Status Tabs & Filter
type TabKey = 'Aguardando' | 'Pedido Feito' | 'Chegou' | 'Entregue' | 'Pesquisa';
const activeTab = ref<TabKey>('Pedido Feito');
const sortAlphabetical = ref<boolean>(false);

// Search Tab State
const searchMode = ref<'medication' | 'customer'>('medication');
const searchQuery = ref<string>('');

const showApagarEntreguesModal = ref<boolean>(false);
const showCupomModal = ref<boolean>(false);
const showEditModal = ref<boolean>(false);
const showEmployeeModal = ref<boolean>(false);
const showHistoricoModal = ref<boolean>(false);
const clienteHistorico = ref<Cliente | null>(null);

const selectedEncomenda = ref<Encomenda | null>(null);
const cupomEncomenda = ref<Encomenda | null>(null);

function abrirHistoricoCliente(clienteId?: string) {
  if (!clienteId) return;
  const c = clientesStore.allClientes.find((x) => x.id === clienteId);
  if (c) {
    clienteHistorico.value = c;
    showHistoricoModal.value = true;
  }
}

// Employee Action Pending State
interface PendingAction {
  type: 'status' | 'togglePaid' | 'delete';
  orderId: string;
  statusTarget?: StatusEncomenda;
  paidTarget?: boolean;
}
const pendingAction = ref<PendingAction | null>(null);

// Controle de visibilidade de histórico por encomenda (minimalista)
const historicoAbertoIds = ref<Record<string, boolean>>({});

function toggleHistorico(orderId: string) {
  historicoAbertoIds.value[orderId] = !historicoAbertoIds.value[orderId];
}

function filtrarHistoricoHumano(historico?: Array<{ employee_name: string; action: string; timestamp: string }>) {
  if (!historico) return [];
  return historico.filter(
    (h) => !h.employee_name?.toLowerCase().includes('robô') && !h.employee_name?.toLowerCase().includes('evolution')
  );
}

// Edit Order Form State
const editClienteId = ref<string>('');
const editObservacao = ref<string>('');
const editItens = ref<Array<{ descricao: string; quantidade: number; precoUnitario: number }>>([]);

// Formats
function formatBRL(val: number): string {
  return 'R$ ' + (Number(val) || 0).toFixed(2).replace('.', ',');
}

function formatDate(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatHistoryDate(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `às ${hours}:${minutes} de ${day}/${month}`;
}

// All tenant orders enriched
const currentOrders = computed(() => {
  let list = encomendasStore.currentTenantEncomendas;
  if (sortAlphabetical.value) {
    list = [...list].sort((a, b) => {
      const nameA = a.cliente?.nome || '';
      const nameB = b.cliente?.nome || '';
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }
  return list;
});

// Counts for tabs
const counts = computed(() => {
  const list = encomendasStore.currentTenantEncomendas;
  return {
    Aguardando: list.filter((e) => e.status === 'Aguardando').length,
    'Pedido Feito': list.filter((e) => e.status === 'Pedido Feito').length,
    Chegou: list.filter((e) => e.status === 'Chegou').length,
    Entregue: list.filter((e) => e.status === 'Entregue').length,
    Total: list.length,
  };
});

// Filtered list for current tab
const tabOrders = computed(() => {
  if (activeTab.value === 'Pesquisa') return [];
  return currentOrders.value.filter((e) => e.status === activeTab.value);
});

// Search results
const searchOrders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return currentOrders.value.filter((e) => {
    if (searchMode.value === 'medication') {
      return e.itens?.some((i) => i.descricao.toLowerCase().includes(q));
    } else {
      return e.cliente?.nome.toLowerCase().includes(q) || e.cliente?.telefone.includes(q);
    }
  });
});

// Status Badge Config (ui-design-padrao-farmacia)
function getStatusBadge(status: StatusEncomenda) {
  switch (status) {
    case 'Aguardando':
      return { label: 'Aguardando', icon: Clock, bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
    case 'Pedido Feito':
      return { label: 'Pedido Feito', icon: CheckCircle, bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
    case 'Chegou':
      return { label: 'Chegou', icon: Package, bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
    case 'Entregue':
      return { label: 'Entregue', icon: CheckCircle2, bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };
    default:
      return { label: status, icon: Clock, bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  }
}

// Order Status Changer Click
function requestStatusChange(orderId: string, novoStatus: StatusEncomenda) {
  pendingAction.value = {
    type: 'status',
    orderId,
    statusTarget: novoStatus,
  };
  showEmployeeModal.value = true;
}

// Payment Status Toggle Click
function requestTogglePaid(order: Encomenda) {
  const targetPaid = order.situacao_pagamento !== 'Pago';
  pendingAction.value = {
    type: 'togglePaid',
    orderId: order.id,
    paidTarget: targetPaid,
  };
  showEmployeeModal.value = true;
}

// Delete Order Click
function requestDeleteOrder(orderId: string) {
  if (confirm('Tem certeza que deseja apagar esta encomenda?')) {
    encomendasStore.removerEncomenda(orderId);
  }
}

const listaAtendentesModal = computed<Funcionario[]>(() => {
  if (authStore.tenantFuncionarios.length > 0) {
    return authStore.tenantFuncionarios;
  }
  return [
    {
      id: authStore.currentUser.id || 'usuario-atual',
      tenant_id: authStore.activeTenantId,
      nome: (authStore.currentUser.nome || 'ATENDIMENTO').toUpperCase(),
      cargo: 'Usuário Autenticado',
      criado_em: new Date().toISOString(),
    },
  ];
});

// Confirm action with employee (BUG-09 FIX: respeita alçada real do usuário logado e exibe erro de governança)
function confirmEmployeeAction(employee: Funcionario) {
  if (!pendingAction.value) return;

  const { type, orderId, statusTarget, paidTarget } = pendingAction.value;

  if (type === 'status' && statusTarget) {
    const res = encomendasStore.alterarStatus(orderId, statusTarget, {
      autorizacaoAdmin: authStore.isAdmin,
      funcionarioNome: employee.nome,
    });
    if (!res.sucesso) {
      alert(res.mensagem || 'Operação bloqueada pelas políticas de alçada da loja.');
    }
  } else if (type === 'togglePaid' && paidTarget !== undefined) {
    encomendasStore.alternarPago(orderId, paidTarget, employee.nome);
  }

  showEmployeeModal.value = false;
  pendingAction.value = null;
}

// Edit Order
function openEditOrder(order: Encomenda) {
  selectedEncomenda.value = order;
  editClienteId.value = order.cliente_id;
  editObservacao.value = order.observacao || '';
  editItens.value = (order.itens || []).map((i) => ({
    descricao: i.descricao,
    quantidade: i.quantidade,
    precoUnitario: i.preco_unitario,
  }));
  showEditModal.value = true;
}

function saveEditOrder() {
  if (!selectedEncomenda.value) return;
  encomendasStore.atualizarEncomenda(selectedEncomenda.value.id, {
    cliente_id: editClienteId.value,
    observacao: editObservacao.value,
    itensNovos: editItens.value,
    funcionarioNome: authStore.currentUser.nome,
  });
  showEditModal.value = false;
  selectedEncomenda.value = null;
}

// Cupom Thermal Print
function openCupom(order: Encomenda) {
  cupomEncomenda.value = order;
  showCupomModal.value = true;
}

function printCupom() {
  window.print();
}

// Delete Delivered Orders in Batch
function confirmApagarEntregues() {
  encomendasStore.apagarEntreguesDefinitivo();
  showApagarEntreguesModal.value = false;
}

// Clipboard Actions
function copyArrivalMessage(order: Encomenda) {
  const text = encomendasStore.obterTextoAvisoChegada(order);
  navigator.clipboard.writeText(text);
  alert('Mensagem copiada para a área de transferência!');
}

function copyOrderSummary(order: Encomenda) {
  const text = encomendasStore.obterResumoEncomenda(order);
  navigator.clipboard.writeText(text);
  alert('Resumo copiado para a área de transferência!');
}
// Disparo de qualquer modelo de WhatsApp configurado via API (com fallback wa.me)
const enviandoAvisoId = ref<string | null>(null);

function alternarAvisado(order: Encomenda) {
  const novoEstado = !order.cliente_avisado;
  encomendasStore.alternarClienteAvisado(order.id, novoEstado, authStore.currentUser.nome);
}

async function enviarModeloWhatsappCard(order: Encomenda, modelo: TipoModeloWhatsApp = 'chegada') {
  const cfg = authStore.currentConfig;
  const cliente = clientesStore.allClientes.find((c) => c.id === order.cliente_id) || order.cliente;
  if (!cliente || !cliente.telefone) {
    alert('Cliente não possui telefone cadastrado para disparo.');
    return;
  }

  const chaveLoading = `${order.id}-${modelo}`;

  if (!cfg.evolution_api_ativo) {
    const link = encomendasStore.gerarLinkWhatsApp(order, modelo);
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
      if (modelo === 'chegada') {
        encomendasStore.alternarClienteAvisado(order.id, true, authStore.currentUser.nome);
      }
    }
    return;
  }

  enviandoAvisoId.value = chaveLoading;
  try {
    const res = await encomendasStore.dispararNotificacaoModeloEvolution(order, modelo, true);

    if (res.sucesso) {
      const titulos: Record<TipoModeloWhatsApp, string> = {
        chegada: 'Aviso de chegada',
        pedido: 'Confirmação de pedido',
        cobranca: 'Lembrete de saldo',
        entregue: 'Comprovante de entrega',
        personalizado: 'Mensagem',
      };
      alert(`✅ ${titulos[modelo]} enviado com sucesso pela API para ${cliente.nome}!`);
    } else {
      const abrirManual = confirm(
        `❌ Falha no disparo pela API: ${res.mensagem}\n\nDeseja abrir esta mensagem pré-formatada no WhatsApp Web?`
      );
      if (abrirManual) {
        const link = encomendasStore.gerarLinkWhatsApp(order, modelo);
        if (link) window.open(link, '_blank', 'noopener,noreferrer');
      }
    }
  } catch {
    alert('Não foi possível conectar ao serviço de mensageria no momento.');
  } finally {
    enviandoAvisoId.value = null;
  }
}

async function enviarAvisoWhatsappRobo(order: Encomenda) {
  return enviarModeloWhatsappCard(order, 'chegada');
}
</script>

<template>
  <div style="max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 3rem;">
    <!-- PAGE HEADER (matching Screenshot 1) -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="font-size: 1.6rem; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-heading);">
          Encomendas
        </h1>
        <p style="font-size: 0.88rem; color: #64748b; margin: 3px 0 0;">
          {{ counts.Total }} encomendas no total
        </p>
      </div>

      <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
        <!-- Button: Apagar Entregues (emerald outline pill button) -->
        <button
          @click="showApagarEntreguesModal = true"
          class="btn-outline-emerald"
          id="btn-apagar-entregues"
          title="Apagar encomendas entregues"
        >
          <Trash2 :size="16" />
          <span>Apagar Entregues</span>
        </button>

        <!-- Button: A–Z (outline neutral / active blue pill button) -->
        <button
          @click="sortAlphabetical = !sortAlphabetical"
          class="btn-outline-neutral"
          :style="{
            borderColor: sortAlphabetical ? '#2563eb' : '#cbd5e1',
            backgroundColor: sortAlphabetical ? '#eff6ff' : '#ffffff',
            color: sortAlphabetical ? '#2563eb' : '#334155',
          }"
          id="btn-sort-alfabetico"
        >
          <ArrowUpDown :size="15" />
          <span>A–Z</span>
        </button>

        <!-- Button: Nova Encomenda (primary pill button) -->
        <button
          @click="router.push('/nova-encomenda')"
          class="btn-primary-pill"
          id="btn-nova-encomenda-top"
        >
          <Plus :size="16" />
          <span>Nova Encomenda</span>
        </button>
      </div>
    </div>

    <!-- TABS BAR (matching Screenshot 1: rounded gray pill bar with 5 items) -->
    <div
      style="
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        background: #f1f5f9;
        padding: 4px;
        border-radius: 12px;
        gap: 4px;
      "
    >
      <button
        @click="activeTab = 'Aguardando'"
        :style="{
          background: activeTab === 'Aguardando' ? '#ffffff' : 'transparent',
          color: activeTab === 'Aguardando' ? '#0f172a' : '#64748b',
          boxShadow: activeTab === 'Aguardando' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'Aguardando' ? 600 : 500,
        }"
        style="padding: 0.65rem 0.5rem; border-radius: 8px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s ease;"
      >
        Aguardando <span style="font-size: 0.76rem; opacity: 0.7;">({{ counts.Aguardando }})</span>
      </button>

      <button
        @click="activeTab = 'Pedido Feito'"
        :style="{
          background: activeTab === 'Pedido Feito' ? '#ffffff' : 'transparent',
          color: activeTab === 'Pedido Feito' ? '#0f172a' : '#64748b',
          boxShadow: activeTab === 'Pedido Feito' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'Pedido Feito' ? 600 : 500,
        }"
        style="padding: 0.65rem 0.5rem; border-radius: 8px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s ease;"
      >
        Pedido Feito <span style="font-size: 0.76rem; opacity: 0.7;">({{ counts['Pedido Feito'] }})</span>
      </button>

      <button
        @click="activeTab = 'Chegou'"
        :style="{
          background: activeTab === 'Chegou' ? '#ffffff' : 'transparent',
          color: activeTab === 'Chegou' ? '#0f172a' : '#64748b',
          boxShadow: activeTab === 'Chegou' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'Chegou' ? 600 : 500,
        }"
        style="padding: 0.65rem 0.5rem; border-radius: 8px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s ease;"
      >
        Chegou <span style="font-size: 0.76rem; opacity: 0.7;">({{ counts.Chegou }})</span>
      </button>

      <button
        @click="activeTab = 'Entregue'"
        :style="{
          background: activeTab === 'Entregue' ? '#ffffff' : 'transparent',
          color: activeTab === 'Entregue' ? '#0f172a' : '#64748b',
          boxShadow: activeTab === 'Entregue' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'Entregue' ? 600 : 500,
        }"
        style="padding: 0.65rem 0.5rem; border-radius: 8px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s ease;"
      >
        Entregue <span style="font-size: 0.76rem; opacity: 0.7;">({{ counts.Entregue }})</span>
      </button>

      <button
        @click="activeTab = 'Pesquisa'"
        :style="{
          background: activeTab === 'Pesquisa' ? '#ffffff' : 'transparent',
          color: activeTab === 'Pesquisa' ? '#0f172a' : '#64748b',
          boxShadow: activeTab === 'Pesquisa' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontWeight: activeTab === 'Pesquisa' ? 600 : 500,
        }"
        style="padding: 0.65rem 0.5rem; border-radius: 8px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s ease;"
      >
        Pesquisa
      </button>
    </div>

    <!-- VIEW: PESQUISA -->
    <div v-if="activeTab === 'Pesquisa'" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <!-- Toggle Medicamento / Cliente -->
        <div style="display: flex; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
          <button
            @click="searchMode = 'medication'"
            :style="{
              background: searchMode === 'medication' ? '#2563eb' : '#ffffff',
              color: searchMode === 'medication' ? '#ffffff' : '#64748b',
            }"
            style="padding: 0.55rem 1rem; border: none; font-size: 0.88rem; font-weight: 600; cursor: pointer;"
          >
            Medicamento
          </button>
          <button
            @click="searchMode = 'customer'"
            :style="{
              background: searchMode === 'customer' ? '#2563eb' : '#ffffff',
              color: searchMode === 'customer' ? '#ffffff' : '#64748b',
            }"
            style="padding: 0.55rem 1rem; border: none; font-size: 0.88rem; font-weight: 600; cursor: pointer;"
          >
            Cliente
          </button>
        </div>

        <!-- Search Input -->
        <div style="position: relative; flex: 1; min-width: 260px;">
          <Search :size="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8;" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="searchMode === 'medication' ? 'Buscar por medicamento...' : 'Buscar por cliente...'"
            style="
              width: 100%;
              height: 42px;
              border-radius: 10px;
              border: 1.5px solid var(--border-color);
              background: #ffffff;
              padding-left: 2.5rem;
              padding-right: 1rem;
              font-size: 0.9rem;
              color: #0f172a;
              outline: none;
            "
          />
        </div>
      </div>

      <!-- Search Results -->
      <div v-if="searchOrders.length === 0" style="text-align: center; padding: 4rem 1rem;">
        <Search :size="40" style="margin: 0 auto 0.75rem; color: #94a3b8; opacity: 0.4;" />
        <p style="color: #64748b; font-size: 0.95rem;">Nenhuma encomenda encontrada</p>
      </div>

      <div v-else style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div
          v-for="ord in searchOrders"
          :key="ord.id"
          class="encomenda-search-card-block"
          :id="'search-order-card-' + ord.id"
        >
          <div style="min-width: 0;">
            <p style="font-weight: 600; font-size: 0.92rem; color: #0f172a; margin: 0; text-transform: uppercase;">
              {{ ord.itens?.map((i) => i.descricao).join(', ') || 'Sem medicamento' }}
            </p>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 3px;">
              <span style="font-size: 0.78rem; color: #64748b;">
                {{ ord.cliente?.nome || 'Cliente' }}
              </span>
              <button
                v-if="ord.cliente_id"
                type="button"
                @click.stop="abrirHistoricoCliente(ord.cliente_id)"
                style="display: inline-flex; align-items: center; gap: 3px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 1px 6px; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; cursor: pointer;"
                title="Ver histórico de remédios deste cliente"
              >
                <History :size="11" />
                <span>Histórico</span>
              </button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
            <span style="font-size: 0.92rem; font-weight: 700; color: #2563eb;">
              {{ formatBRL(ord.valor_total) }}
            </span>

            <span
              :style="{
                background: getStatusBadge(ord.status).bg,
                color: getStatusBadge(ord.status).color,
                borderColor: getStatusBadge(ord.status).border,
              }"
              style="padding: 0.25rem 0.65rem; border-radius: 9999px; font-size: 0.74rem; font-weight: 600; border: 1px solid;"
            >
              {{ ord.status }}
            </span>

            <button
              @click="openCupom(ord)"
              style="width: 32px; height: 32px; border-radius: 8px; border: none; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; cursor: pointer;"
              title="Imprimir Cupom"
            >
              <Printer :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW: STATUS TABS (Aguardando / Pedido Feito / Chegou / Entregue) -->
    <div v-else>
      <!-- Empty state -->
      <div v-if="tabOrders.length === 0" style="text-align: center; padding: 4.5rem 1rem;">
        <Package :size="44" style="margin: 0 auto 0.75rem; color: #94a3b8; opacity: 0.4;" />
        <p style="color: #64748b; font-size: 0.95rem;">Nenhuma encomenda nesta categoria</p>
      </div>

      <!-- 3-Column Grid of Order Cards (whe matching Screenshot 1) -->
      <div
        v-else
        style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1rem;
          align-items: start;
        "
      >
        <div
          v-for="order in tabOrders"
          :key="order.id"
          class="encomenda-card-block"
          :id="'order-card-' + order.id"
        >
          <!-- Card Header: Status Badge, Date & Edit Pencil -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <!-- Status Badge -->
            <span
              :style="{
                background: getStatusBadge(order.status).bg,
                color: getStatusBadge(order.status).color,
                borderColor: getStatusBadge(order.status).border,
              }"
              style="
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                padding: 0.3rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.76rem;
                font-weight: 600;
                border: 1px solid;
              "
            >
              <component :is="getStatusBadge(order.status).icon" :size="13" />
              <span>{{ getStatusBadge(order.status).label }}</span>
            </span>

            <!-- Date & Edit Icon -->
            <div style="display: flex; align-items: center; gap: 0.45rem;">
              <span style="font-size: 0.76rem; color: #94a3b8;">
                {{ formatDate(order.criado_em) }}
              </span>

              <button
                @click="openEditOrder(order)"
                style="
                  width: 28px;
                  height: 28px;
                  border-radius: 6px;
                  border: none;
                  background: none;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #94a3b8;
                  cursor: pointer;
                  transition: color 0.15s ease;
                "
                onmouseover="this.style.color='#2563eb'"
                onmouseout="this.style.color='#94a3b8'"
                title="Editar Encomenda"
                :id="'btn-edit-order-' + order.id"
              >
                <Pencil :size="14" />
              </button>
            </div>
          </div>

          <!-- Customer Name & History Button -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.92rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
              <User :size="15" style="color: #94a3b8; flex-shrink: 0;" />
              <span style="font-weight: 700; color: #0f172a; text-transform: uppercase;">
                {{ order.cliente?.nome || 'CLIENTE' }}
              </span>
            </div>

            <button
              v-if="order.cliente_id"
              type="button"
              @click.stop="abrirHistoricoCliente(order.cliente_id)"
              style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                background: #eff6ff;
                color: #2563eb;
                border: 1px solid #bfdbfe;
                padding: 2px 8px;
                border-radius: 9999px;
                font-size: 0.73rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                flex-shrink: 0;
              "
              title="Ver histórico de remédios pedidos deste cliente"
            >
              <History :size="12" />
              <span>Histórico</span>
            </button>
          </div>

          <!-- Medications List -->
          <div style="display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.88rem;">
            <Pill :size="15" style="color: #94a3b8; flex-shrink: 0; margin-top: 2px;" />
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
              <div
                v-for="(it, iIdx) in (order.itens || [])"
                :key="iIdx"
                style="display: flex; align-items: center; gap: 4px; text-transform: uppercase;"
              >
                <span style="font-weight: 700; color: #2563eb;">{{ it.quantidade }}x</span>
                <span style="color: #1e293b; font-weight: 500;">{{ it.descricao }}</span>
              </div>
            </div>
          </div>

          <!-- Price -->
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem;">
            <DollarSign :size="15" style="color: #2563eb; flex-shrink: 0;" />
            <span style="font-weight: 700; color: #2563eb;">
              {{ formatBRL(order.valor_total) }}
            </span>
          </div>

          <!-- Payment Status Toggle Button -->
          <button
            type="button"
            @click="requestTogglePaid(order)"
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              width: 100%;
              background: none;
              border: none;
              padding: 0;
              cursor: pointer;
              font-size: 0.86rem;
            "
            :id="'btn-toggle-paid-' + order.id"
          >
            <div style="display: flex; align-items: center; gap: 0.45rem;">
              <CheckCircle
                v-if="order.situacao_pagamento === 'Pago'"
                :size="15"
                style="color: #16a34a;"
              />
              <XCircle
                v-else
                :size="15"
                style="color: #ef4444;"
              />
              <span
                :style="{
                  color: order.situacao_pagamento === 'Pago' ? '#16a34a' : '#ef4444',
                  fontWeight: 600,
                }"
              >
                {{ order.situacao_pagamento === 'Pago' ? 'Pago' : 'Não pago' }}
              </span>
            </div>

            <span style="font-size: 0.75rem; color: #94a3b8;">
              clique para alterar
            </span>
          </button>

          <!-- Price Summary Box (Preço a cobrar / Valor já pago) -->
          <div
            style="
              display: flex;
              flex-direction: column;
              gap: 0.25rem;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 0.5rem 0.75rem;
              font-size: 0.78rem;
            "
          >
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #64748b;">Preço a cobrar</span>
              <span style="font-weight: 700; color: #0f172a;">
                {{ formatBRL(Math.max(0, order.valor_total - order.valor_pago)) }}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #64748b;">Valor já pago</span>
              <span style="font-weight: 700; color: #16a34a;">
                {{ formatBRL(order.valor_pago) }}
              </span>
            </div>
          </div>

          <!-- Direct Status Selector Pills (Aguardando / Pedido Feito / Chegou / Entregue) -->
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
            <button
              v-for="st in (['Aguardando', 'Pedido Feito', 'Chegou', 'Entregue'] as StatusEncomenda[])"
              :key="st"
              @click="requestStatusChange(order.id, st)"
              :style="{
                background: order.status === st ? '#2563eb' : '#ffffff',
                color: order.status === st ? '#ffffff' : '#64748b',
                borderColor: order.status === st ? '#2563eb' : '#e2e8f0',
                fontWeight: order.status === st ? 600 : 500,
              }"
              style="
                padding: 0.25rem 0.6rem;
                border-radius: 8px;
                border: 1px solid;
                font-size: 0.74rem;
                cursor: pointer;
                transition: all 0.15s ease;
              "
              :id="'btn-status-' + st.replace(' ', '-').toLowerCase() + '-' + order.id"
            >
              {{ st }}
            </button>
          </div>

          <!-- Histórico Minimalista Expansível (Apenas ícone de relógio com setinha, sem robô) -->
          <div
            v-if="filtrarHistoricoHumano(order.historico).length > 0"
            style="
              margin-top: 0.35rem;
              padding-top: 0.5rem;
              border-top: 1px solid #f1f5f9;
            "
          >
            <!-- Botão Minimalista: Relógio + Setinha -->
            <button
              type="button"
              @click="toggleHistorico(order.id)"
              style="
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                background: none;
                border: none;
                padding: 2px 4px;
                color: #64748b;
                font-size: 0.74rem;
                font-weight: 600;
                cursor: pointer;
                border-radius: 6px;
                transition: color 0.15s ease;
              "
              onmouseover="this.style.color='#2563eb'"
              onmouseout="this.style.color='#64748b'"
              title="Clique para ver/ocultar histórico de alterações"
            >
              <Clock :size="13" />
              <span>Histórico</span>
              <ChevronUp v-if="historicoAbertoIds[order.id]" :size="13" />
              <ChevronDown v-else :size="13" />
            </button>

            <!-- Lista de Histórico Ocultável -->
            <div
              v-if="historicoAbertoIds[order.id]"
              style="
                margin-top: 0.4rem;
                padding: 0.5rem 0.65rem;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
              "
            >
              <div
                v-for="(hist, hIdx) in [...filtrarHistoricoHumano(order.historico)].reverse()"
                :key="hIdx"
                style="font-size: 0.73rem; color: #475569; line-height: 1.35;"
              >
                <strong style="color: #0f172a; text-transform: uppercase;">{{ hist.employee_name }}</strong>
                <span> {{ hist.action }}</span>
                <span style="opacity: 0.7; color: #64748b;"> {{ formatHistoryDate(hist.timestamp) }}</span>
              </div>
            </div>
          </div>

          <!-- CARD DE IDENTIFICAÇÃO DE AVISO AO CLIENTE (STATUS CHEGOU) -->
          <div
            v-if="order.status === 'Chegou'"
            :style="{
              background: order.cliente_avisado ? '#ecfdf5' : '#fffbeb',
              borderColor: order.cliente_avisado ? '#a7f3d0' : '#fde68a',
            }"
            style="
              display: flex;
              flex-direction: column;
              gap: 0.65rem;
              border: 1px solid;
              border-radius: 10px;
              padding: 0.75rem 0.85rem;
              margin-top: 0.25rem;
              transition: all 0.2s ease;
            "
            :id="'card-aviso-chegada-' + order.id"
          >
            <!-- Topo do Card de Aviso: Status e Tag -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.45rem;">
                <div
                  :style="{
                    background: order.cliente_avisado ? '#10b981' : '#f59e0b',
                    color: '#ffffff',
                  }"
                  style="
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                  "
                >
                  <Check v-if="order.cliente_avisado" :size="13" />
                  <AlertTriangle v-else :size="13" />
                </div>

                <div>
                  <div
                    :style="{
                      color: order.cliente_avisado ? '#065f46' : '#92400e',
                    }"
                    style="font-size: 0.82rem; font-weight: 700; line-height: 1.2;"
                  >
                    {{ order.cliente_avisado ? 'Cliente já avisado da chegada' : 'Cliente AINDA NÃO foi avisado!' }}
                  </div>
                  <div
                    v-if="order.cliente_avisado && order.cliente_avisado_em"
                    style="font-size: 0.72rem; color: #047857; margin-top: 1px;"
                  >
                    Avisado {{ formatHistoryDate(order.cliente_avisado_em) }}
                    <span v-if="order.cliente_avisado_por"> por {{ order.cliente_avisado_por }}</span>
                  </div>
                </div>
              </div>

              <!-- Botão de alternar manualmente com clique -->
              <button
                type="button"
                @click="alternarAvisado(order)"
                :style="{
                  background: order.cliente_avisado ? '#d1fae5' : '#fef3c7',
                  color: order.cliente_avisado ? '#065f46' : '#b45309',
                  borderColor: order.cliente_avisado ? '#6ee7b7' : '#fcd34d',
                }"
                style="
                  border: 1px solid;
                  border-radius: 9999px;
                  padding: 2px 8px;
                  font-size: 0.7rem;
                  font-weight: 600;
                  cursor: pointer;
                  white-space: nowrap;
                "
                title="Alternar estado de aviso do cliente"
              >
                {{ order.cliente_avisado ? 'Desmarcar' : 'Marcar como avisado' }}
              </button>
            </div>

            <!-- Botões de Ação Rápida de Notificação -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem;">
              <button
                type="button"
                @click="enviarAvisoWhatsappRobo(order)"
                :disabled="enviandoAvisoId === order.id + '-chegada'"
                class="btn-primary-pill"
                style="
                  justify-content: center;
                  padding: 0.35rem 0.65rem;
                  font-size: 0.75rem;
                  background: #10b981;
                  box-shadow: none;
                "
                :title="authStore.currentConfig.evolution_api_ativo ? 'Disparar modelo de chegada via API' : 'Abrir conversa no WhatsApp Web'"
              >
                <Loader2 v-if="enviandoAvisoId === order.id + '-chegada'" class="animate-spin" :size="13" />
                <Send v-else :size="13" />
                <span>{{ enviandoAvisoId === order.id + '-chegada' ? 'Disparando...' : 'Avisar no Zap' }}</span>
              </button>

              <button
                type="button"
                @click="copyArrivalMessage(order)"
                class="btn-outline-neutral"
                style="
                  justify-content: center;
                  padding: 0.35rem 0.65rem;
                  font-size: 0.75rem;
                  background: #ffffff;
                "
                title="Copiar texto padrão de notificação de chegada"
              >
                <Copy :size="13" />
                <span>Copiar Texto</span>
              </button>
            </div>
          </div>

          <!-- Bottom Action Buttons: Modelos WhatsApp, Imprimir Cupom & Trash Delete -->
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.35rem; padding-top: 0.65rem; border-top: 1px solid #f1f5f9;">
            <div
              v-if="order.status === 'Aguardando' || order.status === 'Pedido Feito'"
              style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;"
            >
              <button
                type="button"
                @click="enviarModeloWhatsappCard(order, 'pedido')"
                :disabled="enviandoAvisoId === order.id + '-pedido'"
                class="btn-outline-emerald"
                style="height: 34px; padding: 0 0.5rem; font-size: 0.74rem; justify-content: center;"
                title="Enviar modelo de Confirmação de Pedido via WhatsApp"
              >
                <Loader2 v-if="enviandoAvisoId === order.id + '-pedido'" class="animate-spin" :size="12" />
                <MessageSquare v-else :size="12" />
                <span>{{ enviandoAvisoId === order.id + '-pedido' ? 'Enviando...' : 'Confirmar Zap' }}</span>
              </button>

              <button
                type="button"
                @click="copyOrderSummary(order)"
                class="btn-outline-neutral"
                style="height: 34px; padding: 0 0.5rem; font-size: 0.74rem; justify-content: center; color: #2563eb; border-color: #bfdbfe; background: #eff6ff;"
                title="Copiar resumo da encomenda"
              >
                <Copy :size="12" />
                <span>Copiar Resumo</span>
              </button>
            </div>

            <button
              v-if="order.valor_total > order.valor_pago && (order.status === 'Chegou' || order.status === 'Entregue')"
              type="button"
              @click="enviarModeloWhatsappCard(order, 'cobranca')"
              :disabled="enviandoAvisoId === order.id + '-cobranca'"
              class="btn-outline-neutral"
              style="width: 100%; height: 33px; padding: 0 0.65rem; font-size: 0.74rem; justify-content: center; border-color: #fde68a; background: #fffbeb; color: #b45309;"
              title="Enviar modelo de Lembrete e Saldo a Acertar no WhatsApp"
            >
              <Loader2 v-if="enviandoAvisoId === order.id + '-cobranca'" class="animate-spin" :size="12" />
              <DollarSign v-else :size="12" />
              <span>{{ enviandoAvisoId === order.id + '-cobranca' ? 'Enviando lembrete...' : 'Enviar Lembrete de Saldo no Zap' }}</span>
            </button>

            <div style="display: flex; gap: 0.5rem; width: 100%;">
              <button
                type="button"
                @click="openCupom(order)"
                class="btn-outline-neutral"
                style="
                  flex: 1;
                  height: 36px;
                  border-radius: 8px;
                  border: 1px solid #bfdbfe;
                  background: #ffffff;
                  color: #2563eb;
                  font-size: 0.8rem;
                  font-weight: 600;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 0.4rem;
                  cursor: pointer;
                  transition: all 0.15s ease;
                "
                onmouseover="this.style.background='#eff6ff'"
                onmouseout="this.style.background='#ffffff'"
                :id="'btn-cupom-' + order.id"
              >
                <Printer :size="15" />
                <span>Cupom</span>
              </button>

              <button
                type="button"
                @click="requestDeleteOrder(order.id)"
                class="btn-outline-neutral"
                style="
                  width: 42px;
                  height: 36px;
                  border-radius: 8px;
                  border: 1px solid #fecaca;
                  background: #ffffff;
                  color: #ef4444;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                  transition: all 0.15s ease;
                  flex-shrink: 0;
                "
                onmouseover="this.style.background='#fef2f2'"
                onmouseout="this.style.background='#ffffff'"
                title="Excluir Encomenda"
                :id="'btn-delete-order-' + order.id"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: Quem está fazendo esta ação? (Employee Action Modal) -->
    <div v-if="showEmployeeModal" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 380px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">
          Quem está fazendo esta ação?
        </h3>
        <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 1rem;">
          Selecione o atendente responsável pela alteração.
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button
            v-for="emp in listaAtendentesModal"
            :key="emp.id"
            @click="confirmEmployeeAction(emp)"
            style="
              display: flex;
              align-items: center;
              gap: 0.75rem;
              padding: 0.75rem 1rem;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
              background: #ffffff;
              text-align: left;
              cursor: pointer;
              transition: all 0.15s ease;
            "
            onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#2563eb'"
            onmouseout="this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'"
          >
            <div style="width: 36px; height: 36px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; flex-shrink: 0;">
              <User :size="18" />
            </div>
            <div>
              <div style="font-size: 0.9rem; font-weight: 700; color: #0f172a;">{{ emp.nome }}</div>
              <div v-if="emp.cargo" style="font-size: 0.76rem; color: #64748b;">{{ emp.cargo }}</div>
            </div>
          </button>
        </div>

        <button
          @click="showEmployeeModal = false"
          class="modal-btn-cancelar"
          style="margin-top: 1rem; width: 100%;"
        >
          Cancelar
        </button>
      </div>
    </div>

    <!-- MODAL: Apagar Entregues Confirmação -->
    <div v-if="showApagarEntreguesModal" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 400px; text-align: center;">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; color: #ef4444; margin: 0 auto 0.75rem;">
          <AlertTriangle :size="24" />
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">
          Apagar encomendas entregues
        </h3>
        <p style="font-size: 0.86rem; color: #64748b; margin-bottom: 1.25rem;">
          Isso vai apagar todas as encomendas com status "Entregue". Deseja continuar?
        </p>

        <div style="display: flex; gap: 0.75rem;">
          <button
            @click="showApagarEntreguesModal = false"
            class="modal-btn-cancelar"
            style="flex: 1;"
          >
            Cancelar
          </button>
          <button
            @click="confirmApagarEntregues"
            style="
              flex: 1;
              height: 40px;
              border-radius: 10px;
              border: none;
              background: #ef4444;
              color: #ffffff;
              font-weight: 600;
              font-size: 0.88rem;
              cursor: pointer;
            "
          >
            Sim, apagar
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Editar Encomenda -->
    <div v-if="showEditModal && selectedEncomenda" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 500px;">
        <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 1rem;">
          Editar Encomenda
        </h3>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Cliente</label>
            <select
              v-model="editClienteId"
              class="base44-modal-input"
            >
              <option
                v-for="c in clientesStore.currentTenantClientes"
                :key="c.id"
                :value="c.id"
              >
                {{ c.nome }}
              </option>
            </select>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Medicamentos</label>
            <div
              v-for="(it, iIdx) in editItens"
              :key="iIdx"
              style="display: flex; gap: 0.5rem; margin-top: 0.35rem;"
            >
              <input
                v-model.number="it.quantidade"
                type="number"
                min="1"
                class="base44-modal-input"
                style="width: 60px;"
              />
              <input
                v-model="it.descricao"
                type="text"
                class="base44-modal-input"
                style="flex: 1; text-transform: uppercase;"
              />
              <input
                v-model.number="it.precoUnitario"
                type="number"
                step="0.01"
                class="base44-modal-input"
                style="width: 90px;"
              />
            </div>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Observações</label>
            <textarea
              v-model="editObservacao"
              class="base44-modal-input"
              rows="2"
              style="resize: none;"
            ></textarea>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem;">
          <button @click="showEditModal = false" class="modal-btn-cancelar">
            Cancelar
          </button>
          <button @click="saveEditOrder" class="modal-btn-adicionar">
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Imprimir Cupom Térmico (80mm) -->
    <div v-if="showCupomModal && cupomEncomenda" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 380px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: #0f172a;">
            <Printer :size="18" style="color: #2563eb;" />
            <span>Imprimir Cupom</span>
          </div>
          <button @click="showCupomModal = false" style="background: none; border: none; cursor: pointer; color: #94a3b8;">
            ✕
          </button>
        </div>

        <!-- Thermal Receipt Container (BUG-11 FIX: usa modelo dinâmico do tenant) -->
        <div
          id="cupom-termico-print"
          style="
            background: #fafafa;
            border: 1px dashed #cbd5e1;
            border-radius: 8px;
            padding: 1.25rem 1rem;
            font-family: 'Courier New', Courier, monospace;
            color: #000000;
            line-height: 1.4;
          "
          :style="{ fontSize: `${authStore.currentConfig.font_size || 13}px` }"
        >
          <div style="text-align: center; margin-bottom: 0.75rem;">
            <div style="font-weight: 700; font-size: 1.05em;">
              {{ authStore.currentConfig.header_title || 'DROGARIA AEROPORTO' }}
            </div>
            <div style="font-size: 0.88em; color: #475569;">
              {{ authStore.currentConfig.header_subtitle || 'Sistema de Encomendas' }}
            </div>
            <div style="margin-top: 4px; border-bottom: 1px dashed #000; padding-bottom: 4px;">
              {{ formatDate(cupomEncomenda.criado_em) }}
            </div>
          </div>

          <div style="margin-bottom: 0.5rem;">
            <div><strong>CLIENTE:</strong> {{ cupomEncomenda.cliente?.nome || 'NÃO INFORMADO' }}</div>
            <div v-if="authStore.currentConfig.show_phone !== false && cupomEncomenda.cliente?.telefone">
              <strong>TEL:</strong> {{ cupomEncomenda.cliente?.telefone }}
            </div>
          </div>

          <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 0.4rem 0; margin-bottom: 0.5rem;">
            <div style="font-weight: 700; margin-bottom: 2px;">ITENS:</div>
            <div
              v-for="(it, iIdx) in (cupomEncomenda.itens || [])"
              :key="iIdx"
              style="display: flex; justify-content: space-between;"
            >
              <span>{{ it.quantidade }}x {{ it.descricao }}</span>
              <span>{{ formatBRL(it.subtotal) }}</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 2px;">
            <span>TOTAL:</span>
            <span>{{ formatBRL(cupomEncomenda.valor_total) }}</span>
          </div>

          <div
            v-if="authStore.currentConfig.show_status !== false"
            style="display: flex; justify-content: space-between; font-size: 0.9em; color: #334155;"
          >
            <span>STATUS PAGTO:</span>
            <span>{{ cupomEncomenda.situacao_pagamento }}</span>
          </div>

          <div
            v-if="authStore.currentConfig.show_payment !== false"
            style="display: flex; justify-content: space-between; font-size: 0.9em; color: #334155;"
          >
            <span>VALOR JÁ PAGO:</span>
            <span>{{ formatBRL(cupomEncomenda.valor_pago) }}</span>
          </div>

          <div
            v-if="authStore.currentConfig.show_payment !== false"
            style="display: flex; justify-content: space-between; font-size: 0.9em; font-weight: 700;"
          >
            <span>A COBRAR:</span>
            <span>{{ formatBRL(Math.max(0, cupomEncomenda.valor_total - cupomEncomenda.valor_pago)) }}</span>
          </div>

          <div style="text-align: center; margin-top: 1rem; font-size: 0.85em; color: #64748b;">
            {{ authStore.currentConfig.footer_text || 'Obrigado pela preferência!' }}
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
          <button @click="showCupomModal = false" class="modal-btn-cancelar" style="flex: 1;">
            Fechar
          </button>
          <button
            @click="printCupom"
            style="
              flex: 1;
              height: 40px;
              border-radius: 9999px;
              border: none;
              background: #2563eb;
              color: #ffffff;
              font-weight: 600;
              font-size: 0.88rem;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.45rem;
              cursor: pointer;
            "
          >
            <Printer :size="16" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: HISTÓRICO DE MEDICAMENTOS DO CLIENTE -->
    <HistoricoClienteModal
      v-model="showHistoricoModal"
      :cliente="clienteHistorico"
      @novo-pedido="(clienteId) => router.push({ path: '/nova-encomenda', query: { clienteId } })"
    />
  </div>
</template>

<style scoped>
/* BLOCO DE CADA ENCOMENDA (GRADE DE ENCOMENDAS) */
.encomenda-card-block {
  background: #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.06);
  border: 1.5px solid var(--border-color);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: relative;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
  max-width: 100%;
  height: fit-content;
}

.encomenda-card-block * {
  box-sizing: border-box;
}

/* ANIMAÇÃO AO PASSAR O MOUSE: Apenas realce de cor e sombra suave, sem alterar tamanho */
.encomenda-card-block:hover {
  border-color: #2563eb;
  box-shadow: 0 6px 16px -2px rgba(37, 99, 235, 0.14);
}

/* BLOCO DE ENCOMENDA NA ABA DE PESQUISA */
.encomenda-search-card-block {
  background: #ffffff;
  border: 1.5px solid var(--border-color);
  border-radius: 14px;
  padding: 0.9rem 1.15rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}

.encomenda-search-card-block:hover {
  border-color: #2563eb;
  box-shadow: 0 8px 22px -3px rgba(37, 99, 235, 0.14), 0 0 0 2.5px rgba(37, 99, 235, 0.2);
  transform: translateY(-2px);
}
</style>
