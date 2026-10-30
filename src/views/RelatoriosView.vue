<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import {
  DollarSign,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Send,
  Loader2,
  TrendingUp,
  ShieldCheck,
} from 'lucide-vue-next';
import {
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  type OpcoesRelatorioExportacao,
} from '../utils/reportExporter';
import { enviarModeloWhatsAppProxy, gerarLinkWaMeComModelo } from '../services/evolutionApi';

const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();

const activeRelatorioTab = ref<'financeiro' | 'produtos' | 'auditoria'>('financeiro');
const feedbackExportacao = ref<string | null>(null);
const enviandoCobrancaClienteId = ref<string | null>(null);

function mostrarFeedback(msg: string) {
  feedbackExportacao.value = msg;
  setTimeout(() => {
    if (feedbackExportacao.value === msg) feedbackExportacao.value = null;
  }, 4500);
}

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
      const pedidos = encomendasStore.currentTenantEncomendas.filter((e) => e.cliente_id === c.id && e.status !== 'Cancelada');
      const valorTotal = pedidos.reduce((acc, curr) => acc + curr.valor_total, 0);
      const valorPago = pedidos.reduce((acc, curr) => acc + curr.valor_pago, 0);
      const saldoDevedor = Math.max(0, valorTotal - valorPago);
      const itensPendentes = pedidos
        .filter((p) => p.valor_total > p.valor_pago)
        .flatMap((p) => p.itens?.map((i) => i.descricao) || []);
      return {
        cliente: c,
        pedidosCount: pedidos.length,
        valorTotal,
        valorPago,
        saldoDevedor,
        resumoItens: itensPendentes.slice(0, 3).join(', ') || 'encomendas registradas',
      };
    })
    .filter((c) => c.saldoDevedor > 0)
    .sort((a, b) => b.saldoDevedor - a.saldoDevedor);
});

const totalGeralReceber = computed(() => {
  return clientesComSaldoDevedor.value.reduce((acc, curr) => acc + curr.saldoDevedor, 0);
});

const totalCompradoCarteira = computed(() => {
  return clientesComSaldoDevedor.value.reduce((acc, curr) => acc + curr.valorTotal, 0);
});

const totalPagoCarteira = computed(() => {
  return clientesComSaldoDevedor.value.reduce((acc, curr) => acc + curr.valorPago, 0);
});

// Medicamentos mais pedidos com receita total gerada
const rankingProdutos = computed(() => {
  const map: Record<string, { quantidade: number; receita: number; vezes: number }> = {};

  for (const enc of encomendasStore.currentTenantEncomendas) {
    if (enc.status === 'Cancelada') continue;
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

const totalUnidadesRanking = computed(() =>
  rankingProdutos.value.reduce((acc, p) => acc + p.quantidade, 0)
);

const totalReceitaRanking = computed(() =>
  rankingProdutos.value.reduce((acc, p) => acc + p.receita, 0)
);

function formatarMoeda(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function montarDadosRelatorioAtivo(): { opcoes: OpcoesRelatorioExportacao; acaoAuditoria: string } {
  const tenant = authStore.currentTenant;
  const cfg = authStore.currentConfig;
  const nomeLoja = cfg.header_title || cfg.nome_sistema || tenant.nome_empresa || 'EncoMed';
  const corHex = cfg.cor_primaria || '#2563eb';
  const slug = tenant.slug || 'loja';

  if (activeRelatorioTab.value === 'financeiro') {
    return {
      acaoAuditoria: 'EXPORTACAO_RELATORIO_FINANCEIRO',
      opcoes: {
        nomeArquivoBase: `relatorio_receber_${slug}`,
        tituloRelatorio: 'Relatório de Valores a Receber por Cliente',
        subtituloRelatorio: 'Posição financeira consolidada de encomendas com saldo pendente',
        nomeLoja,
        corPrimariaHex: corHex,
        orientacaoPdf: 'retrato',
        resumoCards: [
          { rotulo: 'Clientes em Aberto', valor: `${clientesComSaldoDevedor.value.length} cliente(s)` },
          { rotulo: 'Total Contratado', valor: formatarMoeda(totalCompradoCarteira.value) },
          { rotulo: 'Saldo Total a Receber', valor: formatarMoeda(totalGeralReceber.value) },
        ],
        colunas: [
          { cabecalho: 'Cliente', largura: 28, alinhamento: 'left', tipo: 'texto' },
          { cabecalho: 'WhatsApp', largura: 18, alinhamento: 'left', tipo: 'texto' },
          { cabecalho: 'Pedidos', largura: 10, alinhamento: 'center', tipo: 'inteiro' },
          { cabecalho: 'Total Comprado', largura: 16, alinhamento: 'right', tipo: 'moeda' },
          { cabecalho: 'Total Pago', largura: 16, alinhamento: 'right', tipo: 'moeda' },
          { cabecalho: 'Saldo Devedor', largura: 18, alinhamento: 'right', tipo: 'moeda' },
        ],
        linhas: clientesComSaldoDevedor.value.map((c) => [
          c.cliente.nome,
          c.cliente.telefone || '-',
          c.pedidosCount,
          Number(c.valorTotal.toFixed(2)),
          Number(c.valorPago.toFixed(2)),
          Number(c.saldoDevedor.toFixed(2)),
        ]),
        linhaTotais: [
          'TOTAL CONSOLIDADO',
          '',
          clientesComSaldoDevedor.value.reduce((a, b) => a + b.pedidosCount, 0),
          Number(totalCompradoCarteira.value.toFixed(2)),
          Number(totalPagoCarteira.value.toFixed(2)),
          Number(totalGeralReceber.value.toFixed(2)),
        ],
      },
    };
  }

  if (activeRelatorioTab.value === 'produtos') {
    return {
      acaoAuditoria: 'EXPORTACAO_CURVA_MEDICAMENTOS',
      opcoes: {
        nomeArquivoBase: `curva_medicamentos_${slug}`,
        tituloRelatorio: 'Curva ABC de Medicamentos Mais Encomendados',
        subtituloRelatorio: 'Demanda acumulada de itens por volume físico e receita gerada',
        nomeLoja,
        corPrimariaHex: corHex,
        orientacaoPdf: 'retrato',
        resumoCards: [
          { rotulo: 'Itens Distintos', valor: `${rankingProdutos.value.length} produto(s)` },
          { rotulo: 'Unidades Encomendadas', valor: `${totalUnidadesRanking.value} un.` },
          { rotulo: 'Volume Financeiro', valor: formatarMoeda(totalReceitaRanking.value) },
        ],
        colunas: [
          { cabecalho: '#', largura: 8, alinhamento: 'center', tipo: 'inteiro' },
          { cabecalho: 'Medicamento / Produto', largura: 38, alinhamento: 'left', tipo: 'texto' },
          { cabecalho: 'Qtd. Total', largura: 14, alinhamento: 'center', tipo: 'inteiro' },
          { cabecalho: 'Nº Pedidos', largura: 14, alinhamento: 'center', tipo: 'inteiro' },
          { cabecalho: 'Receita Gerada', largura: 18, alinhamento: 'right', tipo: 'moeda' },
        ],
        linhas: rankingProdutos.value.map((prod, idx) => [
          idx + 1,
          prod.nome,
          prod.quantidade,
          prod.vezes,
          Number(prod.receita.toFixed(2)),
        ]),
        linhaTotais: [
          '',
          'TOTAL ACUMULADO',
          totalUnidadesRanking.value,
          rankingProdutos.value.reduce((a, b) => a + b.vezes, 0),
          Number(totalReceitaRanking.value.toFixed(2)),
        ],
      },
    };
  }

  // Auditoria & LGPD
  return {
    acaoAuditoria: 'EXPORTACAO_TRILHA_AUDITORIA_LGPD',
    opcoes: {
      nomeArquivoBase: `trilha_auditoria_lgpd_${slug}`,
      tituloRelatorio: 'Trilha Imutável de Auditoria & Conformidade LGPD',
      subtituloRelatorio: 'Registro cronológico de operações críticas, acessos e exportações (Lei nº 13.709/2018)',
      nomeLoja,
      corPrimariaHex: corHex,
      orientacaoPdf: 'paisagem',
      resumoCards: [
        { rotulo: 'Eventos Registrados', valor: `${authStore.logsAuditoria.length} registro(s)` },
        { rotulo: 'Unidade Auditada', valor: nomeLoja },
        { rotulo: 'Base Regulatória', valor: 'LGPD Art. 6º & 37' },
      ],
      colunas: [
        { cabecalho: 'Ação / Operação', largura: 26, alinhamento: 'left', tipo: 'texto' },
        { cabecalho: 'Recurso Acessado', largura: 30, alinhamento: 'left', tipo: 'texto' },
        { cabecalho: 'Responsável', largura: 20, alinhamento: 'left', tipo: 'texto' },
        { cabecalho: 'IP Origem', largura: 14, alinhamento: 'center', tipo: 'texto' },
        { cabecalho: 'Data / Horário', largura: 20, alinhamento: 'right', tipo: 'texto' },
      ],
      linhas: authStore.logsAuditoria.map((log) => [
        log.acao,
        log.recurso,
        log.usuario_id
          ? authStore.tenantUsers.find((u) => u.id === log.usuario_id)?.nome || 'Usuário Autenticado'
          : 'Sistema',
        log.ip || '-',
        new Date(log.criado_em).toLocaleString('pt-BR'),
      ]),
    },
  };
}

async function gerarRelatorioExcel() {
  const { opcoes, acaoAuditoria } = montarDadosRelatorioAtivo();
  const nomeArquivo = exportarRelatorioExcel(opcoes);
  await authStore.registrarAuditoria(
    `${acaoAuditoria}_XLSX`,
    nomeArquivo,
    `${opcoes.linhas.length} linha(s) exportadas em planilha Excel (.xlsx)`
  );
  if (authStore.isAdmin) await authStore.carregarLogsAuditoriaTenant();
  mostrarFeedback(`Planilha Excel "${nomeArquivo}" gerada com sucesso e auditada!`);
}

async function gerarRelatorioPdf() {
  const { opcoes, acaoAuditoria } = montarDadosRelatorioAtivo();
  const nomeArquivo = exportarRelatorioPdf(opcoes);
  await authStore.registrarAuditoria(
    `${acaoAuditoria}_PDF`,
    nomeArquivo,
    `${opcoes.linhas.length} linha(s) exportadas em documento PDF (.pdf)`
  );
  if (authStore.isAdmin) await authStore.carregarLogsAuditoriaTenant();
  mostrarFeedback(`Documento PDF "${nomeArquivo}" gerado com sucesso e registrado na auditoria!`);
}

async function dispararCobrancaWhatsapp(item: {
  cliente: any;
  saldoDevedor: number;
  valorTotal: number;
  valorPago: number;
  resumoItens: string;
}) {
  if (!item.cliente?.telefone) {
    alert('Este cliente não possui telefone WhatsApp cadastrado.');
    return;
  }

  const cfg = authStore.currentConfig;
  const variaveis = {
    cliente: item.cliente.nome,
    nomeCompleto: item.cliente.nome,
    medicamento: item.resumoItens,
    saldo: item.saldoDevedor,
    valorTotal: item.valorTotal,
    valorPago: item.valorPago,
    loja: cfg.header_title || cfg.nome_sistema || 'nossa farmácia',
  };

  if (!cfg.evolution_api_ativo) {
    const url = gerarLinkWaMeComModelo(item.cliente.telefone, 'cobranca', cfg, variaveis);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  enviandoCobrancaClienteId.value = item.cliente.id;
  try {
    const res = await enviarModeloWhatsAppProxy({
      ativo: true,
      numeroDestino: item.cliente.telefone,
      modelo: 'cobranca',
      variaveis,
    });
    if (res.sucesso) {
      mostrarFeedback(`Lembrete de saldo enviado pela API para ${item.cliente.nome}!`);
    } else {
      const abrirWeb = confirm(`Falha no envio automático (${res.mensagem}). Deseja abrir no WhatsApp Web?`);
      if (abrirWeb) {
        const url = gerarLinkWaMeComModelo(item.cliente.telefone, 'cobranca', cfg, variaveis);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  } finally {
    enviandoCobrancaClienteId.value = null;
  }
}
</script>

<template>
  <div class="relatorios-page" style="padding-bottom: 3rem;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="font-size: 1.55rem; font-weight: 800; font-family: var(--font-heading);">Relatórios Gerenciais</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Exportação executiva em PDF e Excel (.xlsx) de carteira a receber, curva de demanda e auditoria LGPD
        </p>
      </div>

      <!-- Botões de Exportação PDF & Excel -->
      <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
        <button
          @click="gerarRelatorioPdf"
          class="btn-primary-pill"
          id="btn-exportar-relatorio-pdf"
          title="Gerar e baixar documento PDF formatado para impressão/diretoria"
        >
          <FileText :size="16" />
          <span>Gerar PDF</span>
        </button>

        <button
          @click="gerarRelatorioExcel"
          class="btn-outline-emerald"
          id="btn-exportar-relatorio"
          title="Gerar e baixar planilha nativa Microsoft Excel (.xlsx)"
        >
          <FileSpreadsheet :size="16" />
          <span>Exportar Excel (.xlsx)</span>
        </button>
      </div>
    </div>

    <!-- Banner Feedback -->
    <div
      v-if="feedbackExportacao"
      style="margin-bottom: 1.25rem; padding: 0.7rem 1.15rem; border-radius: 9999px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem;"
    >
      <span>✅</span>
      <span>{{ feedbackExportacao }}</span>
    </div>

    <!-- Navigation Tabs -->
    <div class="sub-tabs-container" style="margin-bottom: 1.5rem; flex-wrap: wrap;">
      <button
        @click="activeRelatorioTab = 'financeiro'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'financeiro' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <DollarSign :size="15" />
        <span>Valores a Receber por Cliente</span>
      </button>

      <button
        @click="activeRelatorioTab = 'produtos'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'produtos' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <TrendingUp :size="15" />
        <span>Curva de Medicamentos Mais Pedidos</span>
      </button>

      <button
        v-if="authStore.isAdmin"
        @click="activeRelatorioTab = 'auditoria'"
        class="sub-tab-btn"
        :class="{ active: activeRelatorioTab === 'auditoria' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <ShieldCheck :size="15" />
        <span>Trilha de Auditoria & LGPD</span>
      </button>
    </div>

    <!-- TAB 1: VALORES A RECEBER -->
    <div v-if="activeRelatorioTab === 'financeiro'">
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Total a Receber da Carteira</div>
            <div class="stat-value" style="color: #dc2626;">{{ formatarMoeda(totalGeralReceber) }}</div>
          </div>
          <div class="stat-icon" style="background: #fee2e2; color: #dc2626;">
            <DollarSign :size="24" />
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Total Já Recebido (Sinais)</div>
            <div class="stat-value" style="color: #059669;">{{ formatarMoeda(totalPagoCarteira) }}</div>
          </div>
          <div class="stat-icon" style="background: #ecfdf5; color: #059669;">
            <DollarSign :size="24" />
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Clientes com Saldo Pendente</div>
            <div class="stat-value">{{ clientesComSaldoDevedor.length }}</div>
          </div>
          <div class="stat-icon" style="background: #eff6ff; color: var(--color-primary);">
            <FileText :size="24" />
          </div>
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
              <th style="text-align: right;">Lembrete API</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="clientesComSaldoDevedor.length === 0">
              <td colspan="7" style="text-align: center; padding: 2rem; color: #16a34a; font-weight: 600;">
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
              <td style="text-align: right;">
                <button
                  type="button"
                  @click="dispararCobrancaWhatsapp(c)"
                  :disabled="enviandoCobrancaClienteId === c.cliente.id"
                  class="btn-outline-emerald"
                  style="padding: 4px 12px; font-size: 0.76rem;"
                  title="Enviar Modelo 3 (Lembrete de Saldo) pelo WhatsApp"
                >
                  <Loader2 v-if="enviandoCobrancaClienteId === c.cliente.id" class="animate-spin" :size="13" />
                  <Send v-else :size="13" />
                  <span>Cobrar Zap</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: RANKING DE MEDICAMENTOS -->
    <div v-if="activeRelatorioTab === 'produtos'">
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Produtos Encomendados</div>
            <div class="stat-value">{{ rankingProdutos.length }}</div>
          </div>
          <div class="stat-icon" style="background: #eff6ff; color: var(--color-primary);">
            <TrendingUp :size="24" />
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Total de Unidades</div>
            <div class="stat-value" style="color: #059669;">{{ totalUnidadesRanking }} un.</div>
          </div>
          <div class="stat-icon" style="background: #ecfdf5; color: #059669;">
            <FileSpreadsheet :size="24" />
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Volume Financeiro Acumulado</div>
            <div class="stat-value">{{ formatarMoeda(totalReceitaRanking) }}</div>
          </div>
          <div class="stat-icon" style="background: #fffbeb; color: #d97706;">
            <DollarSign :size="24" />
          </div>
        </div>
      </div>

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
          Registro imutável em banco de dados (<code>log_auditoria</code>) de acessos a dados sensíveis, exportações PDF/Excel e ações administrativas (Marco Civil da Internet e LGPD).
        </p>
        <button @click="authStore.carregarLogsAuditoriaTenant()" class="btn-outline-neutral" style="padding: 6px 14px; font-size: 0.8rem;">
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
