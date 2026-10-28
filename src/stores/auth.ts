import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Tenant, ConfigTenant, Usuario, Funcionario } from '../types';
import { initialTenants, initialConfigs, initialUsuarios, initialFuncionarios } from '../data/mockData';
import { supabase, isLiveSupabaseConfigured } from '../services/supabase';

export const useAuthStore = defineStore('auth', () => {
  const tenants = ref<Tenant[]>(initialTenants);
  const configs = ref<Record<string, ConfigTenant>>(initialConfigs);
  const usuarios = ref<Usuario[]>(initialUsuarios);
  const funcionarios = ref<Funcionario[]>(initialFuncionarios);

  const activeTenantId = ref<string>('a0000000-0000-0000-0000-000000000001');
  const activeUserId = ref<string>('u0000000-0000-0000-0000-000000000001'); // Admin
  const isAuthenticated = ref<boolean>(localStorage.getItem('pharma_auth_logged') !== 'false');

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

  // Funcionários cadastrados no tenant (Documento Seção 2 e 3)
  const tenantFuncionarios = computed(() => {
    return funcionarios.value.filter((f) => f.tenant_id === activeTenantId.value);
  });

  function adicionarFuncionario(nome: string, cargo?: string) {
    if (!nome.trim()) return null;
    const novo: Funcionario = {
      id: 'f' + Math.random().toString(36).substring(2, 9),
      tenant_id: activeTenantId.value,
      nome: nome.trim(),
      cargo: cargo?.trim() || undefined,
      criado_em: new Date().toISOString(),
    };
    funcionarios.value.push(novo);
    return novo;
  }

  function atualizarFuncionario(id: string, dados: { nome?: string; cargo?: string }) {
    const f = funcionarios.value.find((item) => item.id === id);
    if (f) {
      if (dados.nome !== undefined) f.nome = dados.nome.trim();
      if (dados.cargo !== undefined) f.cargo = dados.cargo?.trim() || undefined;
    }
  }

  function removerFuncionario(id: string) {
    const idx = funcionarios.value.findIndex((item) => item.id === id);
    if (idx !== -1) {
      funcionarios.value.splice(idx, 1);
    }
  }

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

  async function login(email: string, password: string): Promise<{ success: boolean; message?: string }> {
    if (!email.trim() || !password) {
      return { success: false, message: 'Informe o e-mail e a senha.' };
    }

    if (isLiveSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data.user) {
          const found = usuarios.value.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
          if (found) {
            activeUserId.value = found.id;
            if (found.tenant_id) activeTenantId.value = found.tenant_id;
          }
        }
      } catch (err: any) {
        return { success: false, message: err.message || 'Falha ao conectar com o Supabase.' };
      }
    } else {
      // Modo Local / Demonstração
      const found = usuarios.value.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (found) {
        activeUserId.value = found.id;
        if (found.tenant_id) activeTenantId.value = found.tenant_id;
      }
    }

    isAuthenticated.value = true;
    localStorage.setItem('pharma_auth_logged', 'true');
    applyTheme();
    return { success: true };
  }

  function loginAsDemo(role: 'admin' | 'operador' = 'operador') {
    const target = usuarios.value.find((u) => u.perfil === role) || usuarios.value[0];
    if (target) {
      activeUserId.value = target.id;
      if (target.tenant_id) activeTenantId.value = target.tenant_id;
    }
    isAuthenticated.value = true;
    localStorage.setItem('pharma_auth_logged', 'true');
    applyTheme();
  }

  async function logout() {
    if (isLiveSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Erro ao deslogar do Supabase:', e);
      }
    }
    isAuthenticated.value = false;
    localStorage.setItem('pharma_auth_logged', 'false');
  }

  return {
    tenants,
    configs,
    usuarios,
    activeTenantId,
    activeUserId,
    isAuthenticated,
    currentTenant,
    currentConfig,
    currentUser,
    isSuperAdmin,
    isAdmin,
    isComprador,
    isOperador,
    tenantUsers,
    funcionarios,
    tenantFuncionarios,
    adicionarFuncionario,
    atualizarFuncionario,
    removerFuncionario,
    switchTenant,
    switchUser,
    applyTheme,
    login,
    loginAsDemo,
    logout,
  };
});
