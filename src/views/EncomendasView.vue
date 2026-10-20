<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import type { Encomenda, StatusEncomenda, FormaPagamento } from '../types';
import {
  Plus,
  Search,
  Send,
  Printer,
  DollarSign,
  Archive,
  CheckCircle,
  Trash2,
  X,
  UserPlus,
} from 'lucide-vue-next';

const route = useRoute();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();

// Modals State
const showNovaModal = ref(false);
const showPagamentoModal = ref(false);
const showCupomModal = ref(false);
const showArquivarConfirmModal = ref(false);

const selectedEncomenda = ref<Encomenda | null>(null);

// Form State: Nova Encomenda
const novoClienteModo = ref(false);
const novoClienteNome = ref('');
const novoClienteTelefone = ref('');
const clienteSelecionadoId = ref('');
const observacaoNova = ref('');
const itensNova = ref<Array<{
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  classificacaoId?: string;
  controlado: boolean;
  urgente: boolean;
}>>([
  {
    descricao: '',
    quantidade: 1,
    precoUnitario: 0,
    controlado: false,
    urgente: false,
  },
]);

// Form State: Pagamento
const valorPagamento = ref<number>(0);
const formaPagamento = ref<FormaPagamento>('pix');
const isEstorno = ref(false);
const motivoEstorno = ref('');

onMounted(() => {
  if (route.query.acao === 'nova') {
    abrirNovaEncomendaModal();
  }
});

function formatarMoeda(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function abrirNovaEncomendaModal() {
  novoClienteModo.value = false;
  novoClienteNome.value = '';
  novoClienteTelefone.value = '';
  clienteSelecionadoId.value = clientesStore.currentTenantClientes[0]?.id || '';
  observacaoNova.value = '';
  itensNova.value = [
    {
      descricao: '',
      quantidade: 1,
      precoUnitario: 0,
      controlado: false,
      urgente: false,
    },
  ];
  showNovaModal.value = true;
}

function adicionarItemLinha() {
  itensNova.value.push({
    descricao: '',
    quantidade: 1,
    precoUnitario: 0,
    controlado: false,
    urgente: false,
  });
}

function removerItemLinha(index: number) {
  if (itensNova.value.length > 1) {
    itensNova.value.splice(index, 1);
  }
}

const totalNovaCalculado = computed(() => {
  return itensNova.value.reduce((acc, curr) => acc + (curr.quantidade * curr.precoUnitario || 0), 0);
});

function salvarNovaEncomenda() {
  let clienteId = clienteSelecionadoId.value;

  if (novoClienteModo.value) {
    if (!novoClienteNome.value.trim() || !novoClienteTelefone.value.trim()) {
      alert('Preencha o nome e o telefone do novo cliente.');
      return;
    }
    const novo = clientesStore.adicionarCliente({
      nome: novoClienteNome.value,
      telefone: novoClienteTelefone.value,
    });
    clienteId = novo.id;
  }

  if (!clienteId) {
    alert('Selecione ou cadastre um cliente.');
    return;
  }

  const itensValidos = itensNova.value.filter((i) => i.descricao.trim().length > 0);
  if (itensValidos.length === 0) {
    alert('Adicione pelo menos um medicamento ou item na encomenda.');
    return;
  }

  encomendasStore.criarEncomenda({
    clienteId,
    observacao: observacaoNova.value,
    itens: itensValidos,
  });

  showNovaModal.value = false;
}

function abrirModalPagamento(enc: Encomenda) {
  selectedEncomenda.value = enc;
  const saldoRestante = Math.max(0, enc.valor_total - enc.valor_pago);
  valorPagamento.value = saldoRestante > 0 ? saldoRestante : 0;
  formaPagamento.value = 'pix';
  isEstorno.value = false;
  motivoEstorno.value = '';
  showPagamentoModal.value = true;
}

function confirmarPagamento() {
  if (!selectedEncomenda.value) return;

  if (valorPagamento.value <= 0 && !isEstorno.value) {
    alert('Informe um valor de pagamento válido.');
    return;
  }

  if (isEstorno.value && !motivoEstorno.value.trim()) {
    alert('Para estorno, informe obrigatoriamente o motivo.');
    return;
  }

  encomendasStore.registrarPagamento({
    encomendaId: selectedEncomenda.value.id,
    valor: valorPagamento.value,
    forma: formaPagamento.value,
    tipo: isEstorno.value ? 'estorno' : 'pagamento',
    motivoEstorno: motivoEstorno.value,
  });

  showPagamentoModal.value = false;
}

function abrirCupom(enc: Encomenda) {
  selectedEncomenda.value = enc;
  showCupomModal.value = true;
}

function imprimirCupom() {
  window.print();
}

function executarArquivarEntregues() {
  const qtd = encomendasStore.arquivarEntregues();
  showArquivarConfirmModal.value = false;
  alert(`${qtd} encomenda(s) entregue(s) foram arquivadas do painel operacional com sucesso.`);
}

function mudarStatus(enc: Encomenda, novoStatus: StatusEncomenda) {
  const res = encomendasStore.alterarStatus(enc.id, novoStatus);
  if (!res.sucesso) {
    alert(res.mensagem);
  }
}

function abrirWhatsApp(enc: Encomenda) {
  const url = encomendasStore.gerarLinkWhatsApp(enc);
  if (url) {
    window.open(url, '_blank');
  }
}
</script>

<template>
  <div class="encomendas-page">
    <!-- Top Action Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="font-size: 1.5rem; font-weight: 800;">Gestão de Encomendas</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Fluxo operacional de pedidos de clientes, situação de compra e entrega
        </p>
      </div>

      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <button
          @click="showArquivarConfirmModal = true"
          class="btn btn-secondary"
          id="btn-arquivar-entregues"
          title="Arquivar pedidos entregues da visualização padrão"
        >
          <Archive :size="16" />
          <span>Arquivar Entregues</span>
        </button>

        <button
          @click="abrirNovaEncomendaModal"
          class="btn btn-primary"
          id="btn-nova-encomenda"
        >
          <Plus :size="18" />
          <span>Nova Encomenda</span>
        </button>
      </div>
    </div>

    <!-- Status Tabs (Spec 8: Aguardando, Pedido Feito, Chegou, Entregue, Todas) -->
    <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; overflow-x: auto; padding-bottom: 2px;">
      <button
        v-for="tab in (['Todas', 'Aguardando', 'Pedido Feito', 'Chegou', 'Entregue'] as const)"
        :key="tab"
        @click="encomendasStore.activeTab = tab"
        class="btn btn-sm"
        :id="'tab-' + tab.toLowerCase().replace(' ', '-')"
        :style="{
          background: encomendasStore.activeTab === tab ? 'var(--color-primary)' : 'transparent',
          color: encomendasStore.activeTab === tab ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          padding: '0.6rem 1rem'
        }"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Search & Filters -->
    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center;">
      <div style="position: relative; flex: 1; min-width: 260px;">
        <Search :size="16" style="position: absolute; left: 12px; top: 11px; color: var(--text-muted);" />
        <input
          v-model="encomendasStore.searchQuery"
          type="text"
          placeholder="Buscar por cliente, telefone, medicamento ou código..."
          class="form-input"
          id="input-busca-encomendas"
          style="padding-left: 2.3rem;"
        />
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Pagamento:</span>
        <select
          v-model="encomendasStore.paymentFilter"
          class="form-select"
          id="select-filtro-pagamento"
          style="width: auto; padding: 0.5rem 0.75rem;"
        >
          <option value="todos">Todos</option>
          <option value="Pago">Pago</option>
          <option value="Parcial">Parcial</option>
          <option value="Não pago">Não pago</option>
        </select>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="encomendasStore.filteredEncomendas.length === 0"
      class="card"
      style="padding: 3rem; text-align: center; color: var(--text-muted);"
    >
      <PackageOpen :size="48" style="margin: 0 auto 1rem; opacity: 0.5;" />
      <h3>Nenhuma encomenda encontrada</h3>
      <p style="font-size: 0.9rem; margin-top: 0.5rem;">
        Alterne a aba de status ou clique em "Nova Encomenda" para registrar uma nova solicitação.
      </p>
    </div>

    <!-- Orders Cards Grid / List -->
    <div v-else style="display: flex; flex-direction: column; gap: 1rem;">
      <div
        v-for="enc in encomendasStore.filteredEncomendas"
        :key="enc.id"
        class="card"
        :id="'card-encomenda-' + enc.id"
        style="padding: 1.25rem 1.5rem;"
      >
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">
                {{ enc.cliente?.nome || 'Cliente não identificado' }}
              </span>
              <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">
                {{ enc.cliente?.telefone }}
              </span>
              <span v-if="enc.codigo_rastreio" style="font-size: 0.75rem; background: var(--bg-body); padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid var(--border-color);">
                {{ enc.codigo_rastreio }}
              </span>
            </div>
            <div v-if="enc.observacao" style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem;">
              Nota: {{ enc.observacao }}
            </div>
          </div>

          <!-- Badges & Situacao -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <!-- Badge de Status Derivado -->
            <span
              class="badge"
              :class="{
                'badge-aguardando': enc.status === 'Aguardando',
                'badge-pedido-feito': enc.status === 'Pedido Feito',
                'badge-chegou': enc.status === 'Chegou',
                'badge-entregue': enc.status === 'Entregue',
                'badge-cancelada': enc.status === 'Cancelada',
              }"
            >
              {{ enc.status }}
            </span>

            <!-- Badge de Pagamento (Clicável abre modal de pagamento - Regra 5.4) -->
            <button
              @click="abrirModalPagamento(enc)"
              class="badge"
              :class="{
                'badge-pago': enc.situacao_pagamento === 'Pago',
                'badge-parcial': enc.situacao_pagamento === 'Parcial',
                'badge-nao-pago': enc.situacao_pagamento === 'Não pago',
              }"
              style="cursor: pointer; border: none;"
              title="Clique para registrar pagamento ou visualizar recibo"
            >
              {{ enc.situacao_pagamento }} ({{ formatarMoeda(enc.valor_pago) }} / {{ formatarMoeda(enc.valor_total) }})
            </button>
          </div>
        </div>

        <!-- Items Table inside Order -->
        <div style="margin-bottom: 1rem;">
          <table style="width: 100%; font-size: 0.88rem; border-collapse: collapse;">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">
                <th style="text-align: left; padding: 4px 0;">Item / Medicamento</th>
                <th style="text-align: center; padding: 4px 8px;">Qtd</th>
                <th style="text-align: right; padding: 4px 8px;">Preço Un.</th>
                <th style="text-align: right; padding: 4px 8px;">Subtotal</th>
                <th style="text-align: right; padding: 4px 0;">Status Compra</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in enc.itens" :key="item.id" style="border-top: 1px dashed var(--border-color);">
                <td style="padding: 6px 0; font-weight: 500;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>{{ item.descricao }}</span>
                    <!-- Alerta de medicamento controlado (Spec 5.9) -->
                    <span v-if="item.controlado" class="badge badge-controlado" title="Medicamento de controle especial - Portaria 344/98">
                      Controlado
                    </span>
                    <span v-if="item.urgente" class="badge badge-urgente">
                      Urgente
                    </span>
                  </div>
                </td>
                <td style="text-align: center; padding: 6px 8px;">{{ item.quantidade }}</td>
                <td style="text-align: right; padding: 6px 8px;">{{ formatarMoeda(item.preco_unitario) }}</td>
                <td style="text-align: right; padding: 6px 8px; font-weight: 600;">{{ formatarMoeda(item.subtotal) }}</td>
                <td style="text-align: right; padding: 6px 0;">
                  <span
                    class="badge"
                    :class="{
                      'badge-aguardando': item.status_item === 'Aguardando',
                      'badge-pedido-feito': item.status_item === 'Pedido Feito',
                      'badge-chegou': item.status_item === 'Chegou',
                    }"
                    style="font-size: 0.72rem;"
                  >
                    {{ item.status_item }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Actions Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <!-- Marcar como Entregue (se Chegou) -->
            <button
              v-if="enc.status === 'Chegou'"
              @click="mudarStatus(enc, 'Entregue')"
              class="btn btn-sm btn-primary"
              :id="'btn-entregar-' + enc.id"
            >
              <CheckCircle :size="14" />
              <span>Marcar Entregue</span>
            </button>

            <!-- Retrocesso / Admin Override -->
            <button
              v-if="authStore.isAdmin && enc.status === 'Entregue'"
              @click="mudarStatus(enc, 'Chegou')"
              class="btn btn-sm btn-secondary"
              title="Admin: retroceder status para Chegou"
            >
              <span>Reabrir</span>
            </button>

            <!-- Cancelar Encomenda -->
            <button
              v-if="enc.status !== 'Entregue' && enc.status !== 'Cancelada'"
              @click="mudarStatus(enc, 'Cancelada')"
              class="btn btn-sm btn-secondary"
              style="color: #9f1239;"
              :id="'btn-cancelar-' + enc.id"
            >
              <span>Cancelar Encomenda</span>
            </button>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <!-- Avisar WhatsApp (quando Chegou) -->
            <button
              v-if="enc.status === 'Chegou'"
              @click="abrirWhatsApp(enc)"
              class="btn btn-whatsapp btn-sm"
              :id="'btn-whatsapp-enc-' + enc.id"
            >
              <Send :size="14" />
              <span>Avisar no WhatsApp</span>
            </button>

            <!-- Pagamento -->
            <button
              @click="abrirModalPagamento(enc)"
              class="btn btn-secondary btn-sm"
              :id="'btn-pagamento-' + enc.id"
            >
              <DollarSign :size="14" />
              <span>Pagamento</span>
            </button>

            <!-- Imprimir Cupom -->
            <button
              @click="abrirCupom(enc)"
              class="btn btn-secondary btn-sm"
              :id="'btn-cupom-' + enc.id"
            >
              <Printer :size="14" />
              <span>Cupom</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: NOVA ENCOMENDA -->
    <div v-if="showNovaModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 650px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Nova Encomenda</h3>
          <button @click="showNovaModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Cliente Selection or Fast Creation -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <label class="form-label" style="margin-bottom: 0;">Cliente</label>
              <button
                type="button"
                @click="novoClienteModo = !novoClienteModo"
                style="background: none; border: none; color: var(--color-primary); font-size: 0.82rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;"
              >
                <UserPlus :size="14" />
                <span>{{ novoClienteModo ? 'Selecionar existente' : '+ Novo cliente rápido' }}</span>
              </button>
            </div>

            <div v-if="!novoClienteModo">
              <select v-model="clienteSelecionadoId" class="form-select" id="select-cliente-encomenda">
                <option v-for="c in clientesStore.currentTenantClientes" :key="c.id" :value="c.id">
                  {{ c.nome }} ({{ c.telefone }})
                </option>
              </select>
            </div>

            <div v-else style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: var(--bg-body); padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
              <div>
                <label class="form-label">Nome Completo</label>
                <input v-model="novoClienteNome" type="text" placeholder="Nome do cliente" class="form-input" />
              </div>
              <div>
                <label class="form-label">Telefone / WhatsApp</label>
                <input v-model="novoClienteTelefone" type="text" placeholder="(11) 99999-9999" class="form-input" />
              </div>
            </div>
          </div>

          <!-- Itens da Encomenda -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <label class="form-label" style="margin-bottom: 0;">Itens / Medicamentos Solicitados</label>
              <button
                type="button"
                @click="adicionarItemLinha"
                class="btn btn-secondary btn-sm"
              >
                + Adicionar Item
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div
                v-for="(item, index) in itensNova"
                :key="index"
                style="display: grid; grid-template-columns: 2fr 70px 100px 40px; gap: 0.5rem; align-items: center; background: var(--bg-body); padding: 0.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);"
              >
                <div>
                  <input
                    v-model="item.descricao"
                    type="text"
                    placeholder="Descrição do medicamento..."
                    class="form-input"
                    style="font-size: 0.85rem;"
                  />
                  <div style="display: flex; gap: 0.75rem; margin-top: 4px; font-size: 0.75rem;">
                    <label style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
                      <input type="checkbox" v-model="item.controlado" />
                      <span>Controlado</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; color: #dc2626;">
                      <input type="checkbox" v-model="item.urgente" />
                      <span>Urgente</span>
                    </label>
                  </div>
                </div>

                <div>
                  <input
                    v-model.number="item.quantidade"
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    class="form-input"
                    style="text-align: center; font-size: 0.85rem;"
                  />
                </div>

                <div>
                  <input
                    v-model.number="item.precoUnitario"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="R$ Un."
                    class="form-input"
                    style="text-align: right; font-size: 0.85rem;"
                  />
                </div>

                <div style="text-align: center;">
                  <button
                    type="button"
                    @click="removerItemLinha(index)"
                    style="background: none; border: none; color: #ef4444; cursor: pointer;"
                    title="Remover linha"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>

            <div style="text-align: right; margin-top: 0.75rem; font-weight: 700; font-size: 1.05rem;">
              Total: {{ formatarMoeda(totalNovaCalculado) }}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Observações / Instruções</label>
            <textarea
              v-model="observacaoNova"
              class="form-textarea"
              rows="2"
              placeholder="Ex.: Receita retida no balcão, urgência de viagem..."
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showNovaModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="salvarNovaEncomenda" class="btn btn-primary" id="btn-salvar-nova-encomenda">
            Criar Encomenda
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: REGISTRAR PAGAMENTO (Spec 5.4) -->
    <div v-if="showPagamentoModal && selectedEncomenda" class="modal-backdrop">
      <div class="modal-content">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Registro de Pagamento</h3>
          <button @click="showPagamentoModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div style="background: var(--bg-body); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 4px;">
              <span>Valor Total da Encomenda:</span>
              <span style="font-weight: 700;">{{ formatarMoeda(selectedEncomenda.valor_total) }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 4px;">
              <span>Já Pago pelo Cliente:</span>
              <span style="color: #16a34a; font-weight: 700;">{{ formatarMoeda(selectedEncomenda.valor_pago) }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; border-top: 1px dashed var(--border-color); padding-top: 4px; margin-top: 4px;">
              <span>Saldo em Aberto:</span>
              <span style="color: #dc2626; font-weight: 800;">
                {{ formatarMoeda(Math.max(0, selectedEncomenda.valor_total - selectedEncomenda.valor_pago)) }}
              </span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Valor do Lançamento (R$)</label>
            <input
              v-model.number="valorPagamento"
              type="number"
              step="0.01"
              class="form-input"
              id="input-valor-pagamento"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Forma de Pagamento</label>
            <select v-model="formaPagamento" class="form-select" id="select-forma-pagamento">
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="convenio">Convênio</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          <!-- Estorno / Retificação (Spec 5.4: Pagamentos não são apagados, correção por estorno com motivo) -->
          <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #9f1239;">
              <input type="checkbox" v-model="isEstorno" />
              <span>Este lançamento é um Estorno / Devolução</span>
            </label>

            <div v-if="isEstorno" style="margin-top: 0.5rem;">
              <label class="form-label">Motivo do Estorno (obrigatório para auditoria)</label>
              <input
                v-model="motivoEstorno"
                type="text"
                placeholder="Ex.: Desistência do medicamento, valor digitado incorreto..."
                class="form-input"
              />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showPagamentoModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="confirmarPagamento" class="btn btn-primary" id="btn-confirmar-pagamento">
            Confirmar Pagamento
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: IMPRESSÃO DE CUPOM TÉRMICO (Spec 8) -->
    <div v-if="showCupomModal && selectedEncomenda" class="modal-backdrop">
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Comprovante de Encomenda</h3>
          <button @click="showCupomModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Thermal Paper Layout Preview -->
          <div style="background: #ffffff; color: #000000; padding: 1.5rem 1rem; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem; line-height: 1.4;">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
              <div style="font-weight: bold; font-size: 1rem;">{{ authStore.currentConfig.nome_sistema }}</div>
              <div>{{ authStore.currentTenant.nome_empresa }}</div>
              <div>COMPROVANTE DE ENCOMENDA</div>
            </div>

            <div style="margin-bottom: 0.75rem;">
              <div>Código: {{ selectedEncomenda.codigo_rastreio }}</div>
              <div>Data: {{ new Date(selectedEncomenda.criado_em).toLocaleDateString('pt-BR') }}</div>
              <div>Cliente: {{ selectedEncomenda.cliente?.nome }}</div>
              <div>Telefone: {{ selectedEncomenda.cliente?.telefone }}</div>
            </div>

            <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 0.5rem 0; margin-bottom: 0.75rem;">
              <div v-for="it in selectedEncomenda.itens" :key="it.id" style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>{{ it.quantidade }}x {{ it.descricao }}</span>
                <span>{{ formatarMoeda(it.subtotal) }}</span>
              </div>
            </div>

            <div style="text-align: right; font-weight: bold; margin-bottom: 0.5rem;">
              TOTAL: {{ formatarMoeda(selectedEncomenda.valor_total) }}
            </div>
            <div style="text-align: right; color: #475569;">
              PAGO: {{ formatarMoeda(selectedEncomenda.valor_pago) }}
            </div>
            <div style="text-align: right; font-weight: bold; margin-bottom: 0.75rem;">
              SITUAÇÃO: {{ selectedEncomenda.situacao_pagamento.toUpperCase() }}
            </div>

            <div style="text-align: center; font-size: 0.72rem; border-top: 1px dashed #000; padding-top: 0.5rem;">
              Avisaremos pelo WhatsApp assim que o pedido estiver pronto para retirada. Obrigado pela preferência!
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showCupomModal = false" class="btn btn-secondary">
            Fechar
          </button>
          <button @click="imprimirCupom" class="btn btn-primary" id="btn-imprimir-cupom">
            <Printer :size="16" />
            <span>Imprimir Cupom</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO: ARQUIVAR ENTREGUES (Spec 5.6) -->
    <div v-if="showArquivarConfirmModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Arquivar Encomendas Entregues</h3>
          <button @click="showArquivarConfirmModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 0.75rem;">
            As encomendas com status <strong>Entregue</strong> serão removidas da visualização operacional do painel para manter o sistema ágil e limpo.
          </p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Elas continuarão preservadas permanentemente no histórico, auditoria e relatórios fiscais/gerenciais. Deseja prosseguir?
          </p>
        </div>
        <div class="modal-footer">
          <button @click="showArquivarConfirmModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="executarArquivarEntregues" class="btn btn-primary" id="btn-confirmar-arquivamento">
            Confirmar Arquivamento
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
