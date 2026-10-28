<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClientesStore } from '../stores/clientes';
import { useEncomendasStore } from '../stores/encomendas';
import HistoricoClienteModal from '../components/HistoricoClienteModal.vue';
import type { Cliente } from '../types';
import {
  Plus,
  Search,
  Phone,
  Package,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  User,
  Download,
  ShieldCheck,
  Eye,
  EyeOff,
  History,
  ChevronRight,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const clientesStore = useClientesStore();
const encomendasStore = useEncomendasStore();

// UI States
const buscaTexto = ref('');
const showClienteModal = ref(false);
const clienteEmEdicao = ref<Cliente | null>(null);
const showHistoricoModal = ref(false);
const clienteHistorico = ref<Cliente | null>(null);

// Form Model
const formNome = ref('');
const formTelefone = ref('');
const formCpf = ref('');
const formEndereco = ref('');
const alertaDuplicidade = ref<string | null>(null);

// Clientes Enriquecidos com contagem de pedidos
const clientesEnriquecidos = computed(() => {
  const q = buscaTexto.value.toLowerCase().trim();

  return clientesStore.currentTenantClientes
    .filter((c) => !c.arquivado_em)
    .map((c) => {
      const pedidosDoCliente = encomendasStore.currentTenantEncomendas.filter((e) => e.cliente_id === c.id);
      return {
        ...c,
        encomendas_count: pedidosDoCliente.length,
      };
    })
    .filter((c) => {
      if (!q) return true;
      const nomeMatch = c.nome.toLowerCase().includes(q);
      const telMatch = c.telefone.toLowerCase().includes(q);
      const cpfMatch = c.cpf ? c.cpf.includes(q) : false;
      return nomeMatch || telMatch || cpfMatch;
    });
});

function verificarDuplicidadeTempoReal() {
  if (formNome.value.length > 2 || formTelefone.value.length > 6 || formCpf.value.length > 5) {
    const dup = clientesStore.verificarDuplicidade(
      formNome.value,
      formTelefone.value,
      formCpf.value,
      clienteEmEdicao.value?.id
    );
    alertaDuplicidade.value = dup ? dup.mensagem : null;
  } else {
    alertaDuplicidade.value = null;
  }
}

function abrirFormularioNovo() {
  clienteEmEdicao.value = null;
  formNome.value = '';
  formTelefone.value = '';
  formCpf.value = '';
  formEndereco.value = '';
  alertaDuplicidade.value = null;
  showClienteModal.value = true;
}

function abrirHistorico(c: Cliente) {
  clienteHistorico.value = c;
  showHistoricoModal.value = true;
}

function abrirEdicao(c: Cliente) {
  clienteEmEdicao.value = c;
  formNome.value = c.nome;
  formTelefone.value = c.telefone;
  formCpf.value = c.cpf || '';
  formEndereco.value = c.endereco || '';
  alertaDuplicidade.value = null;
  showClienteModal.value = true;
}

onMounted(() => {
  const clienteIdUrl = route.query.historico as string;
  if (clienteIdUrl) {
    const c = clientesStore.allClientes.find((x) => x.id === clienteIdUrl);
    if (c) {
      abrirHistorico(c);
    }
  }
});

function salvarCliente() {
  if (!formNome.value.trim() || !formTelefone.value.trim()) {
    alert('Nome e Telefone são campos obrigatórios.');
    return;
  }

  formNome.value = formNome.value.trim().toUpperCase();

  const cleanTel = formTelefone.value.replace(/\D/g, '');
  const duplicado = clientesStore.currentTenantClientes.find(
    (c) => c.id !== clienteEmEdicao.value?.id && c.telefone.replace(/\D/g, '') === cleanTel
  );
  if (duplicado) {
    alert(`Não é permitido cadastrar telefones duplicados. Já associado a: ${duplicado.nome}`);
    return;
  }

  if (clienteEmEdicao.value) {
    clientesStore.atualizarCliente(clienteEmEdicao.value.id, {
      nome: formNome.value,
      telefone: formTelefone.value,
      cpf: formCpf.value || undefined,
      endereco: formEndereco.value || undefined,
    });
  } else {
    clientesStore.adicionarCliente({
      nome: formNome.value,
      telefone: formTelefone.value,
      cpf: formCpf.value || undefined,
      endereco: formEndereco.value || undefined,
      base_legal: 'execucao_contrato',
    });
  }

  showClienteModal.value = false;
}

function removerCliente(c: Cliente) {
  if (confirm(`Deseja arquivar o cliente "${c.nome}"?\n\n(Para exercer o direito de esquecimento/anonimização conforme a LGPD, abra a edição do cliente e clique em "Anonimizar Titular")`)) {
    clientesStore.arquivarCliente(c.id);
  }
}

// LGPD Art. 18: Revelação auditada de CPF em tela
const revealedCpfs = ref<Record<string, boolean>>({});
function toggleRevealCpf(id: string) {
  revealedCpfs.value[id] = !revealedCpfs.value[id];
}

// LGPD Art. 18, II e V: Exportação de dados do titular (DSAR / Portabilidade)
function exportarDados(c: Cliente) {
  clientesStore.exportarDadosTitular(c.id);
}

// LGPD Art. 18, IV e VI: Eliminação e anonimização irreversível
function anonimizarTitular(c: Cliente) {
  const confirmacao = confirm(
    `ATENÇÃO - AÇÃO IRREVERSÍVEL (LGPD Art. 18):\n\nConfirma a anonimização dos dados de "${c.nome}"?\n\nO nome, telefone, CPF e endereço serão apagados e substituídos por dados anônimos, preservando o histórico de encomendas.`
  );
  if (confirmacao) {
    clientesStore.anonimizarCliente(c.id);
    showClienteModal.value = false;
  }
}
</script>

<template>
  <div class="clientes-page" style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem;">
    <!-- Top Action Bar (matching Base44 screenshot 3) -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="font-size: 1.6rem; font-weight: 700; color: var(--text-main); font-family: var(--font-heading); margin: 0;">
          Clientes
        </h1>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin: 3px 0 0;">
          {{ clientesEnriquecidos.length }} clientes cadastrados
        </p>
      </div>

      <button
        @click="abrirFormularioNovo"
        class="btn-primary-pill"
        id="btn-novo-cliente"
      >
        <Plus :size="16" />
        <span>Novo Cliente</span>
      </button>
    </div>

    <!-- Full-width Search Input -->
    <div style="position: relative; width: 100%;">
      <Search :size="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted);" />
      <input
        v-model="buscaTexto"
        type="text"
        placeholder="Buscar por nome, CPF ou telefone..."
        style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid #e2e8f0; background: #ffffff; padding-left: 2.6rem; padding-right: 1rem; font-size: 0.92rem; color: #0f172a; outline: none; transition: border-color 0.15s ease;"
        id="input-busca-clientes"
      />
    </div>

    <!-- List of Client Cards (horizontal cards matching Base44 screenshot 3) -->
    <div v-if="clientesEnriquecidos.length === 0" class="empty-state-card" style="text-align: center; padding: 4rem 1rem;">
      <User :size="44" style="margin: 0 auto 0.75rem; opacity: 0.35;" />
      <p style="color: var(--text-muted); font-size: 0.95rem;">Nenhum cliente encontrado</p>
    </div>

    <div v-else style="display: flex; flex-direction: column; gap: 0.65rem;">
      <div
        v-for="c in clientesEnriquecidos"
        :key="c.id"
        class="pedido-item-card"
        :id="'cliente-card-' + c.id"
      >
        <!-- Left Side: Avatar + Info -->
        <div style="display: flex; align-items: center; gap: 1rem; min-width: 0;">
          <!-- Avatar Letter Box -->
          <div style="width: 44px; height: 44px; border-radius: 14px; background-color: #eff6ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span style="font-size: 1.05rem; font-weight: 700; color: #2563eb; font-family: var(--font-heading);">
              {{ c.nome.charAt(0).toUpperCase() }}
            </span>
          </div>

          <!-- Name and Subtitle Row -->
          <div style="min-width: 0;">
            <h4
              @click="abrirHistorico(c)"
              class="pedido-item-name"
              style="cursor: pointer; transition: color 0.15s ease;"
              :title="'Ver histórico de remédios de ' + c.nome"
            >
              {{ c.nome }}
            </h4>

            <div style="display: flex; align-items: center; gap: 0.85rem; margin-top: 3px; font-size: 0.82rem; flex-wrap: wrap;">
              <span style="display: flex; align-items: center; gap: 4px; color: #64748b;">
                <Phone :size="13" />
                <span>{{ c.telefone }}</span>
              </span>

              <span v-if="c.cpf" style="display: flex; align-items: center; gap: 4px; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 6px;">
                <ShieldCheck :size="13" style="color: #059669;" />
                <span style="font-family: monospace;">{{ revealedCpfs[c.id] ? c.cpf : clientesStore.mascararCPF(c.cpf) }}</span>
                <button
                  type="button"
                  @click.stop="toggleRevealCpf(c.id)"
                  style="background: none; border: none; padding: 0 2px; cursor: pointer; color: #64748b; display: inline-flex; align-items: center;"
                  :title="revealedCpfs[c.id] ? 'Ocultar CPF' : 'Revelar CPF'"
                >
                  <EyeOff v-if="revealedCpfs[c.id]" :size="12" />
                  <Eye v-else :size="12" />
                </button>
              </span>

              <!-- Badge de Encomendas Clicável -->
              <button
                type="button"
                @click="abrirHistorico(c)"
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  color: #2563eb;
                  background: #eff6ff;
                  border: 1px solid #bfdbfe;
                  padding: 2px 8px;
                  border-radius: 9999px;
                  font-size: 0.76rem;
                  font-weight: 700;
                  cursor: pointer;
                  transition: all 0.15s ease;
                "
                title="Clique para ver o histórico detalhado deste cliente"
              >
                <Package :size="12" />
                <span>{{ c.encomendas_count }} encom.</span>
                <ChevronRight :size="11" />
              </button>
            </div>
          </div>
        </div>

        <!-- Right Side: Ver Histórico, Export LGPD, Edit & Delete Buttons -->
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap;">
          <!-- Botão em Pílula Destaque: Ver Histórico -->
          <button
            @click="abrirHistorico(c)"
            class="btn-historico-pill"
            style="
              display: inline-flex;
              align-items: center;
              gap: 0.4rem;
              background-color: #eff6ff;
              color: #2563eb;
              border: 1px solid #bfdbfe;
              border-radius: 9999px;
              padding: 0.42rem 0.95rem;
              font-size: 0.82rem;
              font-weight: 700;
              cursor: pointer;
              transition: all 150ms ease;
            "
            title="Ver histórico de medicamentos, preços e datas deste cliente"
            :id="'btn-historico-cliente-' + c.id"
          >
            <History :size="14" />
            <span>Ver Histórico</span>
          </button>

          <button
            @click="exportarDados(c)"
            class="btn-icon-gear"
            title="Exportar Dados do Titular (Art. 18 LGPD)"
            style="color: #059669;"
            :id="'btn-exportar-lgpd-' + c.id"
          >
            <Download :size="16" />
          </button>

          <button
            @click="abrirEdicao(c)"
            class="btn-icon-gear"
            title="Editar Cadastro do Cliente"
            :id="'btn-editar-cliente-' + c.id"
          >
            <Pencil :size="16" />
          </button>

          <button
            @click="removerCliente(c)"
            class="btn-icon-gear"
            title="Arquivar Cliente"
            style="color: #64748b;"
            :id="'btn-excluir-cliente-' + c.id"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: NOVO / EDITAR CLIENTE (matching Base44 dialog modal style) -->
    <div v-if="showClienteModal" class="modal-backdrop">
      <div class="base44-modal-dialog">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; font-family: var(--font-heading); margin: 0;">
            {{ clienteEmEdicao ? 'Editar Cliente' : 'Novo Cliente' }}
          </h3>
          <button
            @click="showClienteModal = false"
            style="background: none; border: none; cursor: pointer; color: #64748b; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- Alerta de Duplicidade em Tempo Real -->
        <div
          v-if="alertaDuplicidade"
          style="padding: 0.75rem 1rem; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 12px; display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; font-size: 0.85rem;"
        >
          <AlertTriangle :size="18" style="color: #b45309; flex-shrink: 0;" />
          <span style="font-weight: 600;">{{ alertaDuplicidade }}</span>
        </div>

        <form @submit.prevent="salvarCliente" style="display: flex; flex-direction: column; gap: 1.15rem;">
          <!-- Nome Completo -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Nome Completo *
            </label>
            <input
              v-model="formNome"
              @input="verificarDuplicidadeTempoReal"
              type="text"
              placeholder="Ex: EDEN LIGIERI"
              class="base44-modal-input"
              required
              id="input-cliente-nome"
              autofocus
            />
          </div>

          <!-- Telefone / WhatsApp -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Telefone / WhatsApp *
            </label>
            <input
              v-model="formTelefone"
              @input="verificarDuplicidadeTempoReal"
              type="text"
              placeholder="(12) 96225-4802"
              class="base44-modal-input"
              required
              id="input-cliente-telefone"
            />
          </div>

          <!-- CPF (opcional) -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              CPF <span style="font-weight: 400; color: #64748b; font-size: 0.82rem;">(opcional)</span>
            </label>
            <input
              v-model="formCpf"
              @input="verificarDuplicidadeTempoReal"
              type="text"
              placeholder="000.000.000-00"
              class="base44-modal-input"
              id="input-cliente-cpf"
            />
          </div>

          <!-- Endereço (opcional) -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #0f172a;">
              Endereço <span style="font-weight: 400; color: #64748b; font-size: 0.82rem;">(opcional)</span>
            </label>
            <input
              v-model="formEndereco"
              type="text"
              placeholder="Rua, número, bairro"
              class="base44-modal-input"
              id="input-cliente-endereco"
            />
          </div>

          <!-- Footer Action Buttons: Cancelar, Anonimizar & Salvar -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-top: 0.5rem; flex-wrap: wrap;">
            <div>
              <button
                v-if="clienteEmEdicao"
                type="button"
                @click="anonimizarTitular(clienteEmEdicao)"
                style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 7px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
                title="Exercer Direito à Eliminação e Anonimização (Art. 18 da LGPD)"
                id="btn-anonimizar-cliente-lgpd"
              >
                <Trash2 :size="13" />
                <span>Anonimizar (LGPD)</span>
              </button>
            </div>

            <div style="display: flex; gap: 0.75rem;">
              <button
                type="button"
                @click="showClienteModal = false"
                class="modal-btn-cancelar"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="modal-btn-adicionar"
                id="btn-confirmar-salvar-cliente"
              >
                {{ clienteEmEdicao ? 'Salvar Alterações' : 'Salvar Cliente' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: HISTÓRICO DE MEDICAMENTOS, PREÇOS E DATAS DO CLIENTE -->
    <HistoricoClienteModal
      v-model="showHistoricoModal"
      :cliente="clienteHistorico"
      @novo-pedido="(clienteId) => router.push({ path: '/nova-encomenda', query: { clienteId } })"
      @editar-cliente="(c) => abrirEdicao(c)"
    />
  </div>
</template>
