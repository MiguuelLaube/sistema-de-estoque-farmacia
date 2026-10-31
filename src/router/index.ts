import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import EncomendasView from '../views/EncomendasView.vue';
import ComprasView from '../views/ComprasView.vue';
import ClientesView from '../views/ClientesView.vue';
import RelatoriosView from '../views/RelatoriosView.vue';
import ConfiguracoesView from '../views/ConfiguracoesView.vue';
import PlataformaView from '../views/PlataformaView.vue';
import NovaEncomendaView from '../views/NovaEncomendaView.vue';
import LoginView from '../views/LoginView.vue';
import LandingView from '../views/LandingView.vue';
import { useAuthStore } from '../stores/auth';
import type { PerfilUsuario } from '../types';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/apresentacao',
      alias: ['/home', '/sobre'],
      name: 'landing',
      component: LandingView,
      meta: { title: 'EncoMed - Gestão Farmacêutica e Encomendas', public: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { title: 'Acesso Seguro ao Sistema', public: true },
    },
    {
      path: '/',
      alias: ['/dashboard'],
      name: 'dashboard',
      component: DashboardView,
      meta: { title: 'Início & Métricas', tenantOperational: true },
    },
    {
      path: '/encomendas',
      alias: ['/Orders', '/orders'],
      name: 'encomendas',
      component: EncomendasView,
      meta: { title: 'Encomendas', tenantOperational: true },
    },
    {
      path: '/nova-encomenda',
      alias: ['/NewOrder', '/neworder', '/CriarEncomenda'],
      name: 'nova-encomenda',
      component: NovaEncomendaView,
      meta: { title: 'Nova Encomenda', tenantOperational: true },
    },
    {
      path: '/compras',
      alias: ['/pedidos', '/Pedidos'],
      name: 'compras',
      component: ComprasView,
      meta: { title: 'Pedidos', tenantOperational: true },
    },
    {
      path: '/clientes',
      alias: ['/Customers', '/customers'],
      name: 'clientes',
      component: ClientesView,
      meta: { title: 'Clientes', tenantOperational: true },
    },
    {
      path: '/relatorios',
      name: 'relatorios',
      component: RelatoriosView,
      meta: {
        title: 'Relatórios Gerenciais',
        roles: ['admin', 'comprador'] as PerfilUsuario[],
        tenantOperational: true,
      },
    },
    {
      path: '/configuracoes',
      name: 'configuracoes',
      component: ConfiguracoesView,
      meta: {
        title: 'Configurações',
        roles: ['admin'] as PerfilUsuario[],
        tenantOperational: true,
      },
    },
    {
      path: '/plataforma',
      name: 'plataforma',
      component: PlataformaView,
      meta: {
        title: 'Governança & Segurança da Plataforma',
        roles: ['super_admin'] as PerfilUsuario[],
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();
  if (!authStore.isAuthInitialized) {
    await authStore.initAuth();
  }

  // Se 2FA ou redefinição de senha estiver em andamento, mantém na tela /login
  if ((authStore.mfaStage !== 'none' || authStore.passwordRecoveryMode) && to.name !== 'login') {
    return next({ name: 'login' });
  }

  if (to.path === '/' && !authStore.isAuthenticated) {
    return next({ name: 'landing' });
  }

  if (!to.meta.public && !authStore.isAuthenticated) {
    return next({ name: 'landing' });
  }

  if (to.name === 'login' && !authStore.passwordRecoveryMode && authStore.mfaStage === 'none') {
    if (authStore.isAuthenticated) {
      return next(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
    } else {
      return next({ name: 'landing', query: { login: 'true' } });
    }
  }

  // Isolamento Zero-Trust LGPD: Super Admin só acessa telas operacionais ou de configuração de tenants com sessão Break-Glass ativa
  if (to.meta.tenantOperational && authStore.isSuperAdmin && !authStore.breakGlassTenantId) {
    return next({ name: 'plataforma' });
  }

  // Controle estrito de permissões por perfil (RBAC)
  const allowedRoles = to.meta.roles as PerfilUsuario[] | undefined;
  if (allowedRoles && authStore.isAuthenticated) {
    const userRole = authStore.currentUser.perfil;
    // Se for super_admin com Break-Glass ativo num tenant, permite agir como admin do tenant
    const effectiveRoles: PerfilUsuario[] = [userRole];
    if (authStore.isSuperAdmin && authStore.breakGlassTenantId) {
      effectiveRoles.push('admin');
    }
    const hasRole = allowedRoles.some((r) => effectiveRoles.includes(r));
    if (!hasRole) {
      return next(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
    }
  }

  next();
});

export default router;
