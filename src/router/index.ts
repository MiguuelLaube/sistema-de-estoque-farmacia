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
      meta: { title: 'Drogaria Aeroporto - Visão Geral do Sistema', public: true },
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
        roles: ['admin', 'comprador', 'super_admin'] as PerfilUsuario[],
        tenantOperational: true,
      },
    },
    {
      path: '/configuracoes',
      name: 'configuracoes',
      component: ConfiguracoesView,
      meta: {
        title: 'Configurações',
        roles: ['admin', 'super_admin'] as PerfilUsuario[],
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
    return next({ name: 'login' });
  }

  if (to.name === 'login' && authStore.isAuthenticated && !authStore.passwordRecoveryMode && authStore.mfaStage === 'none') {
    return next(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
  }

  // Controle estrito de permissões por perfil (RBAC)
  const allowedRoles = to.meta.roles as PerfilUsuario[] | undefined;
  if (allowedRoles && authStore.isAuthenticated) {
    const userRole = authStore.currentUser.perfil;
    if (!allowedRoles.includes(userRole)) {
      return next({ name: 'dashboard' });
    }
  }

  // Isolamento Zero-Trust LGPD: Super Admin não acessa telas operacionais de clientes sem sessão Break-Glass ativa
  if (to.meta.tenantOperational && authStore.isSuperAdmin && !authStore.breakGlassTenantId) {
    return next({ name: 'plataforma' });
  }

  next();
});

export default router;
