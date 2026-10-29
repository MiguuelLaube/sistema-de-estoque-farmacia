<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import { useMedicamentosMemoriaStore } from '../stores/medicamentosMemoria';
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
} from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();
const memoriaStore = useMedicamentosMemoriaStore();

// Form State
const selectedClientId = ref<string>('');
const clientSearchText = ref<string>('');
const clientQuickPhone = ref<string>('');
const showClientDropdown = ref(false);
const formErrorMsg = ref<string>('');

const itens = ref<Array<{ quantity: number; name: string; price: string }>>([
  { quantity: 1, name: '', price: '0,00' },
]);

const activeSuggestionIndex = ref<number | null>(null);
const suggestions = ref<Array<{ name: string; price?: number }>>([]);

const valorJaPagoStr = ref<string>('');
const observacoes = ref<string>('');
const medicamentoPago = ref<boolean>(false);

// Employee Modal State
const showEmployeeModal = ref<boolean>(false);
const isCreating = ref<boolean>(false);

// Filter clients for autocomplete
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

// Medications Management
function addItem() {
  itens.value.push({ quantity: 1, name: '', price: '0,00' });
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
    itens.value[index].price = sug.price.toFixed(2).replace('.', ',');
  }
  activeSuggestionIndex.value = null;
}

function parseMoney(valStr: string): number {
  if (!valStr) return 0;
  const clean = valStr.toString().replace(/[^\d,\.]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const totalCalculado = computed(() => {
  return itens.value.reduce((acc, curr) => {
    const p = parseMoney(curr.price);
    const q = Math.max(1, parseInt(String(curr.quantity)) || 1);
    return acc + (p * q);
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

// Watch payment toggle
watch(medicamentoPago, (pago) => {
  if (pago) {
    valorJaPagoStr.value = totalCalculado.value.toFixed(2).replace('.', ',');
  } else {
    valorJaPagoStr.value = '0,00';
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

// Validation
const isFormValid = computed(() => {
  if (!selectedClientId.value && !clientSearchText.value.trim()) return false;
  return itens.value.every((it) => it.name.trim().length > 0 && (Number(it.quantity) || 0) >= 1);
});

function handleSubmit() {
  formErrorMsg.value = '';
  if (!isFormValid.value) return;

  // Se digitou um nome novo sem selecionar na lista, verifica se já existe exato ou exige telefone válido
  if (!selectedClientId.value) {
    const existente = clientesStore.currentTenantClientes.find(
      (c) => c.nome.trim().toUpperCase() === clientSearchText.value.trim().toUpperCase()
    );
    if (existente) {
      selectedClientId.value = existente.id;
    } else {
      const telDigitos = clientQuickPhone.value.replace(/\D/g, '');
      if (telDigitos.length < 10 || telDigitos.length > 11) {
        formErrorMsg.value = 'Para cadastrar um novo cliente rapidamente, informe um telefone/WhatsApp válido com DDD (10 ou 11 dígitos).';
        return;
      }
    }
  }

  // BUG-09 FIX: Impedir adiantamento negativo ou maior que o total do pedido
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

function confirmCreateOrder(employee: Funcionario) {
  isCreating.value = true;

  let clientId = selectedClientId.value;
  if (!clientId && clientSearchText.value.trim()) {
    const newClient = clientesStore.adicionarCliente({
      nome: clientSearchText.value.trim().toUpperCase(),
      telefone: clientQuickPhone.value.trim(),
      base_legal: 'execucao_contrato',
    });
    clientId = newClient.id;
  }

  const itemsData = itens.value.map((it) => ({
    descricao: it.name.trim().toUpperCase(),
    quantidade: Math.max(1, parseInt(String(it.quantity)) || 1),
    precoUnitario: parseMoney(it.price),
    controlado: false,
    urgente: false,
  }));

  const order = encomendasStore.criarEncomenda({
    clienteId: clientId,
    observacao: observacoes.value.trim() || undefined,
    funcionarioNome: employee.nome,
    itens: itemsData,
  });

  // Apply payment if paid or partially paid
  if (valorJaPago.value > 0) {
    encomendasStore.registrarPagamento({
      encomendaId: order.id,
      valor: valorJaPago.value,
      forma: 'pix',
      funcionarioNome: employee.nome,
    });
  }

  showEmployeeModal.value = false;
  isCreating.value = false;
  router.push('/encomendas');
}

function formatBRL(val: number): string {
  return 'R$ ' + val.toFixed(2).replace('.', ',');
}

// Global click listener to close suggestions
function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.suggestion-container')) {
    activeSuggestionIndex.value = null;
  }
}

onMounted(() => {
  const clienteIdUrl = route.query.clienteId as string;
  if (clienteIdUrl) {
    const c = clientesStore.currentTenantClientes.find((x) => x.id === clienteIdUrl);
    if (c) {
      selectClient(c);
    }
  }
  window.addEventListener('click', handleGlobalClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick);
});
</script>

<template>
  <div style="max-width: 540px; margin: 0 auto; padding-bottom: 3rem;">
    <!-- Header (matching Screenshot 2) -->
    <div style="margin-bottom: 1.5rem;">
      <h1 style="font-size: 1.6rem; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-heading);">
        Nova Encomenda
      </h1>
      <p style="font-size: 0.88rem; color: #64748b; margin: 4px 0 0;">
        Preencha os dados para criar uma nova encomenda
      </p>
    </div>

    <!-- Main Card -->
    <div
      style="
        background: #ffffff;
        border-radius: 1.25rem;
        box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
        border: 1px solid #f1f5f9;
        padding: 1.5rem;
      "
    >
      <!-- Card Section Title -->
      <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem; font-weight: 600; color: #0f172a; margin-bottom: 1.25rem;">
        <Package :size="20" style="color: #2563eb;" />
        <span>Dados da Encomenda</span>
      </div>

      <form @submit.prevent="handleSubmit" style="display: flex; flex-direction: column; gap: 1.25rem;">
        <div
          v-if="formErrorMsg"
          style="padding: 0.75rem 1rem; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 0.84rem; font-weight: 600;"
        >
          ⚠️ {{ formErrorMsg }}
        </div>

        <!-- FIELD: Cliente -->
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
            <User :size="15" style="color: #64748b;" />
            <span>Cliente</span>
          </label>

          <div style="position: relative; width: 100%;">
            <input
              v-model="clientSearchText"
              @input="handleClientInput"
              @focus="showClientDropdown = true"
              @blur="handleClientBlur"
              type="text"
              placeholder="Digite o nome, CPF ou telefone..."
              :style="{
                width: '100%',
                height: '42px',
                borderRadius: '10px',
                border: selectedClientId ? '1px solid #2563eb' : '1px solid #e2e8f0',
                background: selectedClientId ? '#eff6ff' : '#ffffff',
                padding: '0 2.2rem 0 0.85rem',
                fontSize: '0.9rem',
                color: '#0f172a',
                outline: 'none',
                transition: 'all 0.15s ease',
              }"
              id="input-nova-encomenda-cliente"
              required
            />

            <!-- Selected checkmark -->
            <span
              v-if="selectedClientId"
              style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #2563eb; font-weight: 700; font-size: 0.88rem;"
            >
              ✓
            </span>

            <!-- Autocomplete Dropdown -->
            <div
              v-if="showClientDropdown && filteredClients.length > 0"
              style="
                position: absolute;
                top: calc(100% + 4px);
                left: 0;
                right: 0;
                z-index: 50;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
                overflow: hidden;
              "
            >
              <button
                v-for="c in filteredClients"
                :key="c.id"
                type="button"
                @mousedown="selectClient(c)"
                style="
                  width: 100%;
                  text-align: left;
                  padding: 0.65rem 1rem;
                  display: flex;
                  flex-direction: column;
                  gap: 2px;
                  background: none;
                  border: none;
                  border-bottom: 1px solid #f1f5f9;
                  cursor: pointer;
                  transition: background 0.15s ease;
                "
                onmouseover="this.style.background='#f8fafc'"
                onmouseout="this.style.background='none'"
              >
                <span style="font-size: 0.88rem; font-weight: 600; color: #0f172a;">{{ c.nome }}</span>
                <span style="font-size: 0.76rem; color: #64748b;">
                  {{ c.cpf ? c.cpf + ' · ' : '' }}{{ c.telefone || 'Sem telefone' }}
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="!selectedClientId && clientSearchText.trim().length > 1"
            style="margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.25rem;"
          >
            <label style="font-size: 0.78rem; font-weight: 600; color: #475569;">
              WhatsApp do novo cliente (obrigatório para cadastro rápido)
            </label>
            <input
              v-model="clientQuickPhone"
              type="text"
              placeholder="(12) 99999-9999"
              style="
                width: 100%;
                height: 38px;
                border-radius: 10px;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                padding: 0 0.85rem;
                font-size: 0.86rem;
                color: #0f172a;
                outline: none;
              "
              id="input-nova-encomenda-cliente-telefone"
            />
          </div>
        </div>

        <!-- FIELD: Medicamentos -->
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
            <Pill :size="15" style="color: #64748b;" />
            <span>Medicamentos</span>
          </label>

          <!-- List of Item Rows -->
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <div
              v-for="(it, idx) in itens"
              :key="idx"
              style="display: flex; align-items: center; gap: 0.5rem;"
            >
              <!-- Quantity -->
              <input
                v-model.number="it.quantity"
                type="number"
                min="1"
                placeholder="Qtd"
                style="
                  width: 58px;
                  height: 40px;
                  border-radius: 10px;
                  border: 1px solid #e2e8f0;
                  background: #ffffff;
                  text-align: center;
                  font-size: 0.88rem;
                  color: #0f172a;
                  flex-shrink: 0;
                  outline: none;
                "
                required
              />

              <!-- Medication Name with Suggestions -->
              <div class="suggestion-container" style="position: relative; flex: 1;">
                <input
                  v-model="it.name"
                  @input="handleMedicationInput(idx)"
                  @focus="handleMedicationInput(idx)"
                  type="text"
                  placeholder="NOME DO MEDICAMENTO"
                  style="
                    width: 100%;
                    height: 40px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    background: #ffffff;
                    padding: 0 0.85rem;
                    font-size: 0.88rem;
                    text-transform: uppercase;
                    color: #0f172a;
                    outline: none;
                  "
                  required
                />

                <!-- Suggestions dropdown -->
                <div
                  v-if="activeSuggestionIndex === idx && suggestions.length > 0"
                  style="
                    position: absolute;
                    top: calc(100% + 4px);
                    left: 0;
                    right: 0;
                    z-index: 50;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
                    max-height: 180px;
                    overflow-y: auto;
                  "
                >
                  <button
                    v-for="(sug, sIdx) in suggestions"
                    :key="sIdx"
                    type="button"
                    @mousedown="selectSuggestion(idx, sug)"
                    style="
                      width: 100%;
                      text-align: left;
                      padding: 0.55rem 0.85rem;
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      background: none;
                      border: none;
                      border-bottom: 1px solid #f1f5f9;
                      cursor: pointer;
                    "
                    onmouseover="this.style.background='#f8fafc'"
                    onmouseout="this.style.background='none'"
                  >
                    <span style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; color: #0f172a;">
                      {{ sug.name }}
                    </span>
                    <span v-if="sug.price" style="font-size: 0.76rem; color: #64748b;">
                      R$ {{ sug.price.toFixed(2).replace('.', ',') }}
                    </span>
                  </button>
                </div>
              </div>

              <!-- Price Input with R$ prefix -->
              <div style="position: relative; width: 105px; flex-shrink: 0;">
                <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.82rem; color: #64748b;">
                  R$
                </span>
                <input
                  v-model="it.price"
                  type="text"
                  placeholder="0,00"
                  style="
                    width: 100%;
                    height: 40px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    background: #ffffff;
                    padding-left: 2.1rem;
                    padding-right: 0.6rem;
                    font-size: 0.88rem;
                    color: #0f172a;
                    outline: none;
                  "
                  required
                />
              </div>

              <!-- Delete Button -->
              <button
                type="button"
                @click="removeItem(idx)"
                :disabled="itens.length === 1"
                style="
                  width: 36px;
                  height: 36px;
                  border-radius: 8px;
                  border: none;
                  background: none;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #94a3b8;
                  cursor: pointer;
                  transition: all 0.15s ease;
                  flex-shrink: 0;
                "
                :style="{ opacity: itens.length === 1 ? 0.3 : 1, cursor: itens.length === 1 ? 'not-allowed' : 'pointer' }"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <!-- Button "+ Adicionar Medicamento" (dashed border) -->
          <button
            type="button"
            @click="addItem"
            style="
              width: 100%;
              height: 38px;
              border-radius: 10px;
              border: 1px dashed #cbd5e1;
              background: #ffffff;
              color: #475569;
              font-size: 0.82rem;
              font-weight: 500;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.35rem;
              cursor: pointer;
              margin-top: 0.25rem;
              transition: all 0.15s ease;
            "
            onmouseover="this.style.borderColor='#94a3b8'; this.style.background='#f8fafc'"
            onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='#ffffff'"
            id="btn-adicionar-medicamento-linha"
          >
            <Plus :size="14" />
            <span>Adicionar Medicamento</span>
          </button>

          <!-- Total Banner (matching Screenshot 2: light blue container) -->
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: #eff6ff;
              border: 1px solid #bfdbfe;
              border-radius: 10px;
              padding: 0.75rem 1rem;
              margin-top: 0.5rem;
            "
          >
            <span style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; font-weight: 600; color: #1e3a8a;">
              <DollarSign :size="16" style="color: #2563eb;" />
              <span>Total</span>
            </span>
            <span style="font-size: 1.15rem; font-weight: 700; color: #2563eb;">
              {{ formatBRL(totalCalculado) }}
            </span>
          </div>
        </div>

        <!-- TWO COLUMNS: Valor já pago & Valor a cobrar -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <!-- Left: Valor já pago -->
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <label style="font-size: 0.78rem; color: #64748b;">
              Valor já pago <span style="opacity: 0.7;">(opcional)</span>
            </label>
            <div style="position: relative; width: 100%;">
              <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.82rem; color: #64748b;">
                R$
              </span>
              <input
                v-model="valorJaPagoStr"
                :disabled="medicamentoPago"
                type="text"
                placeholder="0,00"
                style="
                  width: 100%;
                  height: 38px;
                  border-radius: 8px;
                  border: 1px solid #e2e8f0;
                  background: #ffffff;
                  padding-left: 2.1rem;
                  padding-right: 0.75rem;
                  font-size: 0.88rem;
                  color: #0f172a;
                  outline: none;
                "
              />
            </div>
          </div>

          <!-- Right: Valor a cobrar (automático) -->
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <label style="font-size: 0.78rem; color: #64748b;">
              Valor a cobrar <span style="opacity: 0.7;">(automático)</span>
            </label>
            <div
              style="
                display: flex;
                align-items: center;
                height: 38px;
                padding: 0 0.85rem;
                border-radius: 8px;
                border: 1px solid #bfdbfe;
                background: #eff6ff;
                font-size: 0.9rem;
                font-weight: 600;
                color: #2563eb;
              "
            >
              {{ formatBRL(valorACobrar) }}
            </div>
          </div>
        </div>

        <!-- Observações (opcional) -->
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
            <FileText :size="15" style="color: #64748b;" />
            <span>Observações</span>
            <span style="font-size: 0.76rem; font-weight: 400; color: #64748b;">(opcional)</span>
          </label>
          <textarea
            v-model="observacoes"
            placeholder="Alguma observação sobre este pedido..."
            rows="3"
            style="
              width: 100%;
              border-radius: 10px;
              border: 1px solid #e2e8f0;
              background: #ffffff;
              padding: 0.65rem 0.85rem;
              font-size: 0.88rem;
              color: #0f172a;
              resize: none;
              outline: none;
              font-family: inherit;
            "
          ></textarea>
        </div>

        <!-- Large Payment Radio / Toggle Button (matching Screenshot 2) -->
        <button
          type="button"
          @click="medicamentoPago = !medicamentoPago"
          style="
            width: 100%;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.85rem 1rem;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: left;
          "
          :style="{
            border: medicamentoPago ? '2px solid #2563eb' : '2px solid #e2e8f0',
            background: medicamentoPago ? '#eff6ff' : '#ffffff',
            color: medicamentoPago ? '#2563eb' : '#64748b',
          }"
          id="btn-toggle-medicamento-pago"
        >
          <!-- Radio circle -->
          <div
            style="
              width: 20px;
              height: 20px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.15s ease;
            "
            :style="{
              border: medicamentoPago ? '2px solid #2563eb' : '2px solid #94a3b8',
              background: medicamentoPago ? '#2563eb' : 'transparent',
            }"
          >
            <Check v-if="medicamentoPago" :size="12" style="color: #ffffff; stroke-width: 3;" />
          </div>

          <span style="font-size: 0.92rem; font-weight: 600;">
            {{ medicamentoPago ? 'Medicamento pago ✓' : 'Medicamento não pago' }}
          </span>
        </button>

        <!-- Big Submit Button (Criar Pedido - Pill Style) -->
        <button
          type="submit"
          :disabled="!isFormValid || isCreating"
          style="
            width: 100%;
            height: 48px;
            border-radius: 9999px;
            border: none;
            background: #2563eb;
            color: #ffffff;
            font-size: 0.95rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
            transition: all 0.15s ease;
          "
          :style="{ opacity: !isFormValid || isCreating ? 0.6 : 1, cursor: !isFormValid || isCreating ? 'not-allowed' : 'pointer' }"
          id="btn-submit-criar-pedido"
        >
          <FileText :size="18" />
          <span>{{ isCreating ? 'Criando...' : 'Criar Pedido' }}</span>
        </button>
      </form>
    </div>

    <!-- MODAL: Quem está criando esta encomenda? (OE matching Base44) -->
    <div v-if="showEmployeeModal" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 380px;">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">
          Quem está criando esta encomenda?
        </h3>
        <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 1rem;">
          Selecione o atendente responsável pelo registro.
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button
            v-for="emp in listaAtendentesModal"
            :key="emp.id"
            @click="confirmCreateOrder(emp)"
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
  </div>
</template>
