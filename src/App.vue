<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useEncomendasStore } from './stores/encomendas';
import {
  LayoutDashboard,
  PackageOpen,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  Building2,
  UserCheck,
} from 'lucide-vue-next';

const route = useRoute();
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
</script>

<template>
  <div class="app-container">
    <!-- Sidebar Navigation -->
    <aside class="app-sidebar">
      <div class="sidebar-header">
        <div class="tenant-logo-badge">
          {{ authStore.currentConfig.nome_sistema.charAt(0) }}
        </div>
        <div class="tenant-meta">
          <span class="brand-title" :title="authStore.currentConfig.nome_sistema">
            {{ authStore.currentConfig.nome_sistema }}
          </span>
          <span class="brand-plan">
            Plano {{ authStore.currentTenant.plano }}
          </span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <router-link to="/" class="nav-link" id="nav-dashboard">
          <LayoutDashboard :size="18" />
          <span>Início</span>
        </router-link>

        <router-link to="/encomendas" class="nav-link" id="nav-encomendas">
          <PackageOpen :size="18" />
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
          <ShoppingCart :size="18" />
          <span>Lista de Compras</span>
        </router-link>

        <router-link to="/clientes" class="nav-link" id="nav-clientes">
          <Users :size="18" />
          <span>Clientes</span>
        </router-link>

        <router-link
          v-if="authStore.isAdmin || authStore.isComprador"
          to="/relatorios"
          class="nav-link"
          id="nav-relatorios"
        >
          <BarChart3 :size="18" />
          <span>Relatórios</span>
        </router-link>

        <router-link
          v-if="authStore.isAdmin"
          to="/configuracoes"
          class="nav-link"
          id="nav-configuracoes"
        >
          <Settings :size="18" />
          <span>Configurações</span>
        </router-link>

        <router-link
          v-if="authStore.isSuperAdmin"
          to="/plataforma"
          class="nav-link"
          id="nav-plataforma"
        >
          <ShieldCheck :size="18" />
          <span>Portal da Plataforma</span>
        </router-link>
      </nav>

      <!-- Active User Profile & Role Indicator -->
      <div class="sidebar-footer">
        <div class="user-profile-widget">
          <div class="user-avatar">
            {{ authStore.currentUser.nome.charAt(0) }}
          </div>
          <div class="user-info">
            <span class="user-name">{{ authStore.currentUser.nome }}</span>
            <span class="user-role">{{ authStore.currentUser.perfil.replace('_', ' ') }}</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="app-main">
      <!-- Topbar with Tenant Switcher & User Profile Switcher for Multi-tenancy Testing -->
      <header class="app-topbar">
        <div class="topbar-left">
          <h1 class="topbar-title">{{ (route.meta?.title as string) || 'Painel' }}</h1>
        </div>

        <div class="topbar-right">
          <!-- Multi-Tenant Simulator Selector -->
          <div class="tenant-switcher" title="Alternar entre empresas para testar o isolamento de dados RLS">
            <Building2 :size="16" class="text-muted" />
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">Empresa:</span>
            <select
              :value="authStore.activeTenantId"
              @change="(e) => authStore.switchTenant((e.target as HTMLSelectElement).value)"
              class="form-select"
              id="select-tenant-switcher"
              style="padding: 0.25rem 0.6rem; font-size: 0.82rem; border-color: var(--border-color); width: auto;"
            >
              <option v-for="t in authStore.tenants" :key="t.id" :value="t.id">
                {{ t.nome_empresa }}
              </option>
            </select>
          </div>

          <!-- Role/User Simulator Selector -->
          <div class="tenant-switcher" title="Alternar perfil de usuário logado">
            <UserCheck :size="16" class="text-muted" />
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">Usuário:</span>
            <select
              :value="authStore.activeUserId"
              @change="(e) => authStore.switchUser((e.target as HTMLSelectElement).value)"
              class="form-select"
              id="select-user-switcher"
              style="padding: 0.25rem 0.6rem; font-size: 0.82rem; border-color: var(--border-color); width: auto;"
            >
              <option v-for="u in authStore.usuarios" :key="u.id" :value="u.id">
                {{ u.nome }} ({{ u.perfil }})
              </option>
            </select>
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
