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
      meta: { title: 'Acesso ao Sistema', public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: 'Início & Métricas' },
    },
    {
      path: '/encomendas',
      alias: ['/Orders', '/orders'],
      name: 'encomendas',
      component: EncomendasView,
      meta: { title: 'Encomendas' },
    },
    {
      path: '/nova-encomenda',
      alias: ['/NewOrder', '/neworder', '/CriarEncomenda'],
      name: 'nova-encomenda',
      component: NovaEncomendaView,
      meta: { title: 'Nova Encomenda' },
    },
    {
      path: '/compras',
      alias: ['/pedidos', '/Pedidos'],
      name: 'compras',
      component: ComprasView,
      meta: { title: 'Pedidos' },
    },
    {
      path: '/clientes',
      alias: ['/Customers', '/customers'],
      name: 'clientes',
      component: ClientesView,
      meta: { title: 'Clientes' },
    },
    {
      path: '/relatorios',
      name: 'relatorios',
      component: RelatoriosView,
      meta: { title: 'Relatórios Gerenciais' },
    },
    {
      path: '/configuracoes',
      name: 'configuracoes',
      component: ConfiguracoesView,
      meta: { title: 'Configurações' },
    },
    {
      path: '/plataforma',
      name: 'plataforma',
      component: PlataformaView,
      meta: { title: 'Portal da Plataforma (Super-Admin)' },
    },
  ],
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  if (to.path === '/' && !authStore.isAuthenticated) {
    return next({ name: 'landing' });
  }
  if (!to.meta.public && !authStore.isAuthenticated) {
    return next({ name: 'login' });
  }
  if (to.name === 'login' && authStore.isAuthenticated) {
    return next({ name: 'dashboard' });
  }
  next();
});

export default router;
