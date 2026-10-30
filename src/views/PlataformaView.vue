<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
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
  Mail,
  Search,
  Pencil,
  Send,
  Loader2,
  Copy,
} from 'lucide-vue-next';
import { gerarHtmlEmailCriarSenha } from '../utils/emailTemplates';

const router = useRouter();
const authStore = useAuthStore();

const activePlatformTab = ref<'tenants' | 'seguranca' | 'auditoria'>('tenants');
const feedbackMsg = ref<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

function notificar(tipo: 'sucesso' | 'erro', texto: string) {
  feedbackMsg.value = { tipo, texto };
  setTimeout(() => {
    if (feedbackMsg.value?.texto === texto) feedbackMsg.value = null;
  }, 6000);
}

// Filtros e Busca de Empresas
const termoBuscaTenant = ref('');
const filtroStatusTenant = ref<'todos' | 'ativo' | 'suspenso'>('todos');

const tenantsFiltrados = computed(() => {
  const busca = termoBuscaTenant.value.trim().toLowerCase();
  return authStore.tenants.filter((t) => {
    if (filtroStatusTenant.value !== 'todos' && t.status !== filtroStatusTenant.value) {
      return false;
    }
    if (!busca) return true;
    const nome = (t.nome_empresa || '').toLowerCase();
    const slug = (t.slug || '').toLowerCase();
    const email = (t.email_admin || '').toLowerCase();
    const dominio = (t.dominio || '').toLowerCase();
    return nome.includes(busca) || slug.includes(busca) || email.includes(busca) || dominio.includes(busca);
  });
});

// Modals
const showNovoTenantModal = ref(false);
const showEditarTenantModal = ref(false);
const showBreakGlassModal = ref(false);
const selectedTenantParaSuporte = ref<Tenant | null>(null);
const justificativaBreakGlass = ref('');

// Form Novo Tenant
const nomeEmpresaNovo = ref('');
const slugNovo = ref('');
const emailAdminNovo = ref('');
const nomeAdminNovo = ref('Administrador');
const planoNovo = ref<'basico' | 'profissional' | 'enterprise'>('profissional');
const limiteNovo = ref(1000);
const salvandoTenant = ref(false);

// Form Edição Tenant
const tenantEmEdicao = ref<Tenant | null>(null);
const nomeEmpresaEdicao = ref('');
const emailAdminEdicao = ref('');
const planoEdicao = ref<'basico' | 'profissional' | 'enterprise'>('profissional');
const limiteEdicao = ref(1000);
const salvandoEdicao = ref(false);

// Loading state para envio de link de senha individual
const enviandoLinkTenantId = ref<string | null>(null);

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
  await authStore.carregarSegurancaSuperAdmin(true);
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
    notificar('erro', 'Preencha o nome da empresa e o identificador único (slug).');
    return;
  }

  salvandoTenant.value = true;
  const limitePorPlano =
    planoNovo.value === 'enterprise' ? 99999 : planoNovo.value === 'profissional' ? 1000 : limiteNovo.value;

  const res = await authStore.provisionarTenant({
    nomeEmpresa: nomeEmpresaNovo.value.trim(),
    slug: slugNovo.value.trim(),
    plano: planoNovo.value,
    limite: limitePorPlano,
    emailAdmin: emailAdminNovo.value.trim() || undefined,
    nomeAdmin: nomeAdminNovo.value.trim() || undefined,
  });

  salvandoTenant.value = false;

  if (res.sucesso) {
    showNovoTenantModal.value = false;
    nomeEmpresaNovo.value = '';
    slugNovo.value = '';
    emailAdminNovo.value = '';
    nomeAdminNovo.value = 'Administrador';
    notificar('sucesso', res.mensagem);
  } else {
    notificar('erro', res.mensagem);
  }
}

function abrirEdicaoTenant(tenant: Tenant) {
  tenantEmEdicao.value = tenant;
  nomeEmpresaEdicao.value = tenant.nome_empresa;
  emailAdminEdicao.value = tenant.email_admin || '';
  planoEdicao.value = tenant.plano;
  limiteEdicao.value = tenant.limite_encomendas_mes;
  showEditarTenantModal.value = true;
}

async function salvarEdicaoTenant() {
  if (!tenantEmEdicao.value || !nomeEmpresaEdicao.value.trim()) {
    notificar('erro', 'Preencha o nome da empresa.');
    return;
  }

  salvandoEdicao.value = true;
  const res = await authStore.atualizarDadosTenant({
    id: tenantEmEdicao.value.id,
    nomeEmpresa: nomeEmpresaEdicao.value.trim(),
    plano: planoEdicao.value,
    limite: limiteEdicao.value,
    emailAdmin: emailAdminEdicao.value.trim() || undefined,
  });
  salvandoEdicao.value = false;

  if (res.sucesso) {
    showEditarTenantModal.value = false;
    tenantEmEdicao.value = null;
    notificar('sucesso', res.mensagem);
  } else {
    notificar('erro', res.mensagem);
  }
}

// Modal de Modelo de E-mail & Configuração de API
const showEmailTemplateModal = ref(false);
const htmlCopiado = ref(false);

const htmlEmailExemplo = computed(() => {
  return gerarHtmlEmailCriarSenha({
    nomeAdmin: 'Carlos Eduardo (Gestor)',
    emailAdmin: 'gestor@drogariaexemplo.com.br',
    nomeEmpresa: 'Drogaria Exemplo Central',
    slugEmpresa: 'drogariaexemplo',
    planoEmpresa: 'Profissional',
    linkCriarSenha: 'https://plataforma.encomed.com.br/login?modo=criar-senha&token=TOKEN_EXEMPLO',
  });
});

async function copiarHtmlEmail() {
  try {
    await navigator.clipboard.writeText(htmlEmailExemplo.value);
    htmlCopiado.value = true;
    setTimeout(() => {
      htmlCopiado.value = false;
    }, 3500);
  } catch {
    notificar('erro', 'Não foi possível copiar o HTML para a área de transferência.');
  }
}

async function enviarLinkSenha(tenant: Tenant) {
  if (!tenant.email_admin) {
    notificar('erro', `A empresa "${tenant.nome_empresa}" não possui e-mail cadastrado. Clique em Editar para cadastrar.`);
    return;
  }

  enviandoLinkTenantId.value = tenant.id;
  const res = await authStore.enviarLinkSenhaTenant(tenant.email_admin, tenant.nome_empresa, {
    nomeAdmin: 'Administrador',
    slug: tenant.slug,
    plano: tenant.plano,
  });
  enviandoLinkTenantId.value = null;

  notificar(res.sucesso ? 'sucesso' : 'erro', res.mensagem);
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
    <!-- Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div style="width: 38px; height: 38px; border-radius: 12px; background: #e0e7ff; display: flex; align-items: center; justify-content: center; color: #4338ca; border: 1.5px solid #c7d2fe;">
            <ShieldCheck :size="22" />
          </div>
          <div>
            <h2 style="font-size: 1.55rem; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.2;">
              Governança SaaS & Empresas
            </h2>
            <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0.2rem 0 0 0;">
              Painel exclusivo do Super Administrador • Provisionamento com envio de link de senha por e-mail • Zero-Trust
            </p>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
        <button
          @click="showEmailTemplateModal = true"
          class="btn-outline-neutral"
          id="btn-modelo-email-api"
          style="padding: 0.52rem 1.15rem; font-size: 0.85rem;"
          title="Ver o modelo de e-mail corporativo de boas-vindas e como configurar uma API de e-mail 100% gratuita"
        >
          <Mail :size="16" />
          <span>Modelo de E-mail & API</span>
        </button>

        <button
          v-if="activePlatformTab === 'tenants'"
          @click="showNovoTenantModal = true"
          class="btn-primary-pill"
          id="btn-novo-tenant"
          style="padding: 0.55rem 1.4rem; font-size: 0.88rem;"
        >
          <Plus :size="18" />
          <span>Provisionar Nova Empresa</span>
        </button>
      </div>
    </div>

    <!-- Feedback Toast -->
    <div
      v-if="feedbackMsg"
      :style="{
        marginBottom: '1.25rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '9999px',
        fontSize: '0.86rem',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        background: feedbackMsg.tipo === 'sucesso' ? '#ecfdf5' : '#fef2f2',
        color: feedbackMsg.tipo === 'sucesso' ? '#065f46' : '#991b1b',
        border: `1.5px solid ${feedbackMsg.tipo === 'sucesso' ? '#a7f3d0' : '#fecaca'}`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
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
        style="display: inline-flex; align-items: center; gap: 7px;"
      >
        <Building2 :size="16" />
        <span>Empresas / Lojas ({{ authStore.tenants.length }})</span>
      </button>

      <button
        @click="activePlatformTab = 'seguranca'; recarregarPainelSeguranca()"
        class="sub-tab-btn"
        :class="{ active: activePlatformTab === 'seguranca' }"
        style="display: inline-flex; align-items: center; gap: 7px;"
      >
        <Lock :size="16" />
        <span>Proteções da Conta (IP & Dispositivos)</span>
      </button>

      <button
        @click="activePlatformTab = 'auditoria'; recarregarPainelSeguranca()"
        class="sub-tab-btn"
        :class="{ active: activePlatformTab === 'auditoria' }"
        style="display: inline-flex; align-items: center; gap: 7px;"
      >
        <FileText :size="16" />
        <span>Auditoria Imutável de Acessos</span>
      </button>
    </div>

    <!-- ============================================================== -->
    <!-- ABA 1: EMPRESAS / TENANTS (PADRÃO FARMÁCIA & HORIZONTAL CARDS) -->
    <!-- ============================================================== -->
    <div v-if="activePlatformTab === 'tenants'">
      <!-- Stat Cards -->
      <div class="stat-grid" style="margin-bottom: 1.25rem;">
        <div class="stat-card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
          <div class="stat-info">
            <div class="stat-label">Total de Empresas</div>
            <div class="stat-value" style="color: #0f172a;">
              {{ authStore.tenants.length }}
            </div>
          </div>
          <div class="stat-icon" style="background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;">
            <Building2 :size="22" />
          </div>
        </div>

        <div class="stat-card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
          <div class="stat-info">
            <div class="stat-label">Empresas Ativas</div>
            <div class="stat-value" style="color: #16a34a;">
              {{ authStore.tenants.filter((t) => t.status === 'ativo').length }}
            </div>
          </div>
          <div class="stat-icon" style="background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0;">
            <CheckCircle :size="22" />
          </div>
        </div>

        <div class="stat-card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
          <div class="stat-info">
            <div class="stat-label">Empresas Suspensas</div>
            <div class="stat-value" style="color: #dc2626;">
              {{ authStore.tenants.filter((t) => t.status === 'suspenso').length }}
            </div>
          </div>
          <div class="stat-icon" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">
            <PauseCircle :size="22" />
          </div>
        </div>
      </div>

      <!-- Barra de Filtro e Busca -->
      <div class="pedidos-filter-toolbar" style="margin-bottom: 1.25rem; border: 1.5px solid var(--border-color);">
        <div style="position: relative; flex: 1; min-width: 260px;">
          <Search :size="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8;" />
          <input
            v-model="termoBuscaTenant"
            type="text"
            placeholder="Buscar empresa por nome, subdomínio (slug) ou e-mail do gestor..."
            class="form-input"
            style="padding-left: 2.4rem; height: 40px; border: 1.5px solid var(--border-color); border-radius: 12px; font-size: 0.85rem;"
          />
        </div>

        <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
          <button
            type="button"
            @click="filtroStatusTenant = 'todos'"
            class="btn-outline-neutral"
            :style="{
              background: filtroStatusTenant === 'todos' ? '#2563eb' : '#ffffff',
              color: filtroStatusTenant === 'todos' ? '#ffffff' : '#334155',
              borderColor: filtroStatusTenant === 'todos' ? '#2563eb' : '#cbd5e1',
            }"
            style="padding: 0.35rem 0.9rem; font-size: 0.8rem;"
          >
            Todas ({{ authStore.tenants.length }})
          </button>
          <button
            type="button"
            @click="filtroStatusTenant = 'ativo'"
            class="btn-outline-neutral"
            :style="{
              background: filtroStatusTenant === 'ativo' ? '#16a34a' : '#ffffff',
              color: filtroStatusTenant === 'ativo' ? '#ffffff' : '#334155',
              borderColor: filtroStatusTenant === 'ativo' ? '#16a34a' : '#cbd5e1',
            }"
            style="padding: 0.35rem 0.9rem; font-size: 0.8rem;"
          >
            Ativas ({{ authStore.tenants.filter((t) => t.status === 'ativo').length }})
          </button>
          <button
            type="button"
            @click="filtroStatusTenant = 'suspenso'"
            class="btn-outline-neutral"
            :style="{
              background: filtroStatusTenant === 'suspenso' ? '#dc2626' : '#ffffff',
              color: filtroStatusTenant === 'suspenso' ? '#ffffff' : '#334155',
              borderColor: filtroStatusTenant === 'suspenso' ? '#dc2626' : '#cbd5e1',
            }"
            style="padding: 0.35rem 0.9rem; font-size: 0.8rem;"
          >
            Suspensas ({{ authStore.tenants.filter((t) => t.status === 'suspenso').length }})
          </button>
        </div>
      </div>

      <!-- Lista de Cards Horizontais de Empresas -->
      <div v-if="tenantsFiltrados.length === 0" class="card" style="text-align: center; padding: 2.5rem 1rem; border: 1.5px solid var(--border-color);">
        <Building2 :size="36" style="margin: 0 auto 0.75rem auto; color: #94a3b8;" />
        <h4 style="font-size: 1.05rem; font-weight: 700; color: #334155; margin-bottom: 0.3rem;">
          Nenhuma empresa encontrada
        </h4>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">
          Tente ajustar os filtros ou clique em "Provisionar Nova Empresa" para cadastrar.
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
        <div
          v-for="t in tenantsFiltrados"
          :key="t.id"
          class="pedido-item-card"
          style="
            background: #ffffff;
            border: 1.5px solid var(--border-color);
            border-radius: 16px;
            padding: 1.15rem 1.4rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1.25rem;
            flex-wrap: wrap;
          "
        >
          <!-- Lado Esquerdo: Identificação, Subdomínio, E-mail do Admin e Metadados -->
          <div style="display: flex; align-items: flex-start; gap: 1rem; min-width: 320px; flex: 1;">
            <div
              style="
                width: 46px;
                height: 46px;
                border-radius: 14px;
                background: #eff6ff;
                border: 1.5px solid #bfdbfe;
                color: #2563eb;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                margin-top: 2px;
              "
            >
              <Building2 :size="22" />
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.35rem; flex: 1;">
              <!-- Linha 1: Nome da Empresa + Status -->
              <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
                <h3 style="font-size: 1.08rem; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.2;">
                  {{ t.nome_empresa }}
                </h3>

                <span
                  class="badge"
                  :style="{
                    background: t.status === 'ativo' ? '#ecfdf5' : '#fef2f2',
                    color: t.status === 'ativo' ? '#065f46' : '#991b1b',
                    borderColor: t.status === 'ativo' ? '#a7f3d0' : '#fecaca',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    padding: '2px 9px',
                  }"
                >
                  {{ t.status.toUpperCase() }}
                </span>
              </div>

              <!-- Linha 2: E-mail do Administrador (com destaque visual e botão) -->
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 2px;">
                <div
                  v-if="t.email_admin"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 3px 10px;
                    background: #f0f9ff;
                    border: 1px solid #bae6fd;
                    border-radius: 9999px;
                    font-size: 0.78rem;
                    color: #0369a1;
                    font-weight: 600;
                  "
                  title="E-mail corporativo do gestor para receber o link de primeiro acesso e senha"
                >
                  <Mail :size="13" />
                  <span>{{ t.email_admin }}</span>
                </div>

                <div
                  v-else
                  @click="abrirEdicaoTenant(t)"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 3px 10px;
                    background: #fffbeb;
                    border: 1px solid #fde68a;
                    border-radius: 9999px;
                    font-size: 0.76rem;
                    color: #b45309;
                    font-weight: 600;
                    cursor: pointer;
                  "
                  title="Clique para cadastrar o e-mail do administrador desta empresa"
                >
                  <span>⚠️ Sem e-mail cadastrado (clique para definir)</span>
                </div>

                <div
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 3px 9px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 9999px;
                    font-size: 0.76rem;
                    color: #475569;
                    font-family: monospace;
                  "
                >
                  <Globe :size="12" />
                  <span>{{ t.slug }}.plataforma.com.br</span>
                </div>
              </div>

              <!-- Linha 3: Metadados do Plano e Limite -->
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 3px; font-size: 0.76rem; color: #64748b;">
                <span
                  style="
                    display: inline-flex;
                    padding: 2px 8px;
                    background: #f1f5f9;
                    border-radius: 6px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    color: #334155;
                  "
                >
                  Plano {{ t.plano }}
                </span>
                <span>•</span>
                <span>Limite: <strong>{{ t.limite_encomendas_mes }} encomendas/mês</strong></span>
              </div>
            </div>
          </div>

          <!-- Lado Direito: Ações em Botões em Pílula (rounded-full) -->
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end;">
            <!-- Botão Enviar Link de Senha -->
            <button
              v-if="t.email_admin"
              type="button"
              @click="enviarLinkSenha(t)"
              :disabled="enviandoLinkTenantId === t.id"
              class="btn-outline-neutral"
              style="padding: 0.42rem 0.95rem; font-size: 0.79rem; border-color: #bfdbfe; color: #1d4ed8; background: #eff6ff;"
              title="Disparar e-mail com link seguro para o gestor definir ou recuperar sua senha de acesso"
            >
              <Loader2 v-if="enviandoLinkTenantId === t.id" class="animate-spin" :size="14" />
              <Send v-else :size="14" />
              <span>{{ enviandoLinkTenantId === t.id ? 'Enviando...' : 'Enviar Link de Senha' }}</span>
            </button>

            <!-- Botão Editar Dados -->
            <button
              type="button"
              @click="abrirEdicaoTenant(t)"
              class="btn-outline-neutral"
              style="padding: 0.42rem 0.85rem; font-size: 0.79rem;"
              title="Editar nome da loja, e-mail do gestor ou plano contratado"
            >
              <Pencil :size="13" />
              <span>Editar</span>
            </button>

            <!-- Botão Suporte Auditado (Break-Glass) -->
            <button
              type="button"
              @click="abrirBreakGlass(t)"
              class="btn-outline-neutral"
              style="padding: 0.42rem 0.85rem; font-size: 0.79rem; border-color: #cbd5e1;"
              title="Acesso emergencial auditado com justificativa técnica LGPD (30 minutos)"
            >
              <KeyRound :size="13" />
              <span>Suporte Auditado</span>
            </button>

            <!-- Botão Suspender / Ativar -->
            <button
              type="button"
              @click="alternarStatusTenant(t)"
              class="btn-outline-neutral"
              style="padding: 0.42rem 0.85rem; font-size: 0.79rem;"
              :style="{
                color: t.status === 'ativo' ? '#dc2626 !important' : '#16a34a !important',
                borderColor: t.status === 'ativo' ? '#fca5a5' : '#86efac',
                background: t.status === 'ativo' ? '#fef2f2' : '#f0fdf4',
              }"
            >
              <PauseCircle v-if="t.status === 'ativo'" :size="13" />
              <PlayCircle v-else :size="13" />
              <span>{{ t.status === 'ativo' ? 'Suspender' : 'Ativar' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- ABA 2: SEGURANÇA ZERO-TRUST (IP ALLOWLIST & DISPOSITIVOS)       -->
    <!-- ============================================================== -->
    <div v-if="activePlatformTab === 'seguranca'" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
      <!-- Card: Restrição por IP -->
      <div class="card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;">
          <Globe :size="20" style="color: #4f46e5;" />
          <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Restrição de Acesso por Endereço IP</h3>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 1rem;">
          Quando ativada, qualquer tentativa de login ou consulta fora dos endereços IP listados abaixo é rejeitada diretamente pelo PostgreSQL RLS.
        </p>

        <div style="padding: 0.75rem 1rem; border-radius: 12px; background: #f8fafc; border: 1.5px solid #e2e8f0; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
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
            style="font-family: monospace; font-size: 0.85rem; border: 1.5px solid var(--border-color); border-radius: 12px;"
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
      <div class="card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;">
          <Laptop :size="20" style="color: #059669;" />
          <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Dispositivos Confiáveis (Certificado SHA-256)</h3>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 1rem;">
          Gera um token criptográfico exclusivo neste navegador e grava apenas seu hash SHA-256 no banco. Mesmo com senha e 2FA, navegadores não certificados serão bloqueados.
        </p>

        <div
          style="padding: 0.75rem 1rem; border-radius: 12px; margin-bottom: 1rem; font-size: 0.84rem; font-weight: 600;"
          :style="{
            background: authStore.superAdminContext.dispositivo_reconhecido ? '#ecfdf5' : '#fffbeb',
            color: authStore.superAdminContext.dispositivo_reconhecido ? '#065f46' : '#92400e',
            border: `1.5px solid ${authStore.superAdminContext.dispositivo_reconhecido ? '#a7f3d0' : '#fde68a'}`,
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
            style="border: 1.5px solid var(--border-color); border-radius: 12px;"
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

        <div class="table-container" style="margin-bottom: 1rem; border: 1.5px solid var(--border-color); border-radius: 12px;">
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
                <td colspan="3" style="text-align: center; padding: 1.25rem; color: var(--text-muted); font-size: 0.82rem;">
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

    <!-- ============================================================== -->
    <!-- ABA 3: TRILHA DE AUDITORIA IMUTÁVEL                             -->
    <!-- ============================================================== -->
    <div v-if="activePlatformTab === 'auditoria'" class="card" style="border: 1.5px solid var(--border-color); border-radius: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h3 style="font-size: 1.15rem; margin-bottom: 0.2rem; font-weight: 800;">Trilha Imutável de Auditoria (`log_auditoria`)</h3>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">
            Protegida por trigger de banco de dados contra alteração ou exclusão (`UPDATE`/`DELETE` bloqueados).
          </p>
        </div>
        <button @click="recarregarPainelSeguranca" class="btn-secondary-pill" style="padding: 6px 14px; font-size: 0.8rem;">
          <RefreshCw :size="14" />
          <span>Atualizar Registros</span>
        </button>
      </div>

      <div class="table-container" style="border: 1.5px solid var(--border-color); border-radius: 12px;">
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
                <span class="badge" style="background: #eef2ff; color: #3730a3; font-family: monospace; font-size: 0.75rem; border: 1px solid #c7d2fe;">
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

    <!-- ============================================================== -->
    <!-- MODAL: PROVISIONAR NOVA EMPRESA / FARMÁCIA                     -->
    <!-- ============================================================== -->
    <div v-if="showNovoTenantModal" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 520px; border: 1.5px solid var(--border-color); border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; border: 1px solid #bfdbfe;">
              <Building2 :size="18" />
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0;">
                Provisionar Nova Empresa
              </h3>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
                Configure o tenant e envie o link de senha diretamente para o gestor
              </p>
            </div>
          </div>
          <button @click="showNovoTenantModal = false" style="background: none; border: none; cursor: pointer; color: #94a3b8;">
            <X :size="20" />
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div class="form-group">
            <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Nome da Empresa / Farmácia *</label>
            <input
              v-model="nomeEmpresaNovo"
              type="text"
              placeholder="Ex.: Drogaria São Paulo - Filial Centro"
              class="form-input"
              style="border: 1.5px solid var(--border-color); border-radius: 12px;"
            />
          </div>

          <div class="form-group">
            <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Identificador Único (Slug de Subdomínio) *</label>
            <input
              v-model="slugNovo"
              type="text"
              placeholder="Ex.: drosaopaulo"
              class="form-input"
              style="font-family: monospace; border: 1.5px solid var(--border-color); border-radius: 12px;"
            />
            <small style="color: var(--text-muted); font-size: 0.74rem;">Ficará acessível como: <strong>{{ slugNovo ? slugNovo.toLowerCase() : 'slug' }}.plataforma.com.br</strong></small>
          </div>

          <!-- Campo Principal: E-mail do Administrador da Loja -->
          <div class="form-group" style="background: #f0fdf4; border: 1.5px solid #a7f3d0; padding: 0.75rem 0.9rem; border-radius: 14px;">
            <label class="form-label" style="font-weight: 800; font-size: 0.82rem; color: #065f46; display: flex; align-items: center; gap: 5px;">
              <Mail :size="14" />
              <span>E-mail do Administrador / Gestor da Empresa *</span>
            </label>
            <input
              v-model="emailAdminNovo"
              type="email"
              placeholder="gestor@drogariaexemplo.com.br"
              class="form-input"
              style="border: 1.5px solid #86efac; border-radius: 10px; background: #ffffff;"
            />
            <p style="font-size: 0.75rem; color: #166534; margin: 0.4rem 0 0 0; line-height: 1.35;">
              ✉️ <strong>Envio Automático:</strong> Um link seguro será enviado para este e-mail para que o gestor defina sua senha no primeiro acesso.
            </p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Plano de Assinatura</label>
              <select v-model="planoNovo" class="form-select" style="border: 1.5px solid var(--border-color); border-radius: 12px;">
                <option value="basico">Básico (Até 300 enc./mês)</option>
                <option value="profissional">Profissional (Até 1.000 enc./mês)</option>
                <option value="enterprise">Enterprise (Ilimitado)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Limite Mensal</label>
              <input
                v-model.number="limiteNovo"
                type="number"
                min="50"
                class="form-input"
                style="border: 1.5px solid var(--border-color); border-radius: 12px;"
              />
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.5rem; border-top: 1px solid #f1f5f9; padding-top: 1rem;">
          <button @click="showNovoTenantModal = false" class="btn-outline-neutral" style="padding: 0.5rem 1.2rem;">
            Cancelar
          </button>
          <button
            @click="salvarNovoTenant"
            :disabled="salvandoTenant"
            class="btn-primary-pill"
            id="btn-salvar-tenant"
            style="padding: 0.5rem 1.4rem;"
          >
            <Loader2 v-if="salvandoTenant" class="animate-spin" :size="16" />
            <Send v-else :size="16" />
            <span>{{ salvandoTenant ? 'Provisionando...' : 'Provisionar e Enviar Link' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL: EDITAR EMPRESA & E-MAIL DO GESTOR                       -->
    <!-- ============================================================== -->
    <div v-if="showEditarTenantModal && tenantEmEdicao" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 500px; border: 1.5px solid var(--border-color); border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; border: 1px solid #bfdbfe;">
              <Pencil :size="18" />
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0;">
                Editar Empresa: {{ tenantEmEdicao.nome_empresa }}
              </h3>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
                Atualize o cadastro e o e-mail do gestor responsável
              </p>
            </div>
          </div>
          <button @click="showEditarTenantModal = false" style="background: none; border: none; cursor: pointer; color: #94a3b8;">
            <X :size="20" />
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div class="form-group">
            <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Nome da Empresa</label>
            <input
              v-model="nomeEmpresaEdicao"
              type="text"
              class="form-input"
              style="border: 1.5px solid var(--border-color); border-radius: 12px;"
            />
          </div>

          <div class="form-group" style="background: #f0fdf4; border: 1.5px solid #a7f3d0; padding: 0.75rem 0.9rem; border-radius: 14px;">
            <label class="form-label" style="font-weight: 800; font-size: 0.82rem; color: #065f46; display: flex; align-items: center; gap: 5px;">
              <Mail :size="14" />
              <span>E-mail do Administrador / Gestor</span>
            </label>
            <input
              v-model="emailAdminEdicao"
              type="email"
              placeholder="gestor@empresa.com.br"
              class="form-input"
              style="border: 1.5px solid #86efac; border-radius: 10px; background: #ffffff;"
            />
            <p style="font-size: 0.74rem; color: #166534; margin: 0.4rem 0 0 0;">
              Ao atualizar o e-mail, você poderá reenviar o link de definição de senha a qualquer momento no card da loja.
            </p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Plano de Assinatura</label>
              <select v-model="planoEdicao" class="form-select" style="border: 1.5px solid var(--border-color); border-radius: 12px;">
                <option value="basico">Básico</option>
                <option value="profissional">Profissional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Limite Mensal</label>
              <input
                v-model.number="limiteEdicao"
                type="number"
                min="50"
                class="form-input"
                style="border: 1.5px solid var(--border-color); border-radius: 12px;"
              />
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.5rem; border-top: 1px solid #f1f5f9; padding-top: 1rem;">
          <button @click="showEditarTenantModal = false" class="btn-outline-neutral" style="padding: 0.5rem 1.2rem;">
            Cancelar
          </button>
          <button
            @click="salvarEdicaoTenant"
            :disabled="salvandoEdicao"
            class="btn-primary-pill"
            style="padding: 0.5rem 1.4rem;"
          >
            <Loader2 v-if="salvandoEdicao" class="animate-spin" :size="16" />
            <CheckCircle v-else :size="16" />
            <span>{{ salvandoEdicao ? 'Salvando...' : 'Salvar Alterações' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL: BREAK-GLASS / ACESSO EMERGENCIAL                        -->
    <!-- ============================================================== -->
    <div v-if="showBreakGlassModal && selectedTenantParaSuporte" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 480px; border: 1.5px solid #fca5a5; border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; color: #dc2626;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #fee2e2; display: flex; align-items: center; justify-content: center;">
              <AlertOctagon :size="20" />
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0;">Acesso Emergencial (Break-Glass)</h3>
          </div>
          <button @click="showBreakGlassModal = false" style="background: none; border: none; cursor: pointer; color: #94a3b8;">
            <X :size="20" />
          </button>
        </div>

        <div>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.4;">
            Você está solicitando acesso temporário (30 minutos) ao ambiente operacional de <strong>{{ selectedTenantParaSuporte.nome_empresa }}</strong>.
            Por conformidade LGPD, o acesso exige justificativa técnica formal gravada de forma imutável na auditoria.
          </p>

          <div class="form-group">
            <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Justificativa Técnica Obrigatória (mínimo 10 caracteres)</label>
            <textarea
              v-model="justificativaBreakGlass"
              rows="3"
              placeholder="Ex.: Chamado de suporte técnico #48291 - Verificação de estoque e conciliação"
              class="form-textarea"
              style="border: 1.5px solid var(--border-color); border-radius: 12px;"
            ></textarea>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.5rem; border-top: 1px solid #f1f5f9; padding-top: 1rem;">
          <button @click="showBreakGlassModal = false" class="btn-outline-neutral" style="padding: 0.5rem 1.2rem;">
            Cancelar
          </button>
          <button @click="confirmarBreakGlass" class="btn-primary-pill" style="background-color: #dc2626 !important; border-color: #dc2626 !important; padding: 0.5rem 1.4rem;" id="btn-confirmar-break-glass">
            Confirmar Acesso Auditado
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL: MODELO DE E-MAIL "CRIAR SENHA" & GUIA API GRATUITA     -->
    <!-- ============================================================== -->
    <div v-if="showEmailTemplateModal" class="modal-backdrop">
      <div class="base44-modal-dialog" style="max-width: 680px; max-height: 90vh; overflow-y: auto; border: 1.5px solid var(--border-color); border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; position: sticky; top: 0; background: #ffffff; z-index: 2; padding-bottom: 0.5rem; border-bottom: 1px solid #f1f5f9;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; border: 1px solid #bfdbfe;">
              <Mail :size="18" />
            </div>
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0;">
                Modelo de E-mail de Boas-Vindas & API
              </h3>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
                Template responsivo de criação de senha + guia de ativação de API gratuita
              </p>
            </div>
          </div>
          <button @click="showEmailTemplateModal = false" style="background: none; border: none; cursor: pointer; color: #94a3b8;">
            <X :size="20" />
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1.1rem;">
          <!-- Card de Como Funciona o Disparo -->
          <div style="padding: 0.85rem 1rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 0.82rem; line-height: 1.5; color: #334155;">
            💡 <strong>Envio Automático:</strong> Toda vez que você provisiona uma nova empresa ou clica em <em>"Enviar Link de Senha"</em>, o sistema gera um token seguro e despacha este e-mail corporativo para o endereço do gestor.
          </div>

          <!-- Preview em Miniatura do E-mail -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; font-size: 0.85rem; color: #0f172a;">
                Pré-visualização do E-mail Renderizado:
              </span>
              <button
                type="button"
                @click="copiarHtmlEmail"
                class="btn-outline-neutral"
                style="padding: 4px 12px; font-size: 0.76rem;"
                title="Copiar código HTML completo para colar em Authentication > Email Templates do Supabase"
              >
                <CheckCircle v-if="htmlCopiado" :size="13" style="color: #16a34a;" />
                <Copy v-else :size="13" />
                <span>{{ htmlCopiado ? 'HTML Copiado!' : 'Copiar Código HTML' }}</span>
              </button>
            </div>

            <!-- iframe sandbox: o <style> do e-mail fica ISOLADO e não restiliza o sistema; scripts bloqueados -->
            <iframe
              :srcdoc="htmlEmailExemplo"
              sandbox=""
              title="Pré-visualização do e-mail de criação de senha"
              loading="lazy"
              referrerpolicy="no-referrer"
              style="width: 100%; height: 420px; border: 1.5px solid #cbd5e1; border-radius: 14px; background: #f1f5f9;"
            ></iframe>
          </div>

          <!-- Resumo de Configuração de API de E-mail Gratuita -->
          <div style="padding: 1rem; border-radius: 14px; background: #f0fdf4; border: 1.5px solid #a7f3d0; font-size: 0.82rem; color: #166534; line-height: 1.5;">
            <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.35rem; color: #065f46;">
              🚀 Como Ativar uma API de E-mail 100% Gratuita:
            </div>
            <p style="margin: 0 0 0.5rem 0;">
              O sistema já está programado para integrar nativamente com <strong>Brevo (Sendinblue)</strong> ou <strong>Resend</strong> sem custos:
            </p>
            <ol style="margin: 0; padding-left: 1.25rem;">
              <li><strong>Brevo (300 e-mails/dia grátis):</strong> Crie conta em <em>brevo.com</em> &gt; <em>SMTP & API</em> &gt; gere uma chave e adicione <code>BREVO_API_KEY</code> nas variáveis do servidor.</li>
              <li><strong>Resend (3.000 e-mails/mês grátis):</strong> Crie conta em <em>resend.com</em> &gt; <em>API Keys</em> &gt; adicione <code>RESEND_API_KEY</code>.</li>
              <li><strong>Supabase Auth SMTP:</strong> No Supabase &gt; <em>Project Settings</em> &gt; <em>Authentication</em> &gt; <em>SMTP</em>, insira o servidor e usuário do Brevo para que todos os disparos ocorram com entregabilidade máxima.</li>
            </ol>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1.25rem; border-top: 1px solid #f1f5f9; padding-top: 0.9rem;">
          <button @click="showEmailTemplateModal = false" class="btn-primary-pill" style="padding: 0.48rem 1.4rem;">
            Fechar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
