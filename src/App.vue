<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useEncomendasStore } from './stores/encomendas';
import CookieBanner from './components/CookieBanner.vue';
import PrimeiroAcessoModal from './components/PrimeiroAcessoModal.vue';
import AppDialogModal from './components/AppDialogModal.vue';
import NovaEncomendaModal from './components/NovaEncomendaModal.vue';
import {
  LayoutDashboard,
  PackageOpen,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  Building2,
  UserCheck,
  LogOut,
  PlusCircle,
  AlertOctagon,
  Cookie,
  Loader2,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();

const nomeEmpresaExibicao = computed(() => {
  if (authStore.isSuperAdmin && !authStore.breakGlassTenantId) {
    return 'EncoMed';
  }
  const nome = authStore.currentConfig.nome_sistema || authStore.currentTenant.nome_empresa || 'Minha Drogaria';
  return nome.replace(/\s+SaaS/gi, '').trim();
});

const inicialEmpresa = computed(() => {
  const nome = nomeEmpresaExibicao.value.trim();
  return nome ? nome.charAt(0).toUpperCase() : 'E';
});

const temLogoCustomizado = computed(() => {
  const url = authStore.currentConfig.logo_url;
  return !!url && url !== '/encomed-logo.png' && !url.includes('encomed-logo');
});

const logoEmpresaUrl = computed(() => {
  return authStore.currentConfig.logo_url || '';
});

function abrirGerenciadorCookies() {
  if (typeof window !== 'undefined' && typeof (window as any).abrirGerenciadorCookies === 'function') {
    (window as any).abrirGerenciadorCookies();
  }
}

onMounted(() => {
  authStore.applyTheme();
});

// Atualiza o tema imediatamente sempre que mudar o tenant, o status de Super Admin, Break-Glass ou a rota
watch(
  () => [authStore.activeTenantId, authStore.isSuperAdmin, authStore.breakGlassTenantId, route.path],
  () => {
    authStore.applyTheme();
  }
);

const showLogoutModal = ref(false);
const executandoLogout = ref(false);

function solicitarLogout() {
  showLogoutModal.value = true;
}

function cancelarLogout() {
  if (executandoLogout.value) return;
  showLogoutModal.value = false;
}

async function confirmarLogout() {
  executandoLogout.value = true;
  try {
    await authStore.logout();
  } catch (err) {
    console.warn('[Logout Error]:', err);
  } finally {
    executandoLogout.value = false;
    showLogoutModal.value = false;
    await router.push({ name: 'landing' });
  }
}

async function encerrarSuporteBreakGlass() {
  await authStore.encerrarBreakGlass();
  router.push('/plataforma');
}
</script>

<template>
  <!-- Fullscreen Layout for Public Pages (Login & Landing) -->
  <div v-if="route.name === 'login' || route.name === 'landing'" class="landing-or-login-wrapper">
    <router-view />
  </div>

  <!-- Standard App Layout with Sidebar and Topbar -->
  <div v-else class="app-container">
    <!-- Sidebar Navigation -->
    <aside class="app-sidebar">
      <!-- Sidebar Header: Logotipo & Identidade Visual da Empresa/Drogaria -->
      <div class="sidebar-header">
        <div class="brand-logo-container">
          <!-- Emblema / Monograma Corporativo Farmacêutico -->
          <div class="brand-logo-emblem" :title="nomeEmpresaExibicao">
            <img
              v-if="temLogoCustomizado"
              :src="logoEmpresaUrl"
              :alt="nomeEmpresaExibicao"
              class="brand-custom-img"
            />
            <div v-else class="brand-monogram">
              <span class="monogram-letter">{{ inicialEmpresa }}</span>
              <span class="monogram-dot"></span>
            </div>
          </div>

          <!-- Metadados da Empresa (Nome com destaque de Logo e Tagline) -->
          <div class="brand-info">
            <h2 class="brand-name" :title="nomeEmpresaExibicao">
              {{ nomeEmpresaExibicao }}
            </h2>
            <p class="brand-tagline">
              {{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'Painel de Governança' : (authStore.currentConfig.slogan_sistema || 'Gestão de Encomendas') }}
            </p>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-section-title">Menu</div>

        <template v-if="!authStore.isSuperAdmin || authStore.breakGlassTenantId">
          <router-link to="/" class="nav-link" id="nav-dashboard">
            <span class="nav-icon-box">
              <LayoutDashboard :size="18" />
            </span>
            <span>Início</span>
          </router-link>

          <router-link to="/clientes" class="nav-link" id="nav-clientes">
            <span class="nav-icon-box">
              <Users :size="18" />
            </span>
            <span>Clientes</span>
          </router-link>

          <router-link to="/encomendas" class="nav-link" id="nav-encomendas">
            <span class="nav-icon-box">
              <PackageOpen :size="18" />
            </span>
            <span>Encomendas</span>
            <span
              v-if="encomendasStore.metricas.pendentes > 0"
              class="nav-badge"
              title="Encomendas pendentes"
            >
              {{ encomendasStore.metricas.pendentes }}
            </span>
          </router-link>

          <router-link to="/compras" class="nav-link" id="nav-compras">
            <span class="nav-icon-box">
              <ClipboardList :size="18" />
            </span>
            <span>Pedidos</span>
          </router-link>

          <router-link
            v-if="authStore.isAdmin || authStore.isComprador"
            to="/relatorios"
            class="nav-link"
            id="nav-relatorios"
          >
            <span class="nav-icon-box">
              <BarChart3 :size="18" />
            </span>
            <span>Relatórios</span>
          </router-link>
        </template>

        <router-link
          v-if="authStore.isAdmin && (!authStore.isSuperAdmin || authStore.breakGlassTenantId)"
          to="/configuracoes"
          class="nav-link"
          id="nav-configuracoes"
        >
          <span class="nav-icon-box">
            <Settings :size="18" />
          </span>
          <span>Configurações</span>
        </router-link>

        <router-link
          v-if="authStore.isSuperAdmin"
          to="/plataforma"
          class="nav-link"
          id="nav-plataforma"
        >
          <span class="nav-icon-box">
            <ShieldCheck :size="18" />
          </span>
          <span>Portal da Plataforma</span>
        </router-link>
      </nav>

      <!-- Quick Action: Nova Encomenda button pinned in sidebar -->
      <div v-if="!authStore.isSuperAdmin || authStore.breakGlassTenantId" class="sidebar-quick-action">
        <button
          type="button"
          @click="encomendasStore.abrirModalNovaEncomenda()"
          class="btn-nova-encomenda-sidebar"
          id="btn-sidebar-nova-encomenda"
        >
          <PlusCircle :size="16" />
          <span>Nova Encomenda</span>
        </button>
      </div>

      <!-- Logo do site EncoMed apenas abaixo de Nova Encomenda -->
      <div
        v-if="authStore.currentConfig.visual_opcoes?.exibir_selo_encomed !== false"
        class="sidebar-encomed-seal"
      >
        <img src="/encomed-icon.svg" alt="EncoMed" class="sidebar-encomed-icon" />
        <span class="sidebar-encomed-text">
          <span class="encomed-brand-prefix">Enco</span><span class="encomed-brand-suffix">Med</span>
        </span>
      </div>

      <!-- Active User Profile, Cookie Manager & Logout -->
      <div class="sidebar-footer">
        <div class="user-profile-widget">
          <div class="user-avatar">
            {{ authStore.currentUser.nome.charAt(0) }}
          </div>
          <div class="user-info">
            <span class="user-name">{{ authStore.currentUser.nome }}</span>
            <span class="user-role">{{ authStore.currentUser.perfil === 'super_admin' ? 'Nível IV • 2FA' : authStore.currentUser.perfil }}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <button
            type="button"
            @click="abrirGerenciadorCookies"
            class="btn-footer-tool"
            title="Gerenciar Cookies & Privacidade LGPD"
            id="btn-sidebar-cookies"
          >
            <Cookie :size="15" />
          </button>

          <button
            @click="solicitarLogout"
            class="btn-logout"
            title="Sair do sistema (Logout)"
            id="btn-sidebar-logout"
          >
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="app-main">
      <!-- Banner de Auditoria Break-Glass quando ativo -->
      <div
        v-if="authStore.isSuperAdmin && authStore.breakGlassTenantId"
        style="background: #fef2f2; border-bottom: 1px solid #fecaca; padding: 0.6rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;"
      >
        <div style="display: flex; align-items: center; gap: 0.5rem; color: #991b1b; font-size: 0.84rem; font-weight: 600;">
          <AlertOctagon :size="16" />
          <span>SESSÃO DE SUPORTE AUDITADO (BREAK-GLASS) ATIVA EM: {{ authStore.currentTenant.nome_empresa }}</span>
        </div>
        <button
          @click="encerrarSuporteBreakGlass"
          style="background: #dc2626; color: #ffffff; border: none; border-radius: 9999px; padding: 0.35rem 0.9rem; font-size: 0.78rem; font-weight: 700; cursor: pointer;"
        >
          Encerrar Suporte
        </button>
      </div>

      <!-- Topbar segura (sem seletores de troca de tenant/usuário em produção) -->
      <header class="app-topbar">
        <div class="topbar-left">
          <h1 class="topbar-title">{{ (route.meta?.title as string) || 'Painel' }}</h1>
        </div>

        <div class="topbar-right">
          <div
            style="display: inline-flex; align-items: center; gap: 0.45rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9999px; padding: 0.32rem 0.85rem; font-size: 0.8rem; font-weight: 600; color: #334155;"
          >
            <Building2 :size="14" style="color: var(--color-primary, #2563eb);" />
            <span>{{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'Plano de Controle' : (authStore.currentTenant.nome_empresa || '').replace(/\s+SaaS/gi, '').trim() }}</span>
          </div>

          <div
            style="display: inline-flex; align-items: center; gap: 0.4rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 0.32rem 0.85rem; font-size: 0.78rem; font-weight: 700; color: #047857; text-transform: uppercase;"
          >
            <UserCheck :size="14" />
            <span>{{ authStore.currentUser.perfil === 'super_admin' ? '2FA AAL2 Ativo' : authStore.currentUser.perfil }}</span>
          </div>
        </div>
      </header>

      <!-- View Router View -->
      <main class="page-content">
        <router-view />
      </main>
    </div>
  </div>

  <!-- Modal Obrigatório de Alteração de Senha no Primeiro Acesso -->
  <PrimeiroAcessoModal />

  <!-- Banner Global de Cookies & Privacidade LGPD -->
  <CookieBanner />

  <!-- Pop-up Global de Avisos e Confirmações Personalizado -->
  <AppDialogModal />

  <!-- Pop-up Global de Nova Encomenda -->
  <NovaEncomendaModal />

  <!-- Modal de Confirmação de Saída / Logout Seguro -->
  <transition name="modal-fade">
    <div
      v-if="showLogoutModal"
      class="logout-confirm-backdrop"
      @click.self="cancelarLogout"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
    >
      <div class="logout-confirm-card">
        <div class="logout-confirm-icon-box">
          <LogOut :size="24" />
        </div>

        <h3 id="logout-confirm-title" class="logout-confirm-title">
          Encerrar Sessão da Drogaria?
        </h3>

        <p class="logout-confirm-description">
          Você está prestes a sair do perfil operacional de <strong>{{ nomeEmpresaExibicao }}</strong>. Para acessar o painel de encomendas e estoque novamente, será necessário informar suas credenciais corporativas.
        </p>

        <div class="logout-user-summary">
          <div class="user-avatar-sm">
            {{ authStore.currentUser.nome.charAt(0) }}
          </div>
          <div class="user-summary-text">
            <span class="user-summary-name">{{ authStore.currentUser.nome }}</span>
            <span class="user-summary-sub">{{ authStore.currentTenant.nome_empresa }} &bull; {{ authStore.currentUser.perfil === 'super_admin' ? 'Super Admin' : authStore.currentUser.perfil }}</span>
          </div>
        </div>

        <div class="logout-confirm-actions">
          <button
            type="button"
            @click="cancelarLogout"
            class="btn-logout-cancel"
            :disabled="executandoLogout"
          >
            Cancelar
          </button>

          <button
            type="button"
            @click="confirmarLogout"
            class="btn-logout-confirm"
            :disabled="executandoLogout"
            id="btn-confirmar-logout-modal"
          >
            <Loader2 v-if="executandoLogout" :size="16" class="animate-spin" />
            <LogOut v-else :size="16" />
            <span>{{ executandoLogout ? 'Encerrando...' : 'Confirmar e Sair' }}</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>
