import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { CompraItem, StatusCompra, Classificacao, Fornecedor } from '../types';
import { initialCompras, initialClassificacoes, initialFornecedores } from '../data/mockData';
import { useAuthStore } from './auth';
import { supabase, isLiveSupabaseConfigured } from '../services/supabase';

function gerarUuidSeguro(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

export const useComprasStore = defineStore('compras', () => {
  const authStore = useAuthStore();
  const isLive = isLiveSupabaseConfigured();

  const allCompras = ref<CompraItem[]>(isLive ? [] : initialCompras);
  const allClassificacoes = ref<Classificacao[]>(isLive ? [] : initialClassificacoes);
  const allFornecedores = ref<Fornecedor[]>(isLive ? [] : initialFornecedores);

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

  async function carregarCompras() {
    if (!isLive || !authStore.isAuthenticated) {
      if (!isLive) {
        allCompras.value = initialCompras;
        allClassificacoes.value = initialClassificacoes;
        allFornecedores.value = initialFornecedores;
      } else {
        allCompras.value = [];
        allClassificacoes.value = [];
        allFornecedores.value = [];
      }
      return;
    }

    const [cpRes, clRes, foRes] = await Promise.all([
      supabase.from('compra_item').select('*').order('criado_em', { ascending: false }),
      supabase.from('classificacao').select('*').order('ordem', { ascending: true }),
      supabase.from('fornecedor').select('*').order('nome', { ascending: true }),
    ]);

    if (cpRes.data) allCompras.value = cpRes.data as CompraItem[];
    if (clRes.data) allClassificacoes.value = clRes.data as Classificacao[];
    if (foRes.data) allFornecedores.value = foRes.data as Fornecedor[];
  }

  watch(
    () => [authStore.isAuthenticated, authStore.activeTenantId, authStore.breakGlassTenantId],
    () => {
      carregarCompras();
    },
    { immediate: true }
  );

  function normalizarDescricao(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function encontrarOuCriarCompraItem(
    descricao: string,
    classificacaoId?: string,
    quantidade: number = 1,
    urgente: boolean = false,
    controlado: boolean = false,
    origem: 'manual' | 'xml' = 'manual'
  ): CompraItem {
    const norm = normalizarDescricao(descricao);
    const tenantId = authStore.activeTenantId;

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
      existente.atualizado_em = new Date().toISOString();

      if (isLive && authStore.isAuthenticated) {
        supabase
          .from('compra_item')
          .update({
            quantidade: existente.quantidade,
            urgente: existente.urgente,
            controlado: existente.controlado,
            atualizado_em: existente.atualizado_em,
          })
          .eq('id', existente.id)
          .then(() => { });
      }
      return existente;
    }

    const agora = new Date().toISOString();
    const novoItem: CompraItem = {
      id: gerarUuidSeguro(),
      tenant_id: tenantId,
      descricao: descricao.trim(),
      descricao_normalizada: norm,
      classificacao_id: classificacaoId,
      quantidade,
      preco_custo: 0,
      status: 'Aguardando',
      urgente,
      controlado,
      origem,
      atributos: {},
      criado_em: agora,
      atualizado_em: agora,
    };

    allCompras.value.unshift(novoItem);

    if (isLive && authStore.isAuthenticated) {
      supabase
        .from('compra_item')
        .insert({
          id: novoItem.id,
          tenant_id: novoItem.tenant_id,
          descricao: novoItem.descricao,
          descricao_normalizada: novoItem.descricao_normalizada,
          classificacao_id: novoItem.classificacao_id || null,
          quantidade: novoItem.quantidade,
          preco_custo: novoItem.preco_custo,
          status: novoItem.status,
          urgente: novoItem.urgente,
          controlado: novoItem.controlado,
          origem: novoItem.origem,
          atributos: novoItem.atributos,
        })
        .then(() => { });
    }

    return novoItem;
  }

  function atualizarStatus(compraId: string, novoStatus: StatusCompra, onStatusUpdated?: (compraId: string, novoStatus: StatusCompra) => void) {
    const item = allCompras.value.find((c) => c.id === compraId);
    if (item) {
      item.status = novoStatus;
      item.atualizado_em = new Date().toISOString();
      if (isLive && authStore.isAuthenticated) {
        supabase
          .from('compra_item')
          .update({ status: novoStatus, atualizado_em: item.atualizado_em })
          .eq('id', compraId)
          .then(() => { });
      }
      if (onStatusUpdated) {
        onStatusUpdated(compraId, novoStatus);
      }
    }
  }

  function adicionarClassificacao(nome: string) {
    if (!nome.trim()) return;
    const nova: Classificacao = {
      id: gerarUuidSeguro(),
      tenant_id: authStore.activeTenantId,
      nome: nome.trim().toUpperCase(),
      ordem: currentClassificacoes.value.length + 1,
      criado_em: new Date().toISOString(),
    };
    allClassificacoes.value.push(nova);
    if (isLive && authStore.isAuthenticated) {
      supabase
        .from('classificacao')
        .insert({ id: nova.id, tenant_id: nova.tenant_id, nome: nova.nome, ordem: nova.ordem })
        .then(() => { });
    }
  }

  function removerClassificacao(id: string) {
    const idx = allClassificacoes.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      allClassificacoes.value.splice(idx, 1);
      if (isLive && authStore.isAuthenticated) {
        supabase.from('classificacao').delete().eq('id', id).then(() => { });
      }
    }
  }

  function atualizarItemCompra(
    id: string,
    dados: { descricao: string; classificacao_id?: string; quantidade: number }
  ) {
    const original = allCompras.value.find((c) => c.id === id);
    if (!original) return;
    original.descricao = dados.descricao.trim().toUpperCase();
    original.descricao_normalizada = normalizarDescricao(original.descricao);
    original.classificacao_id = dados.classificacao_id;
    original.quantidade = Math.max(1, Number(dados.quantidade) || 1);
    original.atualizado_em = new Date().toISOString();

    if (isLive && authStore.isAuthenticated) {
      supabase
        .from('compra_item')
        .update({
          descricao: original.descricao,
          descricao_normalizada: original.descricao_normalizada,
          classificacao_id: original.classificacao_id || null,
          quantidade: original.quantidade,
          atualizado_em: original.atualizado_em,
        })
        .eq('id', id)
        .then(() => { });
    }
  }

  function removerItemCompra(id: string) {
    allCompras.value = allCompras.value.filter((c) => c.id !== id);
    if (isLive && authStore.isAuthenticated) {
      supabase.from('compra_item').delete().eq('id', id).then(() => { });
    }
  }

  function arquivarChegou(): number {
    const tenantId = authStore.activeTenantId;
    let arquivados = 0;
    const nomesParaMemoria: string[] = [];
    const idsArquivados: string[] = [];
    const agora = new Date().toISOString();

    for (const item of allCompras.value) {
      if (item.tenant_id === tenantId && item.status === 'Chegou' && !item.arquivado_em) {
        item.arquivado_em = agora;
        nomesParaMemoria.push(item.descricao);
        idsArquivados.push(item.id);
        arquivados++;
      }
    }

    if (idsArquivados.length > 0 && isLive && authStore.isAuthenticated) {
      supabase.from('compra_item').update({ arquivado_em: agora }).in('id', idsArquivados).then(() => { });
    }

    if (nomesParaMemoria.length > 0 && typeof localStorage !== 'undefined') {
      try {
        const salvo = JSON.parse(localStorage.getItem('pharma_med_history') || '[]');
        const combinado = Array.from(new Set([...salvo, ...nomesParaMemoria]));
        localStorage.setItem('pharma_med_history', JSON.stringify(combinado));
      } catch {
        // Ignora falha de armazenamento local
      }
    }

    return arquivados;
  }

  function exportarParaCSV(listaCustomizada?: CompraItem[]): string {
    const itens = listaCustomizada || currentCompras.value;
    const tenant = authStore.currentTenant;

    const header = ['Nome', 'Classificação', 'Quantidade', 'Status', 'Urgente'];
    const rows = itens.map((i) => [
      `"${i.descricao.replace(/"/g, '""')}"`,
      `"${(i.classificacao?.nome || 'Geral').replace(/"/g, '""')}"`,
      i.quantidade,
      i.status,
      i.urgente ? 'SIM' : 'NÃO',
    ]);

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
    carregarCompras,
    normalizarDescricao,
    encontrarOuCriarCompraItem,
    atualizarStatus,
    adicionarClassificacao,
    removerClassificacao,
    atualizarItemCompra,
    removerItemCompra,
    arquivarChegou,
    exportarParaCSV,
  };
});
