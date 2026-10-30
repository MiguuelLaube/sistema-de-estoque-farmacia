<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useEncomendasStore } from './stores/encomendas';
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
  ExternalLink,
  AlertOctagon,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();

onMounted(() => {
  authStore.applyTheme();
});

watch(
  () => authStore.activeTenantId,
  () => {
    authStore.applyTheme();
  }
);

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
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
      <div class="sidebar-header" style="align-items: center; gap: 0.75rem;">
        <img
          :src="authStore.currentConfig.logo_url || '/encomed-logo.png'"
          :alt="authStore.currentConfig.nome_sistema || 'EncoMed Logo'"
          :style="{
            height: '40px',
            width: authStore.currentConfig.visual_opcoes?.formato_logo === 'quadrado' || authStore.currentConfig.visual_opcoes?.formato_logo === 'circular' ? '40px' : 'auto',
            maxWidth: '92px',
            objectFit: authStore.currentConfig.visual_opcoes?.formato_logo === 'circular' ? 'cover' : 'contain',
            borderRadius: authStore.currentConfig.visual_opcoes?.formato_logo === 'circular' ? '50%' : '8px',
            flexShrink: 0,
            background: '#ffffff',
            padding: '2px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
          }"
        />
        <div class="tenant-meta" style="min-width: 0;">
          <span class="brand-title" :title="authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'EncoMed SaaS' : authStore.currentConfig.nome_sistema">
            {{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'EncoMed SaaS' : authStore.currentConfig.nome_sistema }}
          </span>
          <span class="brand-plan" style="color: #64748b; font-size: 0.75rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            {{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'Painel de Governança' : (authStore.currentConfig.slogan_sistema || 'Gestão de Encomendas') }}
          </span>
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

        <router-link
          to="/apresentacao"
          class="nav-link"
          id="nav-apresentacao"
          title="Ver página de apresentação do sistema"
        >
          <span class="nav-icon-box">
            <ExternalLink :size="18" />
          </span>
          <span>Apresentação SaaS</span>
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

      <!-- Selo institucional opcional Powered by EncoMed -->
      <div
        v-if="authStore.currentConfig.visual_opcoes?.exibir_selo_encomed !== false"
        style="padding: 0.45rem 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.7rem; opacity: 0.78; border-top: 1px solid var(--border-color);"
      >
        <img src="/encomed-logo.png" alt="EncoMed" style="height: 15px; width: auto; object-fit: contain; border-radius: 3px; background: #fff; padding: 1px;" />
        <span>Tecnologia <strong>EncoMed SaaS</strong></span>
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
            <Building2 :size="14" style="color: #2563eb;" />
            <span>{{ authStore.isSuperAdmin && !authStore.breakGlassTenantId ? 'Plano de Controle SaaS' : authStore.currentTenant.nome_empresa }}</span>
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
</template>
