<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
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
  Lock,
  Laptop,
  Globe,
  FileText,
  Trash2,
  RefreshCw,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const activePlatformTab = ref<'tenants' | 'seguranca' | 'auditoria'>('tenants');
const feedbackMsg = ref<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

function notificar(tipo: 'sucesso' | 'erro', texto: string) {
  feedbackMsg.value = { tipo, texto };
  setTimeout(() => {
    if (feedbackMsg.value?.texto === texto) feedbackMsg.value = null;
  }, 5000);
}

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

// Form Zero-Trust Super Admin
const formRestringirIp = ref(false);
const formIpsTexto = ref('');
const formExigirDispositivo = ref(false);
const nomeNovoDispositivo = ref('Estação Principal Diretoria');
const salvandoPolitica = ref(false);

function sincronizarFormularioZeroTrust() {
  formRestringirIp.value = authStore.superAdminContext.restringir_ip;
  formIpsTexto.value = authStore.superAdminContext.ips_permitidos.join('\n');
  formExigirDispositivo.value = authStore.superAdminContext.exigir_dispositivo_confiavel;
}

onMounted(async () => {
  await authStore.carregarSegurancaSuperAdmin();
  sincronizarFormularioZeroTrust();
});

watch(
  () => authStore.superAdminContext,
  () => {
    sincronizarFormularioZeroTrust();
  }
);

async function recarregarPainelSeguranca() {
  await authStore.carregarSegurancaSuperAdmin();
  sincronizarFormularioZeroTrust();
}

function incluirIpAtualNaLista() {
  const ip = authStore.superAdminContext.ip_atual;
  if (!ip) return;
  const atuais = formIpsTexto.value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!atuais.includes(ip)) {
    atuais.push(ip);
    formIpsTexto.value = atuais.join('\n');
  }
}

async function certificarEsteDispositivo() {
  const res = await authStore.autorizarDispositivoAtual(nomeNovoDispositivo.value);
  notificar(res.sucesso ? 'sucesso' : 'erro', res.mensagem);
}

async function revogarDispositivoConfiavel(id: string, nome: string) {
  if (!confirm(`Revogar o certificado de confiança do dispositivo "${nome}"?`)) return;
  await authStore.revogarDispositivo(id);
  notificar('sucesso', `Dispositivo "${nome}" revogado.`);
}

async function salvarPoliticaSeguranca() {
  const listaIps = formIpsTexto.value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (formRestringirIp.value && listaIps.length === 0) {
    notificar('erro', 'Inclua ao menos seu IP atual antes de ativar o bloqueio por endereço IP.');
    return;
  }

  if (formExigirDispositivo.value && !authStore.superAdminContext.dispositivo_reconhecido) {
    notificar('erro', 'Certifique este computador primeiro antes de tornar o Dispositivo Confiável obrigatório.');
    return;
  }

  salvandoPolitica.value = true;
  const res = await authStore.salvarPoliticaZeroTrust(
    formRestringirIp.value,
    listaIps,
    formExigirDispositivo.value
  );
  salvandoPolitica.value = false;
  notificar(res.sucesso ? 'sucesso' : 'erro', res.mensagem);
}

async function alternarStatusTenant(tenant: Tenant) {
  await authStore.alternarStatusTenant(tenant);
  notificar('sucesso', `Status de "${tenant.nome_empresa}" atualizado para ${tenant.status.toUpperCase()}.`);
}

async function salvarNovoTenant() {
  if (!nomeEmpresaNovo.value.trim() || !slugNovo.value.trim()) {
    notificar('erro', 'Preencha o nome da empresa e o identificador (slug).');
    return;
  }

  const limitePorPlano =
    planoNovo.value === 'enterprise' ? 99999 : planoNovo.value === 'profissional' ? 1000 : limiteNovo.value;

  const res = await authStore.provisionarTenant({
    nomeEmpresa: nomeEmpresaNovo.value,
    slug: slugNovo.value,
    plano: planoNovo.value,
    limite: limitePorPlano,
  });

  if (res.sucesso) {
    showNovoTenantModal.value = false;
    nomeEmpresaNovo.value = '';
    slugNovo.value = '';
    notificar('sucesso', res.mensagem);
  } else {
    notificar('erro', res.mensagem);
  }
}

function abrirBreakGlass(tenant: Tenant) {
  selectedTenantParaSuporte.value = tenant;
  justificativaBreakGlass.value = '';
  showBreakGlassModal.value = true;
}

async function confirmarBreakGlass() {
  if (justificativaBreakGlass.value.trim().length < 10) {
    notificar('erro', 'Informe uma justificativa técnica detalhada (mínimo 10 caracteres) para auditoria LGPD.');
    return;
  }

  if (selectedTenantParaSuporte.value) {
    const res = await authStore.ativarBreakGlass(
      selectedTenantParaSuporte.value.id,
      justificativaBreakGlass.value.trim()
    );
    if (res.sucesso) {
      showBreakGlassModal.value = false;
      router.push('/');
    } else {
      notificar('erro', res.mensagem);
    }
  }
}
</script>

<template>
  <div class="plataforma-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <ShieldCheck :size="24" style="color: #6366f1;" />
          <h2 style="font-size: 1.5rem; font-weight: 800;">Governança & Segurança Zero-Trust (SaaS)</h2>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Plano de controle exclusivo do Super Administrador (2FA Obrigatório • Invisível aos Tenants)
        </p>
      </div>

      <button
        v-if="activePlatformTab === 'tenants'"
        @click="showNovoTenantModal = true"
        class="btn-primary-pill"
        id="btn-novo-tenant"
      >
        <Plus :size="18" />
        <span>Provisionar Novo Tenant</span>
      </button>
    </div>

    <!-- Feedback -->
    <div
      v-if="feedbackMsg"
      :style="{
        marginBottom: '1rem',
        padding: '0.7rem 1.1rem',
        borderRadius: '9999px',
        fontSize: '0.85rem',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: feedbackMsg.tipo === 'sucesso' ? '#ecfdf5' : '#fef2f2',
        color: feedbackMsg.tipo === 'sucesso' ? '#065f46' : '#991b1b',
        border: `1px solid ${feedbackMsg.tipo === 'sucesso' ? '#a7f3d0' : '#fecaca'}`,
      }"
    >
      <span>{{ feedbackMsg.tipo === 'sucesso' ? '✅' : '⚠️' }}</span>
      <span>{{ feedbackMsg.texto }}</span>
    </div>

    <!-- Sub-abas da Plataforma -->
    <div class="sub-tabs-container" style="margin-bottom: 1.5rem;">
      <button
        @click="activePlatformTab = 'tenants'"
        class="sub-tab-btn"
        :class="{ active: activePlatformTab === 'tenants' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <Building2 :size="16" />
        <span>Empresas / Tenants</span>
      </button>

      <button
        @click="activePlatformTab = 'seguranca'; recarregarPainelSeguranca()"
        class="sub-tab-btn"
        :class="{ active: activePlatformTab === 'seguranca' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <Lock :size="16" />
        <span>Proteções da Conta (IP & Dispositivos)</span>
      </button>

      <button
        @click="activePlatformTab = 'auditoria'; recarregarPainelSeguranca()"
        class="sub-tab-btn"
        :class="{ active: activePlatformTab === 'auditoria' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <FileText :size="16" />
        <span>Auditoria Imutável de Acessos</span>
      </button>
    </div>

    <!-- ABA 1: TENANTS -->
    <div v-if="activePlatformTab === 'tenants'">
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
            <div class="stat-label">Assinaturas Cadastradas</div>
            <div class="stat-value" style="color: #16a34a;">
              {{ authStore.tenants.length }}
            </div>
          </div>
          <div class="stat-icon" style="background: #dcfce7; color: #16a34a;">
            <CheckCircle :size="24" />
          </div>
        </div>
      </div>

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
                  <button
                    @click="abrirBreakGlass(t)"
                    class="btn-outline-neutral"
                    style="padding: 4px 12px; font-size: 0.8rem;"
                    title="Acesso emergencial de suporte por 30 minutos com justificativa auditada"
                  >
                    <KeyRound :size="14" />
                    <span>Suporte Auditado</span>
                  </button>

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
    </div>

    <!-- ABA 2: SEGURANÇA ZERO-TRUST (IP ALLOWLIST & DISPOSITIVOS CONFIÁVEIS) -->
    <div v-if="activePlatformTab === 'seguranca'" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
      <!-- Card: Restrição por IP -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;">
          <Globe :size="20" style="color: #4f46e5;" />
          <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Restrição de Acesso por Endereço IP</h3>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 1rem;">
          Quando ativada, qualquer tentativa de login ou consulta ao banco fora dos endereços IP listados abaixo é rejeitada diretamente pelo PostgreSQL RLS.
        </p>

        <div style="padding: 0.75rem 1rem; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="font-size: 0.84rem;">
            Seu IP atual detectado:
            <strong style="font-family: monospace; color: #0f172a;">{{ authStore.superAdminContext.ip_atual }}</strong>
          </div>
          <button @click="incluirIpAtualNaLista" type="button" class="btn-secondary-pill" style="padding: 4px 12px; font-size: 0.78rem;">
            + Incluir meu IP atual
          </button>
        </div>

        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; font-size: 0.88rem; margin-bottom: 0.75rem;">
          <input type="checkbox" v-model="formRestringirIp" />
          <span>Exigir que o acesso venha exclusivamente dos IPs abaixo</span>
        </label>

        <div class="form-group">
          <label class="form-label">Lista de IPs Fixos Autorizados (um por linha)</label>
          <textarea
            v-model="formIpsTexto"
            rows="4"
            class="form-textarea"
            style="font-family: monospace; font-size: 0.85rem;"
            placeholder="Ex.:&#10;189.40.12.100&#10;127.0.0.1"
          ></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
          <button @click="salvarPoliticaSeguranca" :disabled="salvandoPolitica" class="btn-primary-pill">
            <CheckCircle :size="16" />
            <span>Salvar Política Zero-Trust</span>
          </button>
        </div>
      </div>

      <!-- Card: Dispositivos Confiáveis -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;">
          <Laptop :size="20" style="color: #059669;" />
          <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Dispositivos Confiáveis (Certificado SHA-256)</h3>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 1rem;">
          Gera um token criptográfico exclusivo neste navegador e grava apenas seu hash SHA-256 no banco. Mesmo com senha e 2FA, navegadores não certificados serão bloqueados se a trava estiver ativa.
        </p>

        <div
          style="padding: 0.75rem 1rem; border-radius: 10px; margin-bottom: 1rem; font-size: 0.84rem; font-weight: 600;"
          :style="{
            background: authStore.superAdminContext.dispositivo_reconhecido ? '#ecfdf5' : '#fffbeb',
            color: authStore.superAdminContext.dispositivo_reconhecido ? '#065f46' : '#92400e',
            border: `1px solid ${authStore.superAdminContext.dispositivo_reconhecido ? '#a7f3d0' : '#fde68a'}`,
          }"
        >
          {{
            authStore.superAdminContext.dispositivo_reconhecido
              ? '🛡️ Este computador/navegador possui certificado ativo de Dispositivo Confiável.'
              : '⚠️ Este navegador ainda não foi certificado como Dispositivo Confiável.'
          }}
        </div>

        <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
          <input
            v-model="nomeNovoDispositivo"
            type="text"
            class="form-input"
            placeholder="Nome da estação (ex: Notebook Diretoria)"
          />
          <button @click="certificarEsteDispositivo" class="btn-secondary-pill" style="white-space: nowrap;">
            <Plus :size="15" />
            <span>Certificar Este PC</span>
          </button>
        </div>

        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; font-size: 0.88rem; margin-bottom: 1rem;">
          <input type="checkbox" v-model="formExigirDispositivo" />
          <span>Bloquear login em computadores sem certificado ativo</span>
        </label>

        <div class="table-container" style="margin-bottom: 1rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Estação</th>
                <th>Último IP</th>
                <th style="text-align: right;">Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="authStore.superAdminDispositivos.length === 0">
                <td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.82rem;">
                  Nenhum dispositivo certificado ainda.
                </td>
              </tr>
              <tr v-for="d in authStore.superAdminDispositivos" :key="d.id">
                <td style="font-weight: 600; font-size: 0.85rem;">{{ d.nome_dispositivo }}</td>
                <td style="font-family: monospace; font-size: 0.8rem;">{{ d.ip_registro || '-' }}</td>
                <td style="text-align: right;">
                  <button
                    @click="revogarDispositivoConfiavel(d.id, d.nome_dispositivo)"
                    class="btn-outline-neutral"
                    style="color: #dc2626 !important; padding: 3px 10px; font-size: 0.76rem;"
                  >
                    <Trash2 :size="13" />
                    <span>Revogar</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <button @click="salvarPoliticaSeguranca" :disabled="salvandoPolitica" class="btn-primary-pill">
            <CheckCircle :size="16" />
            <span>Salvar Política Zero-Trust</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ABA 3: TRILHA DE AUDITORIA IMUTÁVEL -->
    <div v-if="activePlatformTab === 'auditoria'" class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h3 style="font-size: 1.15rem; margin-bottom: 0.2rem;">Trilha Imutável de Auditoria (`log_auditoria`)</h3>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">
            Protegida por trigger de banco de dados contra alteração ou exclusão (`UPDATE`/`DELETE` bloqueados).
          </p>
        </div>
        <button @click="recarregarPainelSeguranca" class="btn-secondary-pill" style="padding: 6px 14px; font-size: 0.8rem;">
          <RefreshCw :size="14" />
          <span>Atualizar Registros</span>
        </button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Evento Auditado</th>
              <th>Ator / Perfil</th>
              <th>Recurso / Escopo</th>
              <th>Endereço IP</th>
              <th>Justificativa / Detalhe</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="authStore.logsAuditoria.length === 0">
              <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                Nenhum evento registrado até o momento.
              </td>
            </tr>
            <tr v-for="log in authStore.logsAuditoria" :key="log.id">
              <td style="font-size: 0.8rem; white-space: nowrap;">
                {{ new Date(log.criado_em).toLocaleString('pt-BR') }}
              </td>
              <td>
                <span class="badge" style="background: #eef2ff; color: #3730a3; font-family: monospace; font-size: 0.75rem;">
                  {{ log.acao }}
                </span>
              </td>
              <td style="font-size: 0.82rem;">
                <div style="font-weight: 600;">{{ log.usuario_id ? log.usuario_id.slice(0, 8) + '...' : 'Sistema / Auth' }}</div>
                <div style="font-size: 0.74rem; color: var(--text-muted);">{{ (log.nivel || 'info').toUpperCase() }}</div>
              </td>
              <td style="font-size: 0.82rem;">{{ log.recurso }}</td>
              <td style="font-family: monospace; font-size: 0.8rem;">{{ log.ip || '-' }}</td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">{{ log.justificativa || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
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

    <!-- MODAL: BREAK-GLASS / ACESSO EMERGENCIAL -->
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
            Você está solicitando acesso temporário (30 minutos) ao ambiente operacional de <strong>{{ selectedTenantParaSuporte.nome_empresa }}</strong>.
            Por conformidade LGPD, o acesso exige justificativa técnica formal que ficará gravada de forma imutável na auditoria.
          </p>

          <div class="form-group">
            <label class="form-label">Justificativa Técnica Obrigatória (mínimo 10 caracteres)</label>
            <textarea
              v-model="justificativaBreakGlass"
              rows="3"
              placeholder="Ex.: Chamado de suporte #48291 - Verificação de conciliação de encomendas"
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
