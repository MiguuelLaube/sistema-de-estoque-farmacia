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
    const nomesParaMemoria: string[] = [];

    for (const item of allCompras.value) {
      if (item.tenant_id === tenantId && item.status === 'Chegou' && !item.arquivado_em) {
        item.arquivado_em = new Date().toISOString();
        nomesParaMemoria.push(item.descricao);
        arquivados++;
      }
    }

    // Salva os nomes na memória local (Documento Seção 3 / Pág. 8)
    if (nomesParaMemoria.length > 0 && typeof localStorage !== 'undefined') {
      try {
        const salvo = JSON.parse(localStorage.getItem('pharma_med_history') || '[]');
        const combinado = Array.from(new Set([...salvo, ...nomesParaMemoria]));
        localStorage.setItem('pharma_med_history', JSON.stringify(combinado));
      } catch (e) {
        console.error('Erro ao salvar pharma_med_history', e);
      }
    }

    return arquivados;
  }

  function exportarParaCSV(listaCustomizada?: CompraItem[]): string {
    const itens = listaCustomizada || currentCompras.value;
    const tenant = authStore.currentTenant;

    // Colunas especificadas no Documento (Pág. 8): Nome, Classificação, Quantidade, Status e Urgente
    const header = ['Nome', 'Classificação', 'Quantidade', 'Status', 'Urgente'];
    const rows = itens.map((i) => [
      `"${i.descricao.replace(/"/g, '""')}"`,
      `"${(i.classificacao?.nome || 'Geral').replace(/"/g, '""')}"`,
      i.quantidade,
      i.status,
      i.urgente ? 'SIM' : 'NÃO',
    ]);

    // Delimitado por ponto e vírgula com BOM UTF-8 (\uFEFF)
    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pedidos_compra_${tenant.slug}_${new Date().toISOString().slice(0, 10)}.csv`);
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
