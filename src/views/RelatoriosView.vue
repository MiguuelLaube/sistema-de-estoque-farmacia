<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import {
  DollarSign,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();

const activeRelatorioTab = ref<'financeiro' | 'produtos' | 'auditoria'>('financeiro');

onMounted(() => {
  if (authStore.isAdmin) {
    authStore.carregarLogsAuditoriaTenant();
  }
});

watch(activeRelatorioTab, (tab) => {
  if (tab === 'auditoria' && authStore.isAdmin) {
    authStore.carregarLogsAuditoriaTenant();
  }
});

// Valores a receber por cliente
const clientesComSaldoDevedor = computed(() => {
  return clientesStore.currentTenantClientes
    .map((c) => {
      const pedidos = encomendasStore.currentTenantEncomendas.filter((e) => e.cliente_id === c.id);
      const valorTotal = pedidos.reduce((acc, curr) => acc + curr.valor_total, 0);
      const valorPago = pedidos.reduce((acc, curr) => acc + curr.valor_pago, 0);
      const saldoDevedor = Math.max(0, valorTotal - valorPago);
      return {
        cliente: c,
        pedidosCount: pedidos.length,
        valorTotal,
        valorPago,
        saldoDevedor,
      };
    })
    .filter((c) => c.saldoDevedor > 0)
    .sort((a, b) => b.saldoDevedor - a.saldoDevedor);
});

const totalGeralReceber = computed(() => {
  return clientesComSaldoDevedor.value.reduce((acc, curr) => acc + curr.saldoDevedor, 0);
});

// Medicamentos mais pedidos com receita total gerada
const rankingProdutos = computed(() => {
  const map: Record<string, { quantidade: number; receita: number; vezes: number }> = {};

  for (const enc of encomendasStore.currentTenantEncomendas) {
    if (enc.itens) {
      for (const it of enc.itens) {
        if (!map[it.descricao]) {
          map[it.descricao] = { quantidade: 0, receita: 0, vezes: 0 };
        }
        map[it.descricao].quantidade += it.quantidade;
        map[it.descricao].receita += it.subtotal;
        map[it.descricao].vezes += 1;
      }
    }
  }

  return Object.entries(map)
    .map(([nome, dados]) => ({ nome, ...dados }))
    .sort((a, b) => b.quantidade - a.quantidade);
});

function formatarMoeda(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

async function exportarRelatorioFinanceiro() {
  const tenant = authStore.currentTenant;
  const header = ['Cliente', 'Telefone', 'Total Pedidos', 'Valor Total', 'Valor Pago', 'Saldo Devedor'];
  const rows = clientesComSaldoDevedor.value.map((c) => [
    `"${c.cliente.nome.replace(/"/g, '""')}"`,
    `"${(c.cliente.telefone || '').replace(/"/g, '""')}"`,
    c.pedidosCount,
    c.valorTotal.toFixed(2),
    c.valorPago.toFixed(2),
    c.saldoDevedor.toFixed(2),
  ]);

  const nomeArquivo = `relatorio_receber_${tenant.slug}_${new Date().toISOString().slice(0, 10)}.csv`;
  const csv = '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);

  await authStore.registrarAuditoria(
    'EXPORTACAO_RELATORIO_FINANCEIRO',
    nomeArquivo,
    `${clientesComSaldoDevedor.value.length} clientes com saldo em aberto`
  );
  await authStore.carregarLogsAuditoriaTenant();

  alert('Relatório financeiro exportado com sucesso e registrado na trilha imutável de auditoria.');
}
</script>

<template>
  <div class="relatorios-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="font-size: 1.5rem; font-weight: 800;">Relatórios Gerenciais</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Auditoria de valores a receber, fluxo de demanda de medicamentos e conformidade LGPD
        </p>
      </div>

      <button
        v-if="activeRelatorioTab === 'financeiro'"
        @click="exportarRelatorioFinanceiro"
        class="btn-outline-emerald"
        id="btn-exportar-relatorio"
      >
        <FileSpreadsheet :size="16" />
        <span>Exportar Relatório CSV</span>
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="sub-tabs-container" style="margin-bottom: 1.5rem;">
      <button
        @click="activeRelatorioTab = 'financeiro'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'financeiro' }"
      >
        Valores a Receber por Cliente
      </button>

      <button
        @click="activeRelatorioTab = 'produtos'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'produtos' }"
      >
        Curva de Medicamentos Mais Pedidos
      </button>

      <button
        v-if="authStore.isAdmin"
        @click="activeRelatorioTab = 'auditoria'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'auditoria' }"
      >
        Trilha de Auditoria & LGPD
      </button>
    </div>

    <!-- TAB 1: VALORES A RECEBER -->
    <div v-if="activeRelatorioTab === 'financeiro'">
      <div class="stat-card" style="margin-bottom: 1.5rem; max-width: 320px;">
        <div class="stat-info">
          <div class="stat-label">Total a Receber da Carteira</div>
          <div class="stat-value" style="color: #dc2626;">{{ formatarMoeda(totalGeralReceber) }}</div>
        </div>
        <div class="stat-icon" style="background: #fee2e2; color: #dc2626;">
          <DollarSign :size="24" />
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contato WhatsApp</th>
              <th style="text-align: center;">Qtd de Pedidos</th>
              <th style="text-align: right;">Total Comprado</th>
              <th style="text-align: right;">Total Pago</th>
              <th style="text-align: right;">Saldo Devedor Pendente</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="clientesComSaldoDevedor.length === 0">
              <td colspan="6" style="text-align: center; padding: 2rem; color: #16a34a; font-weight: 600;">
                Parabéns! Não existem clientes com saldo devedor em aberto nesta empresa.
              </td>
            </tr>
            <tr v-for="c in clientesComSaldoDevedor" :key="c.cliente.id">
              <td style="font-weight: 600;">{{ c.cliente.nome }}</td>
              <td>{{ c.cliente.telefone }}</td>
              <td style="text-align: center;">{{ c.pedidosCount }}</td>
              <td style="text-align: right;">{{ formatarMoeda(c.valorTotal) }}</td>
              <td style="text-align: right; color: #16a34a;">{{ formatarMoeda(c.valorPago) }}</td>
              <td style="text-align: right; color: #dc2626; font-weight: 800;">
                {{ formatarMoeda(c.saldoDevedor) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: RANKING DE MEDICAMENTOS -->
    <div v-if="activeRelatorioTab === 'produtos'">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Medicamento / Produto</th>
              <th style="text-align: center;">Total Encomendado</th>
              <th style="text-align: center;">Nº de Pedidos</th>
              <th style="text-align: right;">Volume Financeiro Gerado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rankingProdutos.length === 0">
              <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                Nenhum medicamento registrado no período.
              </td>
            </tr>
            <tr v-for="(prod, idx) in rankingProdutos" :key="prod.nome">
              <td style="font-weight: 700; color: var(--text-muted);">{{ idx + 1 }}</td>
              <td style="font-weight: 600;">{{ prod.nome }}</td>
              <td style="text-align: center; font-weight: 700;">{{ prod.quantidade }} un.</td>
              <td style="text-align: center;">{{ prod.vezes }} vez(es)</td>
              <td style="text-align: right; font-weight: 700;">{{ formatarMoeda(prod.receita) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: TRILHA DE AUDITORIA IMUTÁVEL & LGPD -->
    <div v-if="activeRelatorioTab === 'auditoria'">
      <div class="card" style="margin-bottom: 1rem; background: var(--bg-surface); display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">
          Registro imutável em banco de dados (<code>log_auditoria</code>) de acessos a dados sensíveis, exportações e ações administrativas (Marco Civil da Internet e LGPD).
        </p>
        <button @click="authStore.carregarLogsAuditoriaTenant()" class="btn-secondary-pill" style="padding: 6px 14px; font-size: 0.8rem;">
          <RefreshCw :size="14" />
          <span>Atualizar</span>
        </button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ação / Operação</th>
              <th>Recurso Acessado</th>
              <th>Usuário Responsável</th>
              <th>Endereço IP</th>
              <th style="text-align: right;">Data / Horário</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="authStore.logsAuditoria.length === 0">
              <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                Nenhum evento de auditoria registrado nesta unidade até o momento.
              </td>
            </tr>
            <tr v-for="log in authStore.logsAuditoria" :key="log.id">
              <td>
                <span class="badge" style="background: var(--bg-body); font-family: monospace; font-size: 0.75rem;">
                  {{ log.acao }}
                </span>
              </td>
              <td style="font-weight: 500;">{{ log.recurso }}</td>
              <td>{{ log.usuario_id ? (authStore.tenantUsers.find((u) => u.id === log.usuario_id)?.nome || 'Usuário Autenticado') : 'Sistema' }}</td>
              <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">{{ log.ip || '-' }}</td>
              <td style="text-align: right; font-size: 0.82rem; color: var(--text-muted);">
                {{ new Date(log.criado_em).toLocaleString('pt-BR') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
