import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Tenant, ConfigTenant, Usuario } from '../types';
import { initialTenants, initialConfigs, initialUsuarios } from '../data/mockData';

export const useAuthStore = defineStore('auth', () => {
  const tenants = ref<Tenant[]>(initialTenants);
  const configs = ref<Record<string, ConfigTenant>>(initialConfigs);
  const usuarios = ref<Usuario[]>(initialUsuarios);

  const activeTenantId = ref<string>('a0000000-0000-0000-0000-000000000001');
  const activeUserId = ref<string>('u0000000-0000-0000-0000-000000000001'); // Admin

  const currentTenant = computed(() => {
    return tenants.value.find((t) => t.id === activeTenantId.value) || tenants.value[0];
  });

  const currentConfig = computed(() => {
    return configs.value[activeTenantId.value] || initialConfigs['a0000000-0000-0000-0000-000000000001'];
  });

  const currentUser = computed(() => {
    return usuarios.value.find((u) => u.id === activeUserId.value) || usuarios.value[0];
  });

  const isSuperAdmin = computed(() => currentUser.value.perfil === 'super_admin');
  const isAdmin = computed(() => currentUser.value.perfil === 'admin' || isSuperAdmin.value);
  const isComprador = computed(() => currentUser.value.perfil === 'comprador' || isAdmin.value);
  const isOperador = computed(() => currentUser.value.perfil === 'operador' || isAdmin.value);

  // Users belonging to the current tenant
  const tenantUsers = computed(() => {
    return usuarios.value.filter((u) => u.tenant_id === activeTenantId.value || u.perfil === 'super_admin');
  });

  function applyTheme() {
    if (typeof document !== 'undefined') {
      const cfg = currentConfig.value;
      if (cfg && cfg.cor_primaria) {
        document.documentElement.style.setProperty('--color-primary', cfg.cor_primaria);
        document.documentElement.style.setProperty('--color-primary-hover', adjustColorBrightness(cfg.cor_primaria, -15));
        document.documentElement.style.setProperty('--color-primary-alpha', `${cfg.cor_primaria}1f`);
      }
    }
  }

  function adjustColorBrightness(hex: string, percent: number) {
    let num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
    let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function switchTenant(tenantId: string) {
    activeTenantId.value = tenantId;
    // Set active user to first user of this tenant
    const userForTenant = usuarios.value.find((u) => u.tenant_id === tenantId);
    if (userForTenant) {
      activeUserId.value = userForTenant.id;
    }
    applyTheme();
  }

  function switchUser(userId: string) {
    const user = usuarios.value.find((u) => u.id === userId);
    if (user) {
      activeUserId.value = user.id;
      if (user.tenant_id && user.tenant_id !== activeTenantId.value) {
        activeTenantId.value = user.tenant_id;
        applyTheme();
      }
    }
  }

  return {
    tenants,
    configs,
    usuarios,
    activeTenantId,
    activeUserId,
    currentTenant,
    currentConfig,
    currentUser,
    isSuperAdmin,
    isAdmin,
    isComprador,
    isOperador,
    tenantUsers,
    switchTenant,
    switchUser,
    applyTheme,
  };
});
