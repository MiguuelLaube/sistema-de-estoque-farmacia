import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { CompraItem, StatusCompra, Classificacao, Fornecedor } from '../types';
import { initialCompras, initialClassificacoes, initialFornecedores } from '../data/mockData';
import { useAuthStore } from './auth';
import { supabase, isLiveSupabaseConfigured } from '../services/supabase';
import { traduzirErroPersistencia } from '../utils/erroPersistencia';

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
  const isLoading = ref<boolean>(false);
  const erroOperacao = ref<string | null>(null);

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

  /**
   * Carrega compras, classificações e fornecedores sob isolamento RLS multi-tenant
   */
  async function carregarCompras(): Promise<void> {
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

    isLoading.value = true;
    erroOperacao.value = null;

    try {
      const [cpRes, clRes, foRes] = await Promise.all([
        supabase.from('compra_item').select('*').order('criado_em', { ascending: false }),
        supabase.from('classificacao').select('*').order('ordem', { ascending: true }),
        supabase.from('fornecedor').select('*').order('nome', { ascending: true }),
      ]);

      if (cpRes.error) throw cpRes.error;
      if (clRes.error) throw clRes.error;
      if (foRes.error) throw foRes.error;

      if (cpRes.data) allCompras.value = cpRes.data as CompraItem[];
      if (clRes.data) allClassificacoes.value = clRes.data as Classificacao[];
      if (foRes.data) allFornecedores.value = foRes.data as Fornecedor[];
    } catch (err: any) {
      console.error('[ComprasStore] Erro ao carregar itens de compra:', err);
      erroOperacao.value = 'Falha ao sincronizar pedidos de compra com o servidor.';
    } finally {
      isLoading.value = false;
    }
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

  /**
   * Agrupa ou insere um novo item de compra com persistência garantida no Supabase
   */
  async function encontrarOuCriarCompraItem(
    descricao: string,
    classificacaoId?: string,
    quantidade: number = 1,
    urgente: boolean = false,
    controlado: boolean = false,
    origem: 'manual' | 'xml' = 'manual'
  ): Promise<CompraItem> {
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
      const qtdAnterior = existente.quantidade;
      const urgAnterior = existente.urgente;
      const ctrlAnterior = existente.controlado;

      existente.quantidade += quantidade;
      if (urgente) existente.urgente = true;
      if (controlado) existente.controlado = true;
      existente.atualizado_em = new Date().toISOString();

      if (isLive && authStore.isAuthenticated) {
        try {
          const { error } = await supabase
            .from('compra_item')
            .update({
              quantidade: existente.quantidade,
              urgente: existente.urgente,
              controlado: existente.controlado,
              atualizado_em: existente.atualizado_em,
            })
            .eq('id', existente.id);
          if (error) throw error;
        } catch (err) {
          console.error('[ComprasStore] Erro ao atualizar item existente de compra:', err);
          // Rollback
          existente.quantidade = qtdAnterior;
          existente.urgente = urgAnterior;
          existente.controlado = ctrlAnterior;
          const mensagem = traduzirErroPersistencia(err, 'atualizar o item de compra');
          erroOperacao.value = mensagem;
          throw new Error(mensagem);
        }
      }
      return existente;
    }

    const agora = new Date().toISOString();
    const novoItem: CompraItem = {
      id: gerarUuidSeguro(),
      tenant_id: tenantId,
      descricao: descricao.trim().toUpperCase(),
      descricao_normalizada: norm,
      classificacao_id: classificacaoId,
      quantidade: Math.max(1, quantidade),
      preco_custo: 0,
      status: 'Aguardando',
      urgente,
      controlado,
      origem,
      atributos: {},
      criado_em: agora,
      atualizado_em: agora,
    };

    erroOperacao.value = null;
    allCompras.value.unshift(novoItem);

    if (isLive && authStore.isAuthenticated) {
      try {
        await authStore.garantirVinculoBanco();
        novoItem.tenant_id = authStore.activeTenantId;
        const { error } = await supabase.from('compra_item').insert({
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
        });
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Erro ao persistir novo item de compra:', err);
        // Rollback da inserção na UI
        allCompras.value = allCompras.value.filter((cp) => cp.id !== novoItem.id);
        const mensagem = traduzirErroPersistencia(err, 'adicionar o item de compra');
        erroOperacao.value = mensagem;
        throw new Error(mensagem);
      }
    }

    return novoItem;
  }

  /**
   * Atualiza status do item de compra e notifica listener para sincronização com encomendas
   */
  async function atualizarStatus(
    compraId: string,
    novoStatus: StatusCompra,
    onStatusUpdated?: (compraId: string, novoStatus: StatusCompra) => void
  ): Promise<boolean> {
    const item = allCompras.value.find((c) => c.id === compraId);
    if (!item) return false;

    const statusAnterior = item.status;
    const atualizadoEmAnterior = item.atualizado_em;
    const agora = new Date().toISOString();

    item.status = novoStatus;
    item.atualizado_em = agora;

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('compra_item')
          .update({ status: novoStatus, atualizado_em: agora })
          .eq('id', compraId);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Erro ao sincronizar status de compra:', err);
        item.status = statusAnterior;
        item.atualizado_em = atualizadoEmAnterior;
        return false;
      }
    }

    if (onStatusUpdated) {
      try {
        onStatusUpdated(compraId, novoStatus);
      } catch (e) {
        console.error('[ComprasStore] Erro no callback onStatusUpdated:', e);
      }
    }
    return true;
  }

  /**
   * Alterna urgência do item e persiste no Supabase (evita perda de dados ao recarregar a tela)
   */
  async function alternarUrgencia(compraId: string): Promise<boolean> {
    const item = allCompras.value.find((c) => c.id === compraId);
    if (!item) return false;

    const anterior = item.urgente;
    item.urgente = !anterior;
    const agora = new Date().toISOString();
    item.atualizado_em = agora;

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('compra_item')
          .update({ urgente: item.urgente, atualizado_em: agora })
          .eq('id', compraId);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Erro ao salvar urgência:', err);
        item.urgente = anterior;
        return false;
      }
    }
    return true;
  }

  /**
   * Adiciona uma nova categoria/classificação de medicamentos
   */
  async function adicionarClassificacao(nome: string): Promise<Classificacao | null> {
    const cleanNome = nome.trim().toUpperCase();
    if (!cleanNome) return null;

    erroOperacao.value = null;
    const nova: Classificacao = {
      id: gerarUuidSeguro(),
      tenant_id: authStore.activeTenantId,
      nome: cleanNome,
      ordem: currentClassificacoes.value.length + 1,
      criado_em: new Date().toISOString(),
    };

    allClassificacoes.value.push(nova);

    if (isLive && authStore.isAuthenticated) {
      try {
        await authStore.garantirVinculoBanco();
        nova.tenant_id = authStore.activeTenantId;
        const { error } = await supabase.from('classificacao').insert({
          id: nova.id,
          tenant_id: nova.tenant_id,
          nome: nova.nome,
          ordem: nova.ordem,
        });
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Falha ao adicionar classificação no banco:', err);
        allClassificacoes.value = allClassificacoes.value.filter((c) => c.id !== nova.id);
        erroOperacao.value = traduzirErroPersistencia(err, 'cadastrar a categoria');
        return null;
      }
    }

    return nova;
  }

  /**
   * Remove uma classificação existente
   */
  async function removerClassificacao(id: string): Promise<boolean> {
    const idx = allClassificacoes.value.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    const removida = allClassificacoes.value[idx];
    allClassificacoes.value.splice(idx, 1);

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('classificacao').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Falha ao excluir classificação no banco:', err);
        erroOperacao.value = traduzirErroPersistencia(err, 'excluir a categoria');
        allClassificacoes.value.splice(idx, 0, removida);
        return false;
      }
    }
    return true;
  }

  /**
   * Atualiza os dados de um item de compra
   */
  async function atualizarItemCompra(
    id: string,
    dados: { descricao: string; classificacao_id?: string; quantidade: number }
  ): Promise<boolean> {
    const original = allCompras.value.find((c) => c.id === id);
    if (!original) return false;

    const descAnterior = original.descricao;
    const normAnterior = original.descricao_normalizada;
    const classAnterior = original.classificacao_id;
    const qtdAnterior = original.quantidade;
    const agora = new Date().toISOString();

    original.descricao = dados.descricao.trim().toUpperCase();
    original.descricao_normalizada = normalizarDescricao(original.descricao);
    original.classificacao_id = dados.classificacao_id;
    original.quantidade = Math.max(1, Number(dados.quantidade) || 1);
    original.atualizado_em = agora;

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('compra_item')
          .update({
            descricao: original.descricao,
            descricao_normalizada: original.descricao_normalizada,
            classificacao_id: original.classificacao_id || null,
            quantidade: original.quantidade,
            atualizado_em: agora,
          })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Erro ao salvar edição do item de compra:', err);
        original.descricao = descAnterior;
        original.descricao_normalizada = normAnterior;
        original.classificacao_id = classAnterior;
        original.quantidade = qtdAnterior;
        return false;
      }
    }
    return true;
  }

  /**
   * Remove item da lista de compras
   */
  async function removerItemCompra(id: string): Promise<boolean> {
    const item = allCompras.value.find((c) => c.id === id);
    if (!item) return false;

    allCompras.value = allCompras.value.filter((c) => c.id !== id);

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('compra_item').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Falha ao deletar item de compra:', err);
        allCompras.value.unshift(item);
        return false;
      }
    }
    return true;
  }

  /**
   * Arquiva itens que já chegaram na farmácia e grava no vocabulário preditivo local
   */
  async function arquivarChegou(): Promise<number> {
    const tenantId = authStore.activeTenantId;
    let arquivados = 0;
    const nomesParaMemoria: string[] = [];
    const idsArquivados: string[] = [];
    const itensModificados: { item: CompraItem; arquivado_em_antigo?: string | null }[] = [];
    const agora = new Date().toISOString();

    for (const item of allCompras.value) {
      if (item.tenant_id === tenantId && item.status === 'Chegou' && !item.arquivado_em) {
        itensModificados.push({ item, arquivado_em_antigo: item.arquivado_em });
        item.arquivado_em = agora;
        nomesParaMemoria.push(item.descricao);
        idsArquivados.push(item.id);
        arquivados++;
      }
    }

    if (idsArquivados.length > 0 && isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('compra_item')
          .update({ arquivado_em: agora })
          .in('id', idsArquivados);
        if (error) throw error;
      } catch (err) {
        console.error('[ComprasStore] Erro ao arquivar itens que chegaram:', err);
        // Rollback
        for (const mod of itensModificados) {
          mod.item.arquivado_em = mod.arquivado_em_antigo || null;
        }
        return 0;
      }
    }

    if (nomesParaMemoria.length > 0 && typeof localStorage !== 'undefined') {
      try {
        const salvo = JSON.parse(localStorage.getItem('pharma_med_history') || '[]');
        const combinado = Array.from(new Set([...salvo, ...nomesParaMemoria]));
        localStorage.setItem('pharma_med_history', JSON.stringify(combinado));
      } catch {
        // Ignora falha de armazenamento local não-crítico
      }
    }

    return arquivados;
  }

  /**
   * Exporta itens de compra para formato CSV legível no Excel
   */
  function exportarParaCSV(listaCustomizada?: CompraItem[]): string {
    const itens = listaCustomizada || currentCompras.value;
    const tenant = authStore.currentTenant;
    const tenantSlug = tenant?.slug || 'farmacia';

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
    link.setAttribute('download', `pedidos_compra_${tenantSlug}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return `Exportação concluída (${itens.length} itens)`;
  }

  return {
    allCompras,
    allClassificacoes,
    allFornecedores,
    isLoading,
    erroOperacao,
    currentClassificacoes,
    currentFornecedores,
    currentCompras,
    comprasPorClassificacao,
    carregarCompras,
    normalizarDescricao,
    encontrarOuCriarCompraItem,
    atualizarStatus,
    alternarUrgencia,
    adicionarClassificacao,
    removerClassificacao,
    atualizarItemCompra,
    removerItemCompra,
    arquivarChegou,
    exportarParaCSV,
  };
});
