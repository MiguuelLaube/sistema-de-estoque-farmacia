<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import { useMedicamentosMemoriaStore } from '../stores/medicamentosMemoria';
import { useConfirmDialog } from '../composables/useConfirmDialog';
import type { Funcionario, Cliente } from '../types';
import {
  Package,
  User,
  Pill,
  DollarSign,
  Plus,
  Trash2,
  FileText,
  Check,
  X,
  Phone,
  Loader2,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();
const memoriaStore = useMedicamentosMemoriaStore();
const dialog = useConfirmDialog();

// Estado do formulário
const selectedClientId = ref<string>('');
const clientSearchText = ref<string>('');
const clientQuickPhone = ref<string>('');
const showClientDropdown = ref(false);
const formErrorMsg = ref<string>('');

const itens = ref<Array<{ quantity: number; name: string; price: string }>>([
  { quantity: 1, name: '', price: '' },
]);

const activeSuggestionIndex = ref<number | null>(null);
const suggestions = ref<Array<{ name: string; price?: number }>>([]);

const valorJaPagoStr = ref<string>('');
const observacoes = ref<string>('');
const medicamentoPago = ref<boolean>(false);

// Modal de Atendente e estado de envio
const showEmployeeModal = ref<boolean>(false);
const isCreating = ref<boolean>(false);

function resetForm() {
  selectedClientId.value = '';
  clientSearchText.value = '';
  clientQuickPhone.value = '';
  showClientDropdown.value = false;
  formErrorMsg.value = '';
  itens.value = [{ quantity: 1, name: '', price: '' }];
  activeSuggestionIndex.value = null;
  suggestions.value = [];
  valorJaPagoStr.value = '';
  observacoes.value = '';
  medicamentoPago.value = false;
  showEmployeeModal.value = false;
  isCreating.value = false;
}

// Observa abertura do modal e pré-seleção de cliente
watch(
  () => [encomendasStore.showNovaEncomendaModal, encomendasStore.clientePreSelecionadoId],
  ([aberto, clienteId]) => {
    if (aberto) {
      resetForm();
      if (clienteId) {
        const c = clientesStore.currentTenantClientes.find((x) => x.id === clienteId);
        if (c) {
          selectClient(c);
        }
      }
    }
  }
);

function formatarMoedaInput(valor: string | number): string {
  if (valor === '' || valor === null || valor === undefined) return '';
  const numStr = String(valor).replace(/\D/g, '');
  if (!numStr) return '';
  const cents = parseInt(numStr, 10);
  if (isNaN(cents) || cents === 0) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarTelefoneInput(val: string): string {
  if (!val) return '';
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

// Filtro de clientes para autocomplete
const filteredClients = computed(() => {
  const q = clientSearchText.value.trim().toLowerCase();
  if (!q) return [];
  return clientesStore.currentTenantClientes
    .filter((c) => {
      const matchName = c.nome.toLowerCase().includes(q);
      const matchTel = c.telefone.toLowerCase().includes(q);
      const matchCpf = c.cpf ? c.cpf.includes(q) : false;
      return matchName || matchTel || matchCpf;
    })
    .slice(0, 6);
});

function selectClient(client: Cliente) {
  selectedClientId.value = client.id;
  clientSearchText.value = client.nome;
  clientQuickPhone.value = client.telefone || '';
  formErrorMsg.value = '';
  showClientDropdown.value = false;
}

function handleClientInput() {
  showClientDropdown.value = true;
  if (selectedClientId.value) {
    const sel = clientesStore.currentTenantClientes.find((c) => c.id === selectedClientId.value);
    if (!sel || sel.nome.toLowerCase() !== clientSearchText.value.trim().toLowerCase()) {
      selectedClientId.value = '';
    }
  }
}

function handleClientBlur() {
  setTimeout(() => {
    showClientDropdown.value = false;
  }, 200);
}

// Gestão de Medicamentos
function addItem() {
  itens.value.push({ quantity: 1, name: '', price: '' });
}

function removeItem(index: number) {
  if (itens.value.length > 1) {
    itens.value.splice(index, 1);
  }
}

function handleMedicationInput(index: number) {
  const term = itens.value[index].name.trim();
  if (term.length >= 2) {
    suggestions.value = memoriaStore.obterSugestoes(term);
    activeSuggestionIndex.value = suggestions.value.length > 0 ? index : null;
  } else {
    suggestions.value = [];
    activeSuggestionIndex.value = null;
  }
}

function selectSuggestion(index: number, sug: { name: string; price?: number }) {
  itens.value[index].name = sug.name;
  if (sug.price && sug.price > 0) {
    itens.value[index].price = sug.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  activeSuggestionIndex.value = null;
}

function parseMoney(valStr: string | number): number {
  if (typeof valStr === 'number') return isNaN(valStr) ? 0 : valStr;
  if (!valStr) return 0;
  const clean = valStr.toString().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const totalCalculado = computed(() => {
  return itens.value.reduce((acc, curr) => {
    const p = parseMoney(curr.price);
    const q = Math.max(1, parseInt(String(curr.quantity)) || 1);
    return acc + p * q;
  }, 0);
});

const valorJaPago = computed(() => {
  if (medicamentoPago.value) {
    return totalCalculado.value;
  }
  return parseMoney(valorJaPagoStr.value);
});

const valorACobrar = computed(() => {
  return Math.max(0, totalCalculado.value - valorJaPago.value);
});

watch(medicamentoPago, (pago) => {
  if (pago) {
    valorJaPagoStr.value =
      totalCalculado.value > 0
        ? totalCalculado.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
  } else {
    valorJaPagoStr.value = '';
  }
});

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

const isFormValid = computed(() => {
  if (!selectedClientId.value && !clientSearchText.value.trim()) return false;
  return itens.value.every((it) => it.name.trim().length > 0 && (Number(it.quantity) || 0) >= 1);
});

function handleSubmit() {
  formErrorMsg.value = '';
  if (!isFormValid.value) return;

  if (!selectedClientId.value) {
    const existente = clientesStore.currentTenantClientes.find(
      (c) => c.nome.trim().toUpperCase() === clientSearchText.value.trim().toUpperCase()
    );
    if (existente) {
      selectedClientId.value = existente.id;
    } else {
      const telDigitos = clientQuickPhone.value.replace(/\D/g, '');
      if (telDigitos.length < 10 || telDigitos.length > 11) {
        formErrorMsg.value = 'Para cadastrar um novo cliente, informe um telefone/WhatsApp válido com DDD (10 ou 11 dígitos).';
        return;
      }
    }
  }

  if (valorJaPago.value < 0) {
    formErrorMsg.value = 'O valor adiantado não pode ser negativo.';
    return;
  }
  if (!medicamentoPago.value && valorJaPago.value > totalCalculado.value + 0.001) {
    formErrorMsg.value = 'O valor já pago não pode ultrapassar o valor total calculado da encomenda.';
    return;
  }

  showEmployeeModal.value = true;
}

async function confirmCreateOrder(employee: Funcionario) {
  isCreating.value = true;

  let clientId = selectedClientId.value;
  if (!clientId && clientSearchText.value.trim()) {
    try {
      const newClient = await clientesStore.adicionarCliente({
        nome: clientSearchText.value.trim().toUpperCase(),
        telefone: clientQuickPhone.value.trim(),
        base_legal: 'execucao_contrato',
      });
      clientId = newClient.id;
    } catch (err: any) {
      console.error('Erro ao cadastrar cliente na nova encomenda:', err);
      showEmployeeModal.value = false;
      formErrorMsg.value = err?.message || 'Não foi possível cadastrar o cliente.';
      isCreating.value = false;
      return;
    }
  }

  const itemsData = itens.value.map((it) => ({
    descricao: it.name.trim().toUpperCase(),
    quantidade: Math.max(1, parseInt(String(it.quantity)) || 1),
    precoUnitario: parseMoney(it.price),
    controlado: false,
    urgente: false,
  }));

  try {
    const order = await encomendasStore.criarEncomenda({
      clienteId: clientId,
      observacao: observacoes.value.trim() || undefined,
      funcionarioNome: employee.nome,
      itens: itemsData,
    });

    if (valorJaPago.value > 0) {
      await encomendasStore.registrarPagamento({
        encomendaId: order.id,
        valor: valorJaPago.value,
        forma: 'pix',
        funcionarioNome: employee.nome,
      });
    }

    showEmployeeModal.value = false;
    encomendasStore.fecharModalNovaEncomenda();

    await dialog.alert({
      title: 'Encomenda Criada',
      message: `Encomenda #${order.codigo_rastreio} cadastrada com sucesso!`,
      tipo: 'sucesso',
    });
  } catch (err) {
    console.error('Erro ao processar nova encomenda:', err);
    await dialog.alert({
      title: 'Erro ao Gravar Encomenda',
      message: (err as any)?.message
        ? `Erro ao registrar encomenda: ${(err as any).message}`
        : 'Erro ao registrar encomenda. Por favor, verifique a conexão e tente novamente.',
      tipo: 'perigo',
    });
  } finally {
    isCreating.value = false;
  }
}

function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.suggestion-container')) {
    activeSuggestionIndex.value = null;
  }
}

function fecharPopUp() {
  if (isCreating.value) return;
  encomendasStore.fecharModalNovaEncomenda();
}

function handleKeydown(e: KeyboardEvent) {
  if (encomendasStore.showNovaEncomendaModal && e.key === 'Escape' && !showEmployeeModal.value) {
    fecharPopUp();
  }
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick);
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <transition name="modal-fade">
    <div
      v-if="encomendasStore.showNovaEncomendaModal"
      class="nova-encomenda-popup-backdrop"
      @click.self="fecharPopUp"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-nova-encomenda-title"
    >
      <div class="nova-encomenda-popup-card">
        <!-- Cabeçalho do Pop-up -->
        <div class="popup-header">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div class="popup-header-icon-box">
              <Package :size="20" />
            </div>
            <div>
              <h2 id="popup-nova-encomenda-title" class="popup-title">
                Nova Encomenda
              </h2>
              <p class="popup-subtitle">
                Preencha os dados do cliente e medicamentos para registrar
              </p>
            </div>
          </div>

          <button
            type="button"
            @click="fecharPopUp"
            class="btn-fechar-popup"
            aria-label="Fechar pop-up de nova encomenda"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Corpo com Rolagem Interna -->
        <div class="popup-body">
          <form @submit.prevent="handleSubmit" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <!-- Alerta de Erro de Validação -->
            <div
              v-if="formErrorMsg"
              style="padding: 0.75rem 1rem; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 0.84rem; font-weight: 600;"
            >
              {{ formErrorMsg }}
            </div>

            <!-- CAMPO: CLIENTE -->
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                <span style="display: flex; align-items: center; gap: 0.45rem;">
                  <User :size="15" style="color: var(--color-primary);" />
                  <span>Cliente</span>
                </span>
                <span v-if="selectedClientId" style="font-size: 0.75rem; color: #059669; font-weight: 600;">
                  Cliente identificado no sistema
                </span>
              </label>

              <div style="position: relative; width: 100%;">
                <input
                  v-model="clientSearchText"
                  @input="handleClientInput"
                  @blur="handleClientBlur"
                  type="text"
                  placeholder="Digite o nome ou telefone do cliente..."
                  class="base44-modal-input"
                  id="input-popup-encomenda-cliente"
                  required
                />

                <!-- Dropdown de Autocomplete de Clientes -->
                <div
                  v-if="showClientDropdown && filteredClients.length > 0"
                  class="client-autocomplete-dropdown"
                >
                  <div
                    v-for="c in filteredClients"
                    :key="c.id"
                    @mousedown="selectClient(c)"
                    class="client-autocomplete-item"
                  >
                    <div style="font-weight: 600; color: #0f172a;">{{ c.nome }}</div>
                    <div style="font-size: 0.76rem; color: #64748b;">{{ c.telefone || 'Sem telefone' }}</div>
                  </div>
                </div>
              </div>

              <!-- Telefone rápido se for cliente novo -->
              <div v-if="!selectedClientId && clientSearchText.trim().length > 1" style="margin-top: 0.35rem;">
                <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.25rem;">
                  <Phone :size="13" />
                  <span>Telefone / WhatsApp (para novo cliente)</span>
                </label>
                <input
                  v-model="clientQuickPhone"
                  @input="clientQuickPhone = formatarTelefoneInput(clientQuickPhone)"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  class="base44-modal-input"
                  id="input-popup-encomenda-telefone"
                />
              </div>
            </div>

            <!-- CAMPO: MEDICAMENTOS -->
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                  <Pill :size="15" style="color: var(--color-primary);" />
                  <span>Medicamentos / Itens</span>
                </label>

                <button
                  type="button"
                  @click="addItem"
                  class="btn-outline-neutral"
                  style="padding: 0.3rem 0.75rem; font-size: 0.76rem; border-radius: 9999px;"
                >
                  <Plus :size="13" />
                  <span>Mais Item</span>
                </button>
              </div>

              <div
                v-for="(it, idx) in itens"
                :key="idx"
                class="medication-row-box"
              >
                <div style="display: flex; gap: 0.5rem; align-items: center; width: 100%;">
                  <!-- Quantidade -->
                  <div style="width: 65px; flex-shrink: 0;">
                    <label style="font-size: 0.72rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 2px;">Qtd</label>
                    <input
                      v-model.number="it.quantity"
                      type="number"
                      min="1"
                      class="base44-modal-input"
                      style="text-align: center; font-weight: 700;"
                      required
                    />
                  </div>

                  <!-- Nome do Medicamento com Sugestões Inteligentes -->
                  <div style="flex: 1; position: relative;" class="suggestion-container">
                    <label style="font-size: 0.72rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 2px;">Nome do Medicamento</label>
                    <input
                      v-model="it.name"
                      @input="handleMedicationInput(idx)"
                      type="text"
                      placeholder="Ex: LOSARTANA 50MG"
                      class="base44-modal-input"
                      style="text-transform: uppercase;"
                      required
                    />

                    <!-- Sugestões da memória de farmácia -->
                    <div
                      v-if="activeSuggestionIndex === idx && suggestions.length > 0"
                      class="medication-suggestions-dropdown"
                    >
                      <div
                        v-for="(sug, sIdx) in suggestions"
                        :key="sIdx"
                        @mousedown="selectSuggestion(idx, sug)"
                        class="medication-suggestion-item"
                      >
                        <span style="font-weight: 600;">{{ sug.name }}</span>
                        <span v-if="sug.price" style="font-size: 0.75rem; color: #059669; font-weight: 700;">
                          R$ {{ sug.price.toFixed(2).replace('.', ',') }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Preço Unitário -->
                  <div style="width: 100px; flex-shrink: 0;">
                    <label style="font-size: 0.72rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 2px;">Preço Un. (R$)</label>
                    <input
                      v-model="it.price"
                      @input="it.price = formatarMoedaInput(it.price)"
                      type="text"
                      placeholder="0,00"
                      class="base44-modal-input"
                      style="text-align: right; font-weight: 600;"
                    />
                  </div>

                  <!-- Botão Remover Item -->
                  <button
                    v-if="itens.length > 1"
                    type="button"
                    @click="removeItem(idx)"
                    class="btn-remove-item"
                    title="Remover este medicamento"
                  >
                    <Trash2 :size="15" />
                  </button>
                </div>
              </div>
            </div>

            <!-- CAMPO: FINANCEIRO & PAGAMENTO -->
            <div class="financial-summary-box">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="display: flex; align-items: center; gap: 0.45rem; font-weight: 700; color: #0f172a; font-size: 0.92rem;">
                  <DollarSign :size="16" style="color: var(--color-primary);" />
                  <span>Resumo Financeiro</span>
                </span>
                <span style="font-size: 1.1rem; font-weight: 800; color: #0f172a;">
                  Total: R$ {{ totalCalculado.toFixed(2).replace('.', ',') }}
                </span>
              </div>

              <!-- Interruptor de Quitado / Já Pago -->
              <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.86rem; margin-bottom: 0.75rem;">
                <input
                  v-model="medicamentoPago"
                  type="checkbox"
                  style="width: 18px; height: 18px; accent-color: #059669;"
                />
                <span style="font-weight: 600; color: #1e293b;">
                  {{ medicamentoPago ? 'Medicamento pago integralmente no balcão' : 'Pagamento pendente / sinal adiantado' }}
                </span>
              </label>

              <!-- Adiantamento parcial quando não quitado -->
              <div v-if="!medicamentoPago" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                  <label style="font-size: 0.76rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 3px;">
                    Valor Adiantado (Sinal R$)
                  </label>
                  <input
                    v-model="valorJaPagoStr"
                    @input="valorJaPagoStr = formatarMoedaInput(valorJaPagoStr)"
                    type="text"
                    placeholder="0,00"
                    class="base44-modal-input"
                    style="font-weight: 600;"
                  />
                </div>

                <div>
                  <label style="font-size: 0.76rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 3px;">
                    Saldo a Cobrar na Entrega
                  </label>
                  <div style="height: 38px; display: flex; align-items: center; padding: 0 0.75rem; border-radius: 8px; background: #ffffff; border: 1px solid var(--border-card); font-weight: 700; color: #dc2626;">
                    R$ {{ valorACobrar.toFixed(2).replace('.', ',') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- CAMPO: OBSERVAÇÕES -->
            <div>
              <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; font-weight: 600; color: #475569; margin-bottom: 0.25rem;">
                <FileText :size="14" />
                <span>Observações Internas (Opcional)</span>
              </label>
              <textarea
                v-model="observacoes"
                rows="2"
                placeholder="Ex: Cliente prefere genérico da EMS, ligar antes de enviar."
                class="base44-modal-input"
                style="resize: vertical; font-size: 0.82rem;"
              ></textarea>
            </div>
          </form>
        </div>

        <!-- Rodapé de Ações do Pop-up -->
        <div class="popup-footer">
          <button
            type="button"
            @click="fecharPopUp"
            class="btn-popup-cancel"
            :disabled="isCreating"
          >
            Cancelar
          </button>

          <button
            type="button"
            @click="handleSubmit"
            :disabled="!isFormValid || isCreating"
            class="btn-popup-submit"
            id="btn-popup-salvar-encomenda"
          >
            <Loader2 v-if="isCreating" class="animate-spin" :size="16" />
            <Check v-else :size="16" />
            <span>{{ isCreating ? 'Gravando Encomenda...' : 'Criar Encomenda' }}</span>
          </button>
        </div>
      </div>
    </div>
  </transition>

  <!-- MODAL SECUNDÁRIO: Atendente Responsável pelo Registro -->
  <transition name="modal-fade">
    <div v-if="showEmployeeModal" class="employee-backdrop" role="dialog" aria-modal="true">
      <div class="employee-card">
        <h3 style="font-size: 1.12rem; font-weight: 800; color: #0f172a; margin: 0 0 0.35rem 0;">
          Quem está registrando esta encomenda?
        </h3>
        <p style="font-size: 0.82rem; color: #64748b; margin: 0 0 1rem 0;">
          Selecione o atendente responsável pelo pedido de balcão:
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 240px; overflow-y: auto;">
          <button
            v-for="emp in listaAtendentesModal"
            :key="emp.id"
            type="button"
            @click="confirmCreateOrder(emp)"
            :disabled="isCreating"
            class="employee-option-btn"
          >
            <div class="emp-avatar-sm">
              {{ emp.nome.charAt(0) }}
            </div>
            <div style="text-align: left;">
              <div style="font-weight: 700; color: #0f172a; font-size: 0.88rem;">{{ emp.nome }}</div>
              <div style="font-size: 0.74rem; color: #64748b;">{{ emp.cargo || 'Atendente' }}</div>
            </div>
          </button>
        </div>

        <button
          type="button"
          @click="showEmployeeModal = false"
          :disabled="isCreating"
          class="btn-popup-cancel"
          style="width: 100%; margin-top: 1rem;"
        >
          Voltar
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* Backdrop escuro com desfoque profundo */
.nova-encomenda-popup-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10010;
  padding: 1.25rem;
}

/* Card elevado que se sobressai na tela */
.nova-encomenda-popup-card {
  position: relative;
  background: #ffffff;
  border-radius: 20px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(226, 232, 240, 0.8);
  animation: popupSlide 220ms cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes popupSlide {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
  flex-shrink: 0;
}

.popup-header-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--color-primary-alpha, #eff6ff);
  color: var(--color-primary, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup-title {
  font-family: var(--font-heading, inherit);
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}

.popup-subtitle {
  font-size: 0.78rem;
  color: #64748b;
  margin: 2px 0 0 0;
}

.btn-fechar-popup {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-fechar-popup:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.popup-body {
  padding: 1.35rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.popup-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
  flex-shrink: 0;
}

.btn-popup-cancel {
  padding: 0.55rem 1.15rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-popup-cancel:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-popup-submit {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.35rem;
  border-radius: 9999px;
  border: none;
  background: var(--color-primary, #2563eb);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px var(--color-primary-alpha, rgba(37, 99, 235, 0.25));
  transition: all 0.15s ease;
}

.btn-popup-submit:hover:not(:disabled) {
  filter: brightness(0.92);
  transform: translateY(-1px);
}

.btn-popup-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.client-autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-top: 4px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  z-index: 50;
  overflow: hidden;
  max-height: 200px;
  overflow-y: auto;
}

.client-autocomplete-item {
  padding: 0.6rem 0.85rem;
  cursor: pointer;
  border-bottom: 1px solid #f8fafc;
  transition: background 0.12s ease;
}

.client-autocomplete-item:hover {
  background: #eff6ff;
}

.medication-row-box {
  background: #f8fafc;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  padding: 0.65rem 0.8rem;
}

.medication-suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-top: 2px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  z-index: 50;
  max-height: 160px;
  overflow-y: auto;
}

.medication-suggestion-item {
  padding: 0.5rem 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
}

.medication-suggestion-item:hover {
  background: #eff6ff;
}

.btn-remove-item {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  transition: background 0.12s ease;
}

.btn-remove-item:hover {
  background: #fee2e2;
}

.financial-summary-box {
  background: #f8fafc;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  padding: 0.85rem 1rem;
}

/* Modal secundário de atendente */
.employee-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.employee-card {
  background: #ffffff;
  border-radius: 16px;
  max-width: 380px;
  width: 100%;
  padding: 1.5rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
  animation: popupSlide 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.employee-option-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.15s ease;
  width: 100%;
}

.employee-option-btn:hover {
  border-color: var(--color-primary, #2563eb);
  background: var(--color-primary-subtle, #eff6ff);
}

.emp-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary-alpha, #eff6ff);
  color: var(--color-primary, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.82rem;
  flex-shrink: 0;
}
</style>
