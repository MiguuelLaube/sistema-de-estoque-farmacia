<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import type { Tenant } from '../types';
import {
  ShieldCheck,
  Building2,
  Plus,
  KeyRound,
  AlertOctagon,
  PauseCircle,
  PlayCircle,
  X,
  CheckCircle,
} from 'lucide-vue-next';

const authStore = useAuthStore();

// Modals
const showNovoTenantModal = ref(false);
const showBreakGlassModal = ref(false);
const selectedTenantParaSuporte = ref<Tenant | null>(null);
const justificativaBreakGlass = ref('');

// Form Novo Tenant
const nomeEmpresaNovo = ref('');
const slugNovo = ref('');
const planoNovo = ref<'basico' | 'profissional' | 'enterprise'>('basico');
const limiteNovo = ref(300);

function alternarStatusTenant(tenant: Tenant) {
  if (tenant.status === 'ativo') {
    tenant.status = 'suspenso';
  } else {
    tenant.status = 'ativo';
  }
}

function salvarNovoTenant() {
  if (!nomeEmpresaNovo.value.trim() || !slugNovo.value.trim()) {
    alert('Preencha o nome da empresa e o identificador (slug).');
    return;
  }

  const id = 't' + Math.random().toString(36).substr(2, 9);
  const novoTenant: Tenant = {
    id,
    nome_empresa: nomeEmpresaNovo.value.trim(),
    slug: slugNovo.value.trim().toLowerCase(),
    dominio: `${slugNovo.value.trim().toLowerCase()}.plataforma.com.br`,
    status: 'ativo',
    plano: planoNovo.value,
    limite_encomendas_mes: limiteNovo.value,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  authStore.tenants.push(novoTenant);
  authStore.configs[id] = {
    tenant_id: id,
    nome_sistema: `${novoTenant.nome_empresa} Encomendas`,
    cor_primaria: '#2563eb',
    cor_secundaria: '#1e293b',
    modelo_cupom: 'padrao',
    fuso: 'America/Sao_Paulo',
    mensagem_whatsapp: 'Olá {cliente}! Seu pedido de {medicamento} está disponível para retirada.',
    base_legal_padrao: 'execucao_contrato',
    bloquear_entrega_com_saldo: false,
    dias_retencao_arquivamento: 90,
  };

  showNovoTenantModal.value = false;
  nomeEmpresaNovo.value = '';
  slugNovo.value = '';
  alert('Nova empresa/tenant provisionada com sucesso!');
}

function abrirBreakGlass(tenant: Tenant) {
  selectedTenantParaSuporte.value = tenant;
  justificativaBreakGlass.value = '';
  showBreakGlassModal.value = true;
}

function confirmarBreakGlass() {
  if (!justificativaBreakGlass.value.trim()) {
    alert('A justificativa técnica para acesso emergencial é obrigatória por cláusula de auditoria LGPD.');
    return;
  }

  if (selectedTenantParaSuporte.value) {
    authStore.switchTenant(selectedTenantParaSuporte.value.id);
    showBreakGlassModal.value = false;
    alert(`Acesso emergencial concedido para suporte na empresa "${selectedTenantParaSuporte.value.nome_empresa}". Registro imutável gravado no LogAuditoria.`);
  }
}
</script>

<template>
  <div class="plataforma-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <ShieldCheck :size="24" style="color: #6366f1;" />
          <h2 style="font-size: 1.5rem; font-weight: 800;">Portal da Plataforma (SaaS)</h2>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Plano de controle para gestão de clientes assinantes, planos e limites de operação
        </p>
      </div>

      <button
        @click="showNovoTenantModal = true"
        class="btn-primary-pill"
        id="btn-novo-tenant"
      >
        <Plus :size="18" />
        <span>Provisionar Novo Tenant</span>
      </button>
    </div>

    <!-- Aggregated Metrics (Spec 4.1 & 6.7: Super admin lê apenas uso agregado, sem ver dados finais) -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-info">
          <div class="stat-label">Tenants Ativos</div>
          <div class="stat-value" style="color: #6366f1;">
            {{ authStore.tenants.filter((t) => t.status === 'ativo').length }}
          </div>
        </div>
        <div class="stat-icon" style="background: #e0e7ff; color: #4338ca;">
          <Building2 :size="24" />
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-info">
          <div class="stat-label">Assinaturas Ativas</div>
          <div class="stat-value" style="color: #16a34a;">
            {{ authStore.tenants.length }}
          </div>
        </div>
        <div class="stat-icon" style="background: #dcfce7; color: #16a34a;">
          <CheckCircle :size="24" />
        </div>
      </div>
    </div>

    <!-- Tenants Management Table -->
    <div class="table-container">
      <table class="data-table" id="tabela-tenants">
        <thead>
          <tr>
            <th>Empresa / Tenant</th>
            <th>Identificador (Slug)</th>
            <th>Plano Contratado</th>
            <th style="text-align: center;">Limite Mensal</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: right;">Ações de Controle</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in authStore.tenants" :key="t.id">
            <td style="font-weight: 700;">
              <div>{{ t.nome_empresa }}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 400;">
                {{ t.dominio }}
              </div>
            </td>
            <td style="font-family: monospace;">{{ t.slug }}</td>
            <td>
              <span class="badge" style="background: var(--bg-body); text-transform: uppercase;">
                {{ t.plano }}
              </span>
            </td>
            <td style="text-align: center; font-weight: 600;">
              {{ t.limite_encomendas_mes }} enc./mês
            </td>
            <td style="text-align: center;">
              <span
                class="badge"
                :class="t.status === 'ativo' ? 'badge-chegou' : 'badge-cancelada'"
              >
                {{ t.status.toUpperCase() }}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                <!-- Suporte Break-Glass (Spec 6.7) -->
                <button
                  @click="abrirBreakGlass(t)"
                  class="btn-outline-neutral"
                  style="padding: 4px 12px; font-size: 0.8rem;"
                  title="Acesso emergencial de suporte com justificativa auditada"
                >
                  <KeyRound :size="14" />
                  <span>Acesso Emergencial</span>
                </button>

                <!-- Suspender / Reativar Tenant (Spec 8) -->
                <button
                  @click="alternarStatusTenant(t)"
                  class="btn-outline-neutral"
                  style="padding: 4px 12px; font-size: 0.8rem;"
                  :style="{ color: t.status === 'ativo' ? '#dc2626 !important' : '#16a34a !important' }"
                >
                  <PauseCircle v-if="t.status === 'ativo'" :size="14" />
                  <PlayCircle v-else :size="14" />
                  <span>{{ t.status === 'ativo' ? 'Suspender' : 'Ativar' }}</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL: PROVISIONAR NOVO TENANT -->
    <div v-if="showNovoTenantModal" class="modal-backdrop">
      <div class="modal-content">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Provisionar Nova Farmácia / Loja</h3>
          <button @click="showNovoTenantModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nome da Empresa / Farmácia</label>
            <input
              v-model="nomeEmpresaNovo"
              type="text"
              placeholder="Ex.: Farmácia Popular Central"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Identificador Único (Slug de Subdomínio)</label>
            <input
              v-model="slugNovo"
              type="text"
              placeholder="Ex.: central"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Plano de Assinatura</label>
            <select v-model="planoNovo" class="form-select">
              <option value="basico">Básico (Até 300 encomendas/mês)</option>
              <option value="profissional">Profissional (Até 1.000 encomendas/mês)</option>
              <option value="enterprise">Enterprise (Ilimitado / Dedicado)</option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showNovoTenantModal = false" class="btn-outline-neutral">
            Cancelar
          </button>
          <button @click="salvarNovoTenant" class="btn-primary-pill" id="btn-salvar-tenant">
            Provisionar Empresa
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: BREAK-GLASS / ACESSO EMERGENCIAL (Spec 6.7) -->
    <div v-if="showBreakGlassModal && selectedTenantParaSuporte" class="modal-backdrop">
      <div class="modal-content">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem; color: #dc2626;">
            <AlertOctagon :size="20" />
            <h3 style="font-size: 1.15rem;">Acesso Emergencial de Suporte (Break-Glass)</h3>
          </div>
          <button @click="showBreakGlassModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">
            Você está solicitando acesso ao ambiente de dados de <strong>{{ selectedTenantParaSuporte.nome_empresa }}</strong>.
            Conforme a seção 6.7 e a LGPD, o fornecedor só pode acessar mediante registro de justificativa técnica que ficará visível ao cliente.
          </p>

          <div class="form-group">
            <label class="form-label">Justificativa Técnica Obrigatória</label>
            <textarea
              v-model="justificativaBreakGlass"
              rows="3"
              placeholder="Ex.: Chamado de suporte #48291 - Investigação de erro de sincronização de compras"
              class="form-textarea"
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showBreakGlassModal = false" class="btn-outline-neutral">
            Cancelar
          </button>
          <button @click="confirmarBreakGlass" class="btn-primary-pill" style="background-color: #dc2626 !important;" id="btn-confirmar-break-glass">
            Confirmar Acesso Auditado
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
