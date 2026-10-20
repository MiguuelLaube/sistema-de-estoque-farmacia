import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import EncomendasView from '../views/EncomendasView.vue';
import ComprasView from '../views/ComprasView.vue';
import ClientesView from '../views/ClientesView.vue';
import RelatoriosView from '../views/RelatoriosView.vue';
import ConfiguracoesView from '../views/ConfiguracoesView.vue';
import PlataformaView from '../views/PlataformaView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: 'Início & Métricas' },
    },
    {
      path: '/encomendas',
      name: 'encomendas',
      component: EncomendasView,
      meta: { title: 'Gestão de Encomendas' },
    },
    {
      path: '/compras',
      name: 'compras',
      component: ComprasView,
      meta: { title: 'Lista de Compras' },
    },
    {
      path: '/clientes',
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

export default router;
