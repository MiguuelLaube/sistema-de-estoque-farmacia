<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import { useAuthStore } from '../stores/auth';
import type { Cliente, StatusEncomenda } from '../types';
import {
  X,
  History,
  Pill,
  Calendar,
  Clock,
  DollarSign,
  Package,
  CheckCircle,
  Clock3,
  CheckCheck,
  Search,
  Plus,
  Printer,
  Copy,
  ExternalLink,
  Phone,
  ShieldCheck,
  Eye,
  EyeOff,
  User,
} from 'lucide-vue-next';

interface Props {
  modelValue: boolean;
  cliente: Cliente | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'novoPedido', clienteId: string): void;
  (e: 'editarCliente', cliente: Cliente): void;
}>();

const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();
const authStore = useAuthStore();

// Filtros internos do histórico
const buscaMedicamento = ref('');
const filtroStatus = ref<string>('todos');
const ordenacao = ref<'recente' | 'antigo' | 'valor'>('recente');
const viewMode = ref<'pedidos' | 'medicamentos'>('medicamentos');
const revelouCpf = ref(false);
const copiadoFeedback = ref(false);

// Reset filters when client changes
watch(
  () => props.cliente,
  () => {
    buscaMedicamento.value = '';
    filtroStatus.value = 'todos';
    revelouCpf.value = false;
    copiadoFeedback.value = false;
  }
);

function fechar() {
  emit('update:modelValue', false);
}

// Formatação Monetária
function formatBRL(val: number): string {
  return 'R$ ' + (Number(val) || 0).toFixed(2).replace('.', ',');
}

// Formatação de Data e Hora
function formatarDataHora(isoStr?: string): { data: string; hora: string; relativa: string; completa: string } {
  if (!isoStr) return { data: '-', hora: '-', relativa: '-', completa: '-' };
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return { data: '-', hora: '-', relativa: '-', completa: '-' };

  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const ano = d.getFullYear();
  const hora = d.getHours().toString().padStart(2, '0');
  const minuto = d.getMinutes().toString().padStart(2, '0');

  const dataFormatada = `${dia}/${mes}/${ano}`;
  const horaFormatada = `${hora}:${minuto}`;

  // Relativa amigável
  const agora = new Date();
  const diffMs = agora.getTime() - d.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relativa = `${dataFormatada} às ${horaFormatada}`;
  if (diffDias === 0 && d.getDate() === agora.getDate()) {
    relativa = `Hoje às ${horaFormatada}`;
  } else if (diffDias <= 1 && d.getDate() === agora.getDate() - 1) {
    relativa = `Ontem às ${horaFormatada}`;
  } else if (diffDias > 1 && diffDias < 30) {
    relativa = `Há ${diffDias} dias (${dataFormatada})`;
  }

  return {
    data: dataFormatada,
    hora: horaFormatada,
    relativa,
    completa: `${dataFormatada} às ${horaFormatada}`,
  };
}

// Todas as encomendas do cliente ativo no tenant
const todasEncomendasCliente = computed(() => {
  if (!props.cliente) return [];
  const clienteId = props.cliente.id;
  const tenantId = authStore.activeTenantId;

  return encomendasStore.allEncomendas
    .filter((e) => e.cliente_id === clienteId && e.tenant_id === tenantId)
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
});

// Lista planificada de medicamentos pedidos pelo cliente (visão individual de remédios)
interface MedicamentoHistoricoItem {
  id: string;
  encomendaId: string;
  codigoRastreio: string;
  medicamento: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  dataPedidoIso: string;
  statusEncomenda: StatusEncomenda;
  statusItem: string;
  situacaoPagamento: string;
  valorPago: number;
  valorTotalEncomenda: number;
  observacao?: string;
  atendente?: string;
}

const todosMedicamentosPlanificados = computed<MedicamentoHistoricoItem[]>(() => {
  const itens: MedicamentoHistoricoItem[] = [];

  for (const enc of todasEncomendasCliente.value) {
    const atendente = enc.historico?.[0]?.employee_name || 'Balcão';
    const itensEnc = enc.itens && enc.itens.length > 0
      ? enc.itens
      : [
          {
            id: 'fallback-' + enc.id,
            tenant_id: enc.tenant_id,
            encomenda_id: enc.id,
            descricao: enc.observacao || 'Medicamento sob encomenda',
            quantidade: 1,
            preco_unitario: enc.valor_total,
            subtotal: enc.valor_total,
            controlado: false,
            urgente: false,
            status_item: enc.status === 'Entregue' ? 'Chegou' : 'Aguardando',
            atributos: {},
            criado_em: enc.criado_em,
          },
        ];

    for (const it of itensEnc) {
      itens.push({
        id: it.id || 'it-' + Math.random().toString(36).substr(2, 6),
        encomendaId: enc.id,
        codigoRastreio: enc.codigo_rastreio || 'ENC-' + enc.id.slice(-4),
        medicamento: it.descricao || 'Medicamento sem descrição',
        quantidade: it.quantidade || 1,
        precoUnitario: it.preco_unitario !== undefined ? it.preco_unitario : (it.subtotal / (it.quantidade || 1)),
        subtotal: it.subtotal || (it.preco_unitario * (it.quantidade || 1)) || enc.valor_total,
        dataPedidoIso: it.criado_em || enc.criado_em,
        statusEncomenda: enc.status,
        statusItem: it.status_item || enc.status,
        situacaoPagamento: enc.situacao_pagamento,
        valorPago: enc.valor_pago,
        valorTotalEncomenda: enc.valor_total,
        observacao: enc.observacao,
        atendente,
      });
    }
  }

  return itens;
});

// Estatísticas do Cliente
const estatisticas = computed(() => {
  const encs = todasEncomendasCliente.value;
  const meds = todosMedicamentosPlanificados.value;

  const totalPedidos = encs.length;
  const totalMedicamentos = meds.reduce((acc, curr) => acc + curr.quantidade, 0);
  const totalValorGasto = encs.reduce((acc, curr) => acc + curr.valor_total, 0);
  const totalValorPago = encs.reduce((acc, curr) => acc + curr.valor_pago, 0);
  const saldoDevedor = Math.max(0, totalValorGasto - totalValorPago);

  const ultimoPedido = encs.length > 0 ? encs[0].criado_em : null;

  return {
    totalPedidos,
    totalMedicamentos,
    totalValorGasto,
    totalValorPago,
    saldoDevedor,
    ultimoPedido,
    contagemPorStatus: {
      Aguardando: encs.filter((e) => e.status === 'Aguardando').length,
      'Pedido Feito': encs.filter((e) => e.status === 'Pedido Feito').length,
      Chegou: encs.filter((e) => e.status === 'Chegou').length,
      Entregue: encs.filter((e) => e.status === 'Entregue').length,
    },
  };
});

// Medicamentos Filtrados e Ordenados
const medicamentosFiltrados = computed(() => {
  let list = [...todosMedicamentosPlanificados.value];
  const q = buscaMedicamento.value.trim().toLowerCase();

  if (q) {
    list = list.filter((m) => {
      const matchMed = m.medicamento.toLowerCase().includes(q);
      const matchRastreio = m.codigoRastreio.toLowerCase().includes(q);
      const matchAtendente = m.atendente?.toLowerCase().includes(q);
      return matchMed || matchRastreio || matchAtendente;
    });
  }

  if (filtroStatus.value !== 'todos') {
    list = list.filter((m) => m.statusEncomenda === filtroStatus.value);
  }

  if (ordenacao.value === 'recente') {
    list.sort((a, b) => new Date(b.dataPedidoIso).getTime() - new Date(a.dataPedidoIso).getTime());
  } else if (ordenacao.value === 'antigo') {
    list.sort((a, b) => new Date(a.dataPedidoIso).getTime() - new Date(b.dataPedidoIso).getTime());
  } else if (ordenacao.value === 'valor') {
    list.sort((a, b) => b.subtotal - a.subtotal);
  }

  return list;
});

// Encomendas Agrupadas Filtradas (para visualização por encomenda)
const encomendasFiltradas = computed(() => {
  let list = [...todasEncomendasCliente.value];
  const q = buscaMedicamento.value.trim().toLowerCase();

  if (q) {
    list = list.filter((e) => {
      const matchRastreio = e.codigo_rastreio?.toLowerCase().includes(q);
      const matchItens = e.itens?.some((i) => i.descricao.toLowerCase().includes(q));
      const matchObs = e.observacao?.toLowerCase().includes(q);
      return matchRastreio || matchItens || matchObs;
    });
  }

  if (filtroStatus.value !== 'todos') {
    list = list.filter((e) => e.status === filtroStatus.value);
  }

  if (ordenacao.value === 'recente') {
    list.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  } else if (ordenacao.value === 'antigo') {
    list.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  } else if (ordenacao.value === 'valor') {
    list.sort((a, b) => b.valor_total - a.valor_total);
  }

  return list;
});

// Badges de Status Semânticos (ui-design-padrao-farmacia)
function getStatusBadgeConfig(status: StatusEncomenda | string) {
  switch (status) {
    case 'Aguardando':
      return {
        bg: '#fffbeb',
        color: '#b45309',
        border: '#fde68a',
        icon: Clock3,
        label: 'Aguardando',
      };
    case 'Pedido Feito':
      return {
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe',
        icon: CheckCircle,
        label: 'Pedido Feito',
      };
    case 'Chegou':
      return {
        bg: '#ecfdf5',
        color: '#047857',
        border: '#a7f3d0',
        icon: Package,
        label: 'Chegou',
      };
    case 'Entregue':
      return {
        bg: '#f0fdf4',
        color: '#15803d',
        border: '#bbf7d0',
        icon: CheckCheck,
        label: 'Entregue',
      };
    default:
      return {
        bg: '#f8fafc',
        color: '#475569',
        border: '#e2e8f0',
        icon: Clock,
        label: status,
      };
  }
}

// Iniciar Nova Encomenda para este Cliente
function irParaNovaEncomenda() {
  if (props.cliente) {
    const cId = props.cliente.id;
    fechar();
    encomendasStore.abrirModalNovaEncomenda(cId);
  }
}

function alternarRevelacaoCpf() {
  revelouCpf.value = !revelouCpf.value;
  if (revelouCpf.value && props.cliente) {
    authStore.registrarAuditoria(
      'VISUALIZACAO_CPF_TITULAR',
      `Cliente ${props.cliente.id}`,
      'Desmascaramento de CPF no modal de histórico'
    );
  }
}

// Copiar Histórico Estruturado para WhatsApp ou Clipboard
async function copiarHistorico() {
  if (!props.cliente) return;
  const cliente = props.cliente;
  const meds = todosMedicamentosPlanificados.value;
  const nomeLoja = authStore.currentConfig.header_title || 'DROGARIA';

  let texto = `📋 *HISTÓRICO DE MEDICAMENTOS - ${nomeLoja}*\n`;
  texto += `👤 *Cliente:* ${cliente.nome}\n`;
  texto += `📱 *Telefone:* ${cliente.telefone}\n`;
  texto += `📦 *Total de Encomendas:* ${estatisticas.value.totalPedidos}\n`;
  texto += `💊 *Total de Medicamentos:* ${estatisticas.value.totalMedicamentos} itens\n`;
  texto += `💰 *Total Acumulado:* ${formatBRL(estatisticas.value.totalValorGasto)}\n`;
  texto += `─────────────────────────\n`;

  if (meds.length === 0) {
    texto += `Nenhum remédio registrado até o momento.\n`;
  } else {
    meds.forEach((m, idx) => {
      const dataFormatada = formatarDataHora(m.dataPedidoIso).completa;
      texto += `${idx + 1}. *${m.medicamento}*\n`;
      texto += `   • Quantidade: ${m.quantidade}x\n`;
      texto += `   • Preço: ${formatBRL(m.subtotal)} (${formatBRL(m.precoUnitario)} un.)\n`;
      texto += `   • Pedido em: ${dataFormatada}\n`;
      texto += `   • Status: ${m.statusEncomenda} | ${m.situacaoPagamento}\n`;
      texto += `   • Rastreio: ${m.codigoRastreio}\n\n`;
    });
  }

  texto += `${nomeLoja} • Gestão & Atendimento Especializado`;

  try {
    await navigator.clipboard.writeText(texto);
    copiadoFeedback.value = true;
    setTimeout(() => {
      copiadoFeedback.value = false;
    }, 2500);
  } catch {
    // Ignora falha de área de transferência sem expor detalhes internos no console
  }
}

// Imprimir Histórico do Cliente (Comprovante Limpo de Farmácia)
function imprimirHistorico() {
  if (!props.cliente) return;
  window.print();
}

// Link direto para WhatsApp
const linkWhatsAppCliente = computed(() => {
  if (!props.cliente?.telefone) return '#';
  const telLimpo = props.cliente.telefone.replace(/\D/g, '');
  const ddd = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
  const nomeLoja = authStore.currentConfig.header_title || 'Drogaria';
  const msg = `Olá ${props.cliente.nome.split(' ')[0]}! Entramos em contato da ${nomeLoja} referente ao seu histórico de encomendas.`;
  return `https://wa.me/${ddd}?text=${encodeURIComponent(msg)}`;
});
</script>

<template>
  <div v-if="modelValue && cliente" class="modal-backdrop" @click.self="fechar">
    <div
      class="base44-modal-dialog historico-modal-dialog"
      style="
        max-width: 900px;
        width: 95%;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        padding: 0;
        overflow: hidden;
        border-radius: 24px;
        background: #ffffff;
      "
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-historico-cliente"
    >
      <!-- HEADER DO MODAL -->
      <div
        style="
          padding: 1.25rem 1.75rem;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          gap: 1rem;
        "
      >
        <div style="display: flex; align-items: center; gap: 1rem; min-width: 0;">
          <!-- Avatar Letter Box -->
          <div
            style="
              width: 52px;
              height: 52px;
              border-radius: 16px;
              background-color: var(--color-primary-alpha);
              border: 1px solid var(--color-primary-border);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            "
          >
            <span style="font-size: 1.35rem; font-weight: 800; color: var(--color-primary); font-family: var(--font-heading);">
              {{ cliente.nome.charAt(0).toUpperCase() }}
            </span>
          </div>

          <!-- Informações de Identificação do Cliente -->
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
              <h2
                id="titulo-historico-cliente"
                style="
                  font-size: 1.35rem;
                  font-weight: 800;
                  color: #0f172a;
                  font-family: var(--font-heading);
                  margin: 0;
                  text-transform: uppercase;
                  letter-spacing: -0.01em;
                "
              >
                {{ cliente.nome }}
              </h2>

              <span
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  background: var(--color-primary-alpha);
                  color: var(--color-primary);
                  border: 1px solid var(--color-primary-border);
                  padding: 2px 8px;
                  border-radius: 9999px;
                  font-size: 0.72rem;
                  font-weight: 700;
                  text-transform: uppercase;
                "
              >
                <History :size="12" />
                Histórico do Cliente
              </span>
            </div>

            <!-- Contatos e Identificadores -->
            <div style="display: flex; align-items: center; gap: 1rem; margin-top: 4px; font-size: 0.84rem; flex-wrap: wrap;">
              <!-- Telefone / WhatsApp -->
              <a
                :href="linkWhatsAppCliente"
                target="_blank"
                rel="noopener noreferrer"
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 5px;
                  color: #059669;
                  text-decoration: none;
                  font-weight: 600;
                  background: #ecfdf5;
                  padding: 2px 8px;
                  border-radius: 6px;
                  border: 1px solid #a7f3d0;
                "
                title="Abrir WhatsApp com o cliente"
              >
                <Phone :size="13" />
                <span>{{ cliente.telefone }}</span>
                <ExternalLink :size="11" />
              </a>

              <!-- CPF Mascarado (LGPD) -->
              <div
                v-if="cliente.cpf"
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 5px;
                  color: #475569;
                  background: #f1f5f9;
                  padding: 2px 8px;
                  border-radius: 6px;
                  font-family: monospace;
                  font-size: 0.8rem;
                "
              >
                <ShieldCheck :size="13" style="color: #059669;" />
                <span>{{ revelouCpf ? cliente.cpf : clientesStore.mascararCPF(cliente.cpf) }}</span>
                <button
                  type="button"
                  @click="alternarRevelacaoCpf"
                  style="background: none; border: none; padding: 0 2px; cursor: pointer; color: #64748b; display: inline-flex; align-items: center;"
                  :title="revelouCpf ? 'Ocultar CPF' : 'Revelar CPF'"
                >
                  <EyeOff v-if="revelouCpf" :size="12" />
                  <Eye v-else :size="12" />
                </button>
              </div>

              <!-- Endereço -->
              <span v-if="cliente.endereco" style="color: #64748b; font-size: 0.8rem;">
                📍 {{ cliente.endereco }}
              </span>
            </div>
          </div>
        </div>

        <!-- Botões de Fechar & Ações Rápidas do Cabeçalho -->
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
          <button
            @click="irParaNovaEncomenda"
            class="btn-primary-pill"
            style="padding: 0.45rem 1rem; font-size: 0.82rem;"
            id="btn-historico-nova-encomenda"
          >
            <Plus :size="15" />
            <span>Fazer Pedido</span>
          </button>

          <button
            @click="fechar"
            style="
              width: 36px;
              height: 36px;
              border-radius: 10px;
              border: 1px solid #e2e8f0;
              background: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #64748b;
              cursor: pointer;
              transition: all 0.15s ease;
            "
            aria-label="Fechar modal"
            id="btn-fechar-historico"
          >
            <X :size="18" />
          </button>
        </div>
      </div>

      <!-- PAINEL DE MÉTRICAS RÁPIDAS (Bento Strip) -->
      <div
        style="
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 1rem 1.75rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.85rem;
          flex-shrink: 0;
        "
      >
        <!-- Card Métrica: Total de Remédios -->
        <div
          style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
          "
        >
          <div style="width: 38px; height: 38px; border-radius: 10px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; flex-shrink: 0;">
            <Pill :size="20" />
          </div>
          <div>
            <div style="font-size: 0.74rem; font-weight: 600; color: #64748b; text-transform: uppercase;">
              Remédios Pedidos
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
              {{ estatisticas.totalMedicamentos }} <span style="font-size: 0.75rem; font-weight: 500; color: #64748b;">caixas/un.</span>
            </div>
          </div>
        </div>

        <!-- Card Métrica: Total de Encomendas -->
        <div
          style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
          "
        >
          <div style="width: 38px; height: 38px; border-radius: 10px; background: #f0fdf4; display: flex; align-items: center; justify-content: center; color: #16a34a; flex-shrink: 0;">
            <Package :size="20" />
          </div>
          <div>
            <div style="font-size: 0.74rem; font-weight: 600; color: #64748b; text-transform: uppercase;">
              Total de Pedidos
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
              {{ estatisticas.totalPedidos }} <span style="font-size: 0.75rem; font-weight: 500; color: #64748b;">pedidos</span>
            </div>
          </div>
        </div>

        <!-- Card Métrica: Total Investido / Valor -->
        <div
          style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
          "
        >
          <div style="width: 38px; height: 38px; border-radius: 10px; background: var(--color-primary-alpha); display: flex; align-items: center; justify-content: center; color: var(--color-primary); flex-shrink: 0;">
            <DollarSign :size="20" />
          </div>
          <div>
            <div style="font-size: 0.74rem; font-weight: 600; color: #64748b; text-transform: uppercase;">
              Total em Compras
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--color-primary); line-height: 1.2;">
              {{ formatBRL(estatisticas.totalValorGasto) }}
            </div>
          </div>
        </div>

        <!-- Card Métrica: Último Pedido -->
        <div
          style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
          "
        >
          <div style="width: 38px; height: 38px; border-radius: 10px; background: #fffbeb; display: flex; align-items: center; justify-content: center; color: #d97706; flex-shrink: 0;">
            <Calendar :size="20" />
          </div>
          <div>
            <div style="font-size: 0.74rem; font-weight: 600; color: #64748b; text-transform: uppercase;">
              Último Pedido
            </div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #0f172a; line-height: 1.2;">
              {{ estatisticas.ultimoPedido ? formatarDataHora(estatisticas.ultimoPedido).data : 'Nenhum' }}
            </div>
          </div>
        </div>
      </div>

      <!-- BARRA DE PESQUISA E FILTROS DO HISTÓRICO -->
      <div
        style="
          padding: 0.85rem 1.75rem;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.75rem;
          background: #ffffff;
          flex-shrink: 0;
        "
      >
        <!-- Campo de Busca de Medicamento -->
        <div style="position: relative; flex: 1; min-width: 240px;">
          <Search :size="16" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;" />
          <input
            v-model="buscaMedicamento"
            type="text"
            placeholder="Buscar medicamento ou rastreio neste histórico..."
            style="
              width: 100%;
              height: 40px;
              border-radius: 10px;
              border: 1px solid #e2e8f0;
              background: #f8fafc;
              padding-left: 2.3rem;
              padding-right: 1rem;
              font-size: 0.88rem;
              color: #0f172a;
              outline: none;
              transition: all 0.15s ease;
            "
            id="input-busca-historico-med"
          />
        </div>

        <!-- Abas / Filtro de Status Semânticos -->
        <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
          <button
            @click="filtroStatus = 'todos'"
            :style="{
              background: filtroStatus === 'todos' ? '#0f172a' : '#f1f5f9',
              color: filtroStatus === 'todos' ? '#ffffff' : '#475569',
            }"
            style="padding: 0.4rem 0.85rem; border-radius: 9999px; border: none; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;"
          >
            Todos ({{ estatisticas.totalMedicamentos }})
          </button>

          <button
            @click="filtroStatus = 'Aguardando'"
            :style="{
              background: filtroStatus === 'Aguardando' ? '#fde68a' : '#fffbeb',
              color: '#b45309',
              border: '1px solid #fde68a',
            }"
            style="padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;"
          >
            Aguardo ({{ estatisticas.contagemPorStatus.Aguardando }})
          </button>

          <button
            @click="filtroStatus = 'Pedido Feito'"
            :style="{
              background: filtroStatus === 'Pedido Feito' ? '#bfdbfe' : '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
            }"
            style="padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;"
          >
            Pedido Feito ({{ estatisticas.contagemPorStatus['Pedido Feito'] }})
          </button>

          <button
            @click="filtroStatus = 'Chegou'"
            :style="{
              background: filtroStatus === 'Chegou' ? '#a7f3d0' : '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0',
            }"
            style="padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;"
          >
            Chegou ({{ estatisticas.contagemPorStatus.Chegou }})
          </button>

          <button
            @click="filtroStatus = 'Entregue'"
            :style="{
              background: filtroStatus === 'Entregue' ? '#bbf7d0' : '#f0fdf4',
              color: '#15803d',
              border: '1px solid #bbf7d0',
            }"
            style="padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;"
          >
            Entregue ({{ estatisticas.contagemPorStatus.Entregue }})
          </button>
        </div>

        <!-- Seletor de Ordenação & Modo de Visualização -->
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <select
            v-model="ordenacao"
            style="
              height: 36px;
              padding: 0 0.75rem;
              border-radius: 8px;
              border: 1px solid #cbd5e1;
              background: #ffffff;
              font-size: 0.8rem;
              font-weight: 600;
              color: #334155;
              outline: none;
            "
          >
            <option value="recente">Mais Recente Primeiro</option>
            <option value="antigo">Mais Antigo Primeiro</option>
            <option value="valor">Maior Preço Primeiro</option>
          </select>

          <!-- Toggle de Visualização: Por Remédio ou Por Pedido Completo -->
          <div style="display: flex; background: #f1f5f9; padding: 2px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <button
              type="button"
              @click="viewMode = 'medicamentos'"
              :style="{
                background: viewMode === 'medicamentos' ? '#ffffff' : 'transparent',
                color: viewMode === 'medicamentos' ? 'var(--color-primary)' : '#64748b',
                fontWeight: viewMode === 'medicamentos' ? 700 : 500,
                boxShadow: viewMode === 'medicamentos' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }"
              style="padding: 0.35rem 0.65rem; border-radius: 6px; border: none; font-size: 0.76rem; cursor: pointer;"
              title="Ver cada medicamento individualmente"
            >
              Remédios
            </button>
            <button
              type="button"
              @click="viewMode = 'pedidos'"
              :style="{
                background: viewMode === 'pedidos' ? '#ffffff' : 'transparent',
                color: viewMode === 'pedidos' ? 'var(--color-primary)' : '#64748b',
                fontWeight: viewMode === 'pedidos' ? 700 : 500,
                boxShadow: viewMode === 'pedidos' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }"
              style="padding: 0.35rem 0.65rem; border-radius: 6px; border: none; font-size: 0.76rem; cursor: pointer;"
              title="Ver agrupado por pedido"
            >
              Por Pedido
            </button>
          </div>
        </div>
      </div>

      <!-- CORPO COM A LISTA DE MEDICAMENTOS / ENCOMENDAS (Scrollable) -->
      <div
        style="
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem 1.75rem;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        "
      >
        <!-- EMPTY STATE -->
        <div
          v-if="viewMode === 'medicamentos' ? medicamentosFiltrados.length === 0 : encomendasFiltradas.length === 0"
          style="
            background: #ffffff;
            border: 1px dashed #cbd5e1;
            border-radius: 20px;
            padding: 3.5rem 1.5rem;
            text-align: center;
          "
        >
          <div style="width: 56px; height: 56px; border-radius: 18px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
            <Pill :size="28" />
          </div>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 0;">
            {{ buscaMedicamento ? 'Nenhum medicamento encontrado para essa busca' : 'Nenhum medicamento registrado para este cliente' }}
          </h3>
          <p style="color: #64748b; font-size: 0.88rem; max-width: 440px; margin: 0.5rem auto 1.25rem;">
            {{ buscaMedicamento ? 'Tente buscar por outro termo ou limpe os filtros para ver todos os remédios.' : 'Este cliente ainda não possui histórico de encomendas cadastradas na farmácia.' }}
          </p>
          <button
            @click="irParaNovaEncomenda"
            class="btn-primary-pill"
            style="margin: 0 auto;"
          >
            <Plus :size="16" />
            <span>Criar Primeira Encomenda</span>
          </button>
        </div>

        <!-- VISÃO 1: LISTA INDIVIDUAL DE MEDICAMENTOS (Foco em Medicamento, Preço e Quando foi pedido) -->
        <div v-else-if="viewMode === 'medicamentos'" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div
            v-for="item in medicamentosFiltrados"
            :key="item.id"
            class="pedido-item-card"
            style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 18px;
              padding: 1.1rem 1.35rem;
              display: flex;
              align-items: center;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 1rem;
              transition: all 0.15s ease;
            "
            onmouseover="this.style.borderColor='#93c5fd'; this.style.boxShadow='0 4px 14px -2px rgba(37,99,235,0.08)';"
            onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none';"
          >
            <!-- Lado Esquerdo: Ícone + Medicamento + Quando foi pedido -->
            <div style="display: flex; align-items: flex-start; gap: 0.95rem; min-width: 260px; flex: 1;">
              <!-- Ícone de Pílula -->
              <div
                style="
                  width: 44px;
                  height: 44px;
                  border-radius: 12px;
                  background: var(--color-primary-alpha);
                  border: 1px solid var(--color-primary-border);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: var(--color-primary);
                  flex-shrink: 0;
                  margin-top: 2px;
                "
              >
                <Pill :size="22" />
              </div>

              <!-- Detalhes do Medicamento -->
              <div style="min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <span style="font-weight: 800; font-size: 0.95rem; color: var(--color-primary); background: var(--color-primary-alpha); padding: 1px 7px; border-radius: 6px;">
                    {{ item.quantidade }}x
                  </span>
                  <h4
                    style="
                      font-size: 1rem;
                      font-weight: 800;
                      color: #0f172a;
                      text-transform: uppercase;
                      letter-spacing: -0.01em;
                      margin: 0;
                    "
                  >
                    {{ item.medicamento }}
                  </h4>
                </div>

                <!-- LINHA CRUCIAL: QUANDO FOI PEDIDO O REMÉDIO -->
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.85rem;
                    margin-top: 6px;
                    font-size: 0.82rem;
                    color: #475569;
                    flex-wrap: wrap;
                  "
                >
                  <!-- Data do Pedido com Relógio e Calendário -->
                  <span
                    style="
                      display: inline-flex;
                      align-items: center;
                      gap: 4px;
                      background: #f1f5f9;
                      padding: 2px 8px;
                      border-radius: 6px;
                      color: #0f172a;
                      font-weight: 600;
                    "
                    title="Data e hora exata em que o remédio foi pedido"
                  >
                    <Calendar :size="13" style="color: #2563eb;" />
                    <span>Pedido em:</span>
                    <strong style="color: #1e293b;">{{ formatarDataHora(item.dataPedidoIso).completa }}</strong>
                  </span>

                  <!-- Tempo Relativo -->
                  <span style="display: inline-flex; align-items: center; gap: 3px; color: #64748b; font-size: 0.78rem;">
                    <Clock :size="12" />
                    <span>{{ formatarDataHora(item.dataPedidoIso).relativa }}</span>
                  </span>

                  <!-- Código de Rastreio da Encomenda -->
                  <span style="display: inline-flex; align-items: center; gap: 3px; color: #64748b; font-family: monospace; font-size: 0.78rem;">
                    <Package :size="12" />
                    <span>{{ item.codigoRastreio }}</span>
                  </span>

                  <!-- Atendente -->
                  <span v-if="item.atendente" style="display: inline-flex; align-items: center; gap: 3px; color: #64748b; font-size: 0.78rem;">
                    <User :size="12" />
                    <span>Atendido por {{ item.atendente }}</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Lado Direito: PREÇO DO REMÉDIO + STATUS -->
            <div style="display: flex; align-items: center; gap: 1.25rem; flex-shrink: 0; margin-left: auto;">
              <!-- BLOCO DE PREÇO -->
              <div style="text-align: right;">
                <div style="font-size: 0.72rem; font-weight: 600; color: #64748b; text-transform: uppercase;">
                  Preço do Remédio
                </div>
                <div
                  style="
                    font-size: 1.2rem;
                    font-weight: 800;
                    color: #2563eb;
                    font-family: var(--font-heading);
                    line-height: 1.1;
                  "
                >
                  {{ formatBRL(item.subtotal) }}
                </div>
                <div v-if="item.quantidade > 1" style="font-size: 0.72rem; color: #64748b;">
                  ({{ formatBRL(item.precoUnitario) }} cada)
                </div>
              </div>

              <!-- STATUS DO REMÉDIO / ENCOMENDA -->
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span
                  :style="{
                    background: getStatusBadgeConfig(item.statusEncomenda).bg,
                    color: getStatusBadgeConfig(item.statusEncomenda).color,
                    borderColor: getStatusBadgeConfig(item.statusEncomenda).border,
                  }"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.32rem 0.8rem;
                    border-radius: 9999px;
                    font-size: 0.76rem;
                    font-weight: 700;
                    border: 1px solid;
                    text-transform: capitalize;
                  "
                >
                  <component :is="getStatusBadgeConfig(item.statusEncomenda).icon" :size="13" />
                  <span>{{ getStatusBadgeConfig(item.statusEncomenda).label }}</span>
                </span>

                <!-- Pagamento Badge -->
                <span
                  :style="{
                    background: item.situacaoPagamento === 'Pago' ? '#ecfdf5' : (item.situacaoPagamento === 'Parcial' ? '#fffbeb' : '#fef2f2'),
                    color: item.situacaoPagamento === 'Pago' ? '#047857' : (item.situacaoPagamento === 'Parcial' ? '#b45309' : '#dc2626'),
                    borderColor: item.situacaoPagamento === 'Pago' ? '#a7f3d0' : (item.situacaoPagamento === 'Parcial' ? '#fde68a' : '#fecaca'),
                  }"
                  style="
                    display: inline-flex;
                    align-items: center;
                    padding: 1px 7px;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    border: 1px solid;
                  "
                >
                  {{ item.situacaoPagamento }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- VISÃO 2: AGRUPADO POR ENCOMENDA (Mostra os pedidos completos do cliente) -->
        <div v-else style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div
            v-for="enc in encomendasFiltradas"
            :key="enc.id"
            style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 20px;
              padding: 1.25rem 1.5rem;
              display: flex;
              flex-direction: column;
              gap: 0.85rem;
            "
          >
            <!-- Topo do Card de Pedido -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span
                  :style="{
                    background: getStatusBadgeConfig(enc.status).bg,
                    color: getStatusBadgeConfig(enc.status).color,
                    borderColor: getStatusBadgeConfig(enc.status).border,
                  }"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.3rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    border: 1px solid;
                  "
                >
                  <component :is="getStatusBadgeConfig(enc.status).icon" :size="13" />
                  <span>{{ getStatusBadgeConfig(enc.status).label }}</span>
                </span>

                <span style="font-weight: 700; font-family: monospace; font-size: 0.88rem; color: #0f172a;">
                  {{ enc.codigo_rastreio }}
                </span>
              </div>

              <!-- Data em que foi pedido -->
              <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #64748b;">
                <Calendar :size="14" style="color: #2563eb;" />
                <span>Pedido em: <strong style="color: #0f172a;">{{ formatarDataHora(enc.criado_em).completa }}</strong></span>
              </div>
            </div>

            <!-- Lista de Medicamentos deste Pedido -->
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div
                v-for="(it, iIdx) in (enc.itens || [])"
                :key="iIdx"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  background: #f8fafc;
                  border: 1px solid #f1f5f9;
                  padding: 0.65rem 0.95rem;
                  border-radius: 12px;
                "
              >
                <div style="display: flex; align-items: center; gap: 0.65rem;">
                  <Pill :size="16" style="color: #2563eb; flex-shrink: 0;" />
                  <span style="font-weight: 700; color: #2563eb; font-size: 0.85rem;">{{ it.quantidade }}x</span>
                  <span style="font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 0.92rem;">
                    {{ it.descricao }}
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: 1rem;">
                  <span style="font-weight: 800; color: #2563eb; font-size: 0.95rem;">
                    {{ formatBRL(it.subtotal) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Rodapé do Pedido com Total e Pagamento -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; pt: 0.5rem; font-size: 0.85rem;">
              <div style="color: #64748b;">
                <span v-if="enc.observacao">Obs: <em>{{ enc.observacao }}</em></span>
                <span v-else-if="enc.historico && enc.historico.length > 0">
                  Cadastrado por: {{ enc.historico[0].employee_name }}
                </span>
              </div>

              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <span style="color: #64748b;">
                  Situação:
                  <strong :style="{ color: enc.situacao_pagamento === 'Pago' ? '#059669' : '#d97706' }">
                    {{ enc.situacao_pagamento }}
                  </strong>
                </span>

                <span style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">
                  Total: <span style="color: #2563eb;">{{ formatBRL(enc.valor_total) }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER DO MODAL COM RESUMO E BOTÕES DE AÇÃO -->
      <div
        style="
          padding: 1rem 1.75rem;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          flex-shrink: 0;
        "
      >
        <!-- Resumo Textual -->
        <div style="font-size: 0.85rem; color: #64748b;">
          Mostrando <strong style="color: #0f172a;">{{ medicamentosFiltrados.length }}</strong> item(ns) no histórico de <strong style="color: #0f172a;">{{ cliente.nome }}</strong>
        </div>

        <!-- Botões de Ação em Pílula -->
        <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
          <!-- Copiar Histórico -->
          <button
            type="button"
            @click="copiarHistorico"
            style="
              display: inline-flex;
              align-items: center;
              gap: 0.45rem;
              background-color: #ffffff;
              color: #334155;
              border: 1px solid #cbd5e1;
              border-radius: 9999px;
              padding: 0.45rem 1.15rem;
              font-size: 0.84rem;
              font-weight: 600;
              cursor: pointer;
              transition: all 150ms ease;
            "
            id="btn-copiar-historico-cliente"
          >
            <Copy :size="14" />
            <span>{{ copiadoFeedback ? 'Copiado para WhatsApp!' : 'Copiar Histórico' }}</span>
          </button>

          <!-- Imprimir Histórico -->
          <button
            type="button"
            @click="imprimirHistorico"
            style="
              display: inline-flex;
              align-items: center;
              gap: 0.45rem;
              background-color: #ffffff;
              color: #2563eb;
              border: 1px solid #bfdbfe;
              border-radius: 9999px;
              padding: 0.45rem 1.15rem;
              font-size: 0.84rem;
              font-weight: 600;
              cursor: pointer;
              transition: all 150ms ease;
            "
            id="btn-imprimir-historico-cliente"
          >
            <Printer :size="14" />
            <span>Imprimir Histórico</span>
          </button>

          <!-- Fechar -->
          <button
            type="button"
            @click="fechar"
            class="modal-btn-cancelar"
            style="margin: 0;"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body * {
    visibility: hidden;
  }
  .historico-modal-dialog,
  .historico-modal-dialog * {
    visibility: visible;
  }
  .historico-modal-dialog {
    position: absolute;
    left: 0;
    top: 0;
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: none !important;
    border: none !important;
  }
}
</style>
