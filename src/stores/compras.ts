import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CompraItem, StatusCompra, Classificacao, Fornecedor } from '../types';
import { initialCompras, initialClassificacoes, initialFornecedores } from '../data/mockData';
import { useAuthStore } from './auth';

export const useComprasStore = defineStore('compras', () => {
  const authStore = useAuthStore();
  const allCompras = ref<CompraItem[]>(initialCompras);
  const allClassificacoes = ref<Classificacao[]>(initialClassificacoes);
  const allFornecedores = ref<Fornecedor[]>(initialFornecedores);

  const currentClassificacoes = computed(() => {
    return allClassificacoes.value.filter((c) => c.tenant_id === authStore.activeTenantId);
  });

  const currentFornecedores = computed(() => {
    return allFornecedores.value.filter((f) => f.tenant_id === authStore.activeTenantId && !f.excluido_em);
  });

  const currentCompras = computed(() => {
    return allCompras.value
      .filter((cp) => cp.tenant_id === authStore.activeTenantId && !cp.arquivado_em)
      .map((cp) => ({
        ...cp,
        classificacao: currentClassificacoes.value.find((c) => c.id === cp.classificacao_id),
        fornecedor: currentFornecedores.value.find((f) => f.id === cp.fornecedor_id),
      }));
  });

  // Grouped by classification for structured viewing
  const comprasPorClassificacao = computed(() => {
    const grupos: Record<string, { classificacao: Classificacao | null; itens: CompraItem[] }> = {};

    for (const c of currentClassificacoes.value) {
      grupos[c.id] = { classificacao: c, itens: [] };
    }
    grupos['outros'] = { classificacao: null, itens: [] };

    for (const item of currentCompras.value) {
      const key = item.classificacao_id && grupos[item.classificacao_id] ? item.classificacao_id : 'outros';
      grupos[key].itens.push(item);
    }

    return Object.values(grupos).filter((g) => g.itens.length > 0);
  });

  function normalizarDescricao(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function encontrarOuCriarCompraItem(
    descricao: string,
    classificacaoId?: string,
    quantidade: number = 1,
    urgente: boolean = false,
    controlado: boolean = false
  ): CompraItem {
    const norm = normalizarDescricao(descricao);
    const tenantId = authStore.activeTenantId;

    // Procura CompraItem em aberto com mesma descrição normalizada e mesma classificação
    const existente = allCompras.value.find(
      (cp) =>
        cp.tenant_id === tenantId &&
        cp.descricao_normalizada === norm &&
        (!classificacaoId || cp.classificacao_id === classificacaoId) &&
        cp.status !== 'Chegou' &&
        !cp.arquivado_em
    );

    if (existente) {
      existente.quantidade += quantidade;
      if (urgente) existente.urgente = true;
      if (controlado) existente.controlado = true;
      return existente;
    }

    // Cria novo registro
    const novoItem: CompraItem = {
      id: 'cp' + Math.random().toString(36).substr(2, 9),
      tenant_id: tenantId,
      descricao: descricao.trim(),
      descricao_normalizada: norm,
      classificacao_id: classificacaoId,
      quantidade,
      preco_custo: 0,
      status: 'Aguardando',
      urgente,
      controlado,
      origem: 'manual',
      atributos: {},
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    allCompras.value.unshift(novoItem);
    return novoItem;
  }

  function atualizarStatus(compraId: string, novoStatus: StatusCompra, onStatusUpdated?: (compraId: string, novoStatus: StatusCompra) => void) {
    const item = allCompras.value.find((c) => c.id === compraId);
    if (item) {
      item.status = novoStatus;
      item.atualizado_em = new Date().toISOString();
      if (onStatusUpdated) {
        onStatusUpdated(compraId, novoStatus);
      }
    }
  }

  function arquivarChegou(): number {
    const tenantId = authStore.activeTenantId;
    let arquivados = 0;
    for (const item of allCompras.value) {
      if (item.tenant_id === tenantId && item.status === 'Chegou' && !item.arquivado_em) {
        item.arquivado_em = new Date().toISOString();
        arquivados++;
      }
    }
    return arquivados;
  }

  function exportarParaCSV(): string {
    const itens = currentCompras.value;
    const tenant = authStore.currentTenant;
    const header = ['ID', 'Descrição', 'Classificação', 'Quantidade', 'Custo Unitário', 'Status', 'Urgente', 'Controlado', 'Fornecedor'];
    const rows = itens.map((i) => [
      i.id,
      `"${i.descricao}"`,
      `"${i.classificacao?.nome || 'Geral'}"`,
      i.quantidade,
      i.preco_custo.toFixed(2),
      i.status,
      i.urgente ? 'SIM' : 'NÃO',
      i.controlado ? 'SIM' : 'NÃO',
      `"${i.fornecedor?.nome || 'Não definido'}"`,
    ]);

    const csvContent = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `compras_${tenant.slug}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return `Exportação concluída (${itens.length} itens)`;
  }

  return {
    allCompras,
    allClassificacoes,
    allFornecedores,
    currentClassificacoes,
    currentFornecedores,
    currentCompras,
    comprasPorClassificacao,
    normalizarDescricao,
    encontrarOuCriarCompraItem,
    atualizarStatus,
    arquivarChegou,
    exportarParaCSV,
  };
});
