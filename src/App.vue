<script setup lang="ts">
import { onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useEncomendasStore } from './stores/encomendas';
import CookieBanner from './components/CookieBanner.vue';
import PrimeiroAcessoModal from './components/PrimeiroAcessoModal.vue';
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

async function handleLogout() {
  await authStore.logout();
  router.push({ name: 'landing' });
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
      <!-- Sidebar Header: Nome da Empresa com destaque elegante, sem logo em cima -->
      <div class="sidebar-header" style="padding: 1.15rem 1.25rem; display: flex; flex-direction: column; justify-content: center; min-height: 64px;">
        <div class="tenant-meta" style="width: 100%;">
          <div
            class="brand-title"
            :title="nomeEmpresaExibicao"
            style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); font-family: var(--font-heading); line-height: 1.3; white-space: normal; word-break: break-word;"
          >
            {{ nomeEmpresaExibicao }}
          </div>
          <div
            class="brand-plan"
            style="font-size: 0.76rem; color: var(--text-muted); font-weight: 500; margin-top: 3px;"
          >
            {{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'Painel de Governança' : (authStore.currentConfig.slogan_sistema || 'Gestão de Encomendas') }}
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
        <router-link
          to="/nova-encomenda"
          class="btn-nova-encomenda-sidebar"
          id="btn-sidebar-nova-encomenda"
        >
          <PlusCircle :size="16" />
          <span>Nova Encomenda</span>
        </router-link>
      </div>

      <!-- Logo do site EncoMed apenas abaixo de Nova Encomenda -->
      <div
        v-if="authStore.currentConfig.visual_opcoes?.exibir_selo_encomed !== false"
        style="padding: 0.65rem 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.45rem; border-top: 1px solid var(--border-color);"
      >
        <img src="/encomed-icon.svg" alt="EncoMed" style="height: 18px; width: 18px; object-fit: contain; background: transparent;" />
        <span style="font-family: var(--font-heading); font-size: 0.88rem; font-weight: 800; letter-spacing: -0.01em;">
          <span style="color: var(--text-main);">Enco</span><span style="color: var(--color-primary, #2563eb);">Med</span>
        </span>
      </div>

      <!-- Active User Profile & Role Indicator -->
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

        <button
          @click="handleLogout"
          class="btn-logout"
          title="Sair do sistema (Logout)"
          id="btn-sidebar-logout"
        >
          <LogOut :size="16" />
        </button>
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
</template>
