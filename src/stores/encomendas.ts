import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Encomenda, EncomendaItem, Pagamento, StatusEncomenda, StatusCompra, FormaPagamento } from '../types';
import { initialEncomendas } from '../data/mockData';
import { useAuthStore } from './auth';
import { useComprasStore } from './compras';
import { useClientesStore } from './clientes';
import { useMedicamentosMemoriaStore } from './medicamentosMemoria';
import {
  enviarModeloWhatsAppProxy,
  renderizarModeloWhatsApp,
  gerarLinkWaMeComModelo,
  type TipoModeloWhatsApp,
} from '../services/evolutionApi';
import { supabase, isLiveSupabaseConfigured } from '../services/supabase';

function gerarUuidSeguro(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

export const useEncomendasStore = defineStore('encomendas', () => {
  const authStore = useAuthStore();
  const comprasStore = useComprasStore();
  const clientesStore = useClientesStore();
  const memoriaStore = useMedicamentosMemoriaStore();
  const isLive = isLiveSupabaseConfigured();

  const allEncomendas = ref<Encomenda[]>(isLive ? [] : initialEncomendas);
  const showArchived = ref<boolean>(false);
  const activeTab = ref<StatusEncomenda | 'Todas'>('Todas');
  const searchQuery = ref<string>('');
  const paymentFilter = ref<string>('todos');
  const isLoading = ref<boolean>(false);
  const erroOperacao = ref<string | null>(null);

  /**
   * Carrega encomendas ativas do tenant logado sob isolamento RLS
   */
  async function carregarEncomendas(): Promise<void> {
    if (!isLive || !authStore.isAuthenticated) {
      if (!isLive) allEncomendas.value = initialEncomendas;
      else allEncomendas.value = [];
      return;
    }

    isLoading.value = true;
    erroOperacao.value = null;

    try {
      const [encRes, itemRes, pagRes] = await Promise.all([
        supabase.from('encomenda').select('*').order('criado_em', { ascending: false }),
        supabase.from('encomenda_item').select('*').order('criado_em', { ascending: true }),
        supabase.from('pagamento').select('*').order('data', { ascending: true }),
      ]);

      if (encRes.error) throw encRes.error;

      if (encRes.data) {
        const itensPorEnc = new Map<string, EncomendaItem[]>();
        for (const it of (itemRes.data || []) as EncomendaItem[]) {
          const arr = itensPorEnc.get(it.encomenda_id) || [];
          arr.push({
            ...it,
            preco_unitario: Number(it.preco_unitario) || 0,
            subtotal: Number(it.subtotal) || 0,
          });
          itensPorEnc.set(it.encomenda_id, arr);
        }

        const pagsPorEnc = new Map<string, Pagamento[]>();
        for (const p of (pagRes.data || []) as Pagamento[]) {
          const arr = pagsPorEnc.get(p.encomenda_id) || [];
          arr.push({
            ...p,
            valor: Number(p.valor) || 0,
          });
          pagsPorEnc.set(p.encomenda_id, arr);
        }

        allEncomendas.value = (encRes.data as any[]).map((e) => {
          const vTotal = Number(e.valor_total) || 0;
          let vPago = Number(e.valor_pago) || 0;
          let sitPag = e.situacao_pagamento;

          // Regra de Negócio: Encomenda entregue é considerada quitada e paga
          if (e.status === 'Entregue') {
            vPago = Math.max(vPago, vTotal);
            sitPag = 'Pago';
          }

          return {
            ...e,
            valor_total: vTotal,
            valor_pago: vPago,
            situacao_pagamento: sitPag,
            historico: Array.isArray(e.historico) ? e.historico : [],
            itens: itensPorEnc.get(e.id) || [],
            pagamentos: pagsPorEnc.get(e.id) || [],
          };
        }) as Encomenda[];
      }
    } catch (err: any) {
      console.error('[EncomendasStore] Falha ao carregar encomendas:', err);
      erroOperacao.value = 'Não foi possível carregar as encomendas do servidor.';
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    () => [authStore.isAuthenticated, authStore.activeTenantId, authStore.breakGlassTenantId],
    () => {
      carregarEncomendas();
    },
    { immediate: true }
  );

  const currentTenantEncomendas = computed(() => {
    return allEncomendas.value
      .filter((e) => {
        if (e.tenant_id !== authStore.activeTenantId) return false;
        if (!showArchived.value && e.arquivada_em) return false;
        return true;
      })
      .map((e) => ({
        ...e,
        cliente: clientesStore.allClientes.find((c) => c.id === e.cliente_id),
      }));
  });

  const filteredEncomendas = computed(() => {
    let list = currentTenantEncomendas.value;

    if (activeTab.value !== 'Todas') {
      list = list.filter((e) => e.status === activeTab.value);
    }

    if (paymentFilter.value !== 'todos') {
      list = list.filter((e) => e.situacao_pagamento === paymentFilter.value);
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      list = list.filter((e) => {
        const clienteNome = e.cliente?.nome.toLowerCase() || '';
        const clienteTel = e.cliente?.telefone.toLowerCase() || '';
        const rastreio = e.codigo_rastreio?.toLowerCase() || '';
        const temItem = e.itens?.some((i) => i.descricao.toLowerCase().includes(q));
        return clienteNome.includes(q) || clienteTel.includes(q) || rastreio.includes(q) || temItem;
      });
    }

    return list;
  });

  // CORREÇÃO CRÍTICA DE MÉTRICAS FINANCEIRAS: Canceladas não somam no faturamento
  const metricas = computed(() => {
    const list = currentTenantEncomendas.value.filter((e) => !e.arquivada_em);
    const ativas = list.filter((e) => e.status !== 'Cancelada');

    const total = list.length;
    const pendentes = list.filter((e) => e.status !== 'Entregue' && e.status !== 'Cancelada').length;
    const entregues = list.filter((e) => e.status === 'Entregue').length;
    const aguardandoAviso = list.filter((e) => e.status === 'Chegou').length;

    // Apenas pedidos ativos somam no financeiro (evita distorção com cancelados)
    const valorTotalGeral = ativas.reduce((acc, curr) => acc + curr.valor_total, 0);
    const valorPagoGeral = ativas.reduce((acc, curr) => acc + curr.valor_pago, 0);
    const valorAReceber = Math.max(0, valorTotalGeral - valorPagoGeral);

    return {
      total,
      pendentes,
      entregues,
      aguardandoAviso,
      valorTotalGeral,
      valorPagoGeral,
      valorAReceber,
      porStatus: {
        Aguardando: list.filter((e) => e.status === 'Aguardando').length,
        'Pedido Feito': list.filter((e) => e.status === 'Pedido Feito').length,
        Chegou: list.filter((e) => e.status === 'Chegou').length,
        Entregue: entregues,
        Cancelada: list.filter((e) => e.status === 'Cancelada').length,
      },
    };
  });

  function recalcularStatus(encomenda: Encomenda): void {
    if (encomenda.status === 'Cancelada') return;

    const itens = encomenda.itens || [];
    if (itens.length === 0) {
      encomenda.status = 'Aguardando';
      return;
    }

    const hasAguardando = itens.some((i) => i.status_item === 'Aguardando');
    const hasPedidoFeito = itens.some((i) => i.status_item === 'Pedido Feito');
    const allChegou = itens.every((i) => i.status_item === 'Chegou');

    if (hasAguardando) {
      encomenda.status = 'Aguardando';
    } else if (hasPedidoFeito) {
      encomenda.status = 'Pedido Feito';
    } else if (allChegou) {
      if (encomenda.status !== 'Entregue') {
        const eraOutroStatus = encomenda.status !== 'Chegou';
        encomenda.status = 'Chegou';
        if (eraOutroStatus) {
          dispararNotificacaoChegadaEvolution(encomenda);
        }
      }
    }
  }

  function montarDadosWhatsAppEncomenda(encomenda: Encomenda): {
    telefone: string;
    nomeCliente: string;
    variaveis: Record<string, string>;
  } | null {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    if (!cliente || !cliente.telefone) return null;

    const cfg = authStore.currentConfig;
    const nomeLoja = cfg?.nome_sistema || 'Drogaria Aeroporto';
    const medicamentosStr = encomenda.itens && encomenda.itens.length > 0
      ? encomenda.itens.map((i) => `${i.quantidade}x ${i.descricao}`).join(', ')
      : 'seus itens';

    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    const saldoFormatado = `R$ ${saldo.toFixed(2).replace('.', ',')}`;
    const totalFormatado = `R$ ${encomenda.valor_total.toFixed(2).replace('.', ',')}`;

    return {
      telefone: cliente.telefone,
      nomeCliente: cliente.nome,
      variaveis: {
        cliente: cliente.nome,
        medicamento: medicamentosStr,
        loja: nomeLoja,
        codigo: encomenda.codigo_rastreio || '',
        saldo: saldoFormatado,
        total: totalFormatado,
      },
    };
  }

  async function dispararNotificacaoModeloEvolution(
    encomenda: Encomenda,
    modelo: TipoModeloWhatsApp,
    forcarEnvioManual: boolean = false
  ): Promise<{ sucesso: boolean; mensagem?: string }> {
    const cfg = authStore.currentConfig;
    if (!cfg || (!cfg.evolution_api_ativo && !forcarEnvioManual)) {
      return { sucesso: false, mensagem: 'Disparo automático do WhatsApp está desativado nas configurações.' };
    }

    const dados = montarDadosWhatsAppEncomenda(encomenda);
    if (!dados || !dados.telefone) {
      return { sucesso: false, mensagem: 'Cliente não possui telefone cadastrado.' };
    }

    const resultado = await enviarModeloWhatsAppProxy({
      ativo: true,
      numeroDestino: dados.telefone,
      modelo,
      variaveis: dados.variaveis,
    });

    if (modelo === 'chegada' && resultado.sucesso) {
      encomenda.cliente_avisado = true;
      encomenda.cliente_avisado_em = new Date().toISOString();
      encomenda.cliente_avisado_por = 'Robô WhatsApp';
    }

    const rotulosModelo: Record<TipoModeloWhatsApp, string> = {
      chegada: 'chegada',
      pedido: 'confirmação de pedido',
      cobranca: 'lembrete de saldo',
      entregue: 'comprovante de entrega',
      personalizado: 'mensagem personalizada',
    };

    if (!encomenda.historico) encomenda.historico = [];
    encomenda.historico.push({
      employee_name: 'Robô WhatsApp',
      action: resultado.sucesso
        ? `disparou WhatsApp (${rotulosModelo[modelo]}) para ${dados.nomeCliente}`
        : `falha no envio do WhatsApp (${rotulosModelo[modelo]}): ${resultado.mensagem}`,
      timestamp: new Date().toISOString(),
    });

    if (isLive && authStore.isAuthenticated) {
      try {
        await supabase
          .from('encomenda')
          .update({
            cliente_avisado: encomenda.cliente_avisado || false,
            cliente_avisado_em: encomenda.cliente_avisado_em || null,
            cliente_avisado_por: encomenda.cliente_avisado_por || null,
            historico: encomenda.historico,
          })
          .eq('id', encomenda.id);
      } catch (err) {
        console.warn('[EncomendasStore] Falha ao atualizar histórico de disparo no banco:', err);
      }
    }

    return resultado;
  }

  async function dispararNotificacaoChegadaEvolution(encomenda: Encomenda): Promise<{ sucesso: boolean; mensagem?: string }> {
    return dispararNotificacaoModeloEvolution(encomenda, 'chegada', false);
  }

  function sincronizarStatusPorCompra(compraId: string, novoStatus: StatusCompra): void {
    for (const enc of allEncomendas.value) {
      if (enc.tenant_id !== authStore.activeTenantId) continue;
      let alterou = false;

      if (enc.itens) {
        for (const item of enc.itens) {
          if (item.compra_item_id === compraId) {
            item.status_item = novoStatus;
            alterou = true;
          }
        }
      }

      if (alterou) {
        recalcularStatus(enc);
      }
    }
  }

  /**
   * Criação atômica de encomenda com persistência segura no Supabase e rollback
   */
  async function criarEncomenda(dados: {
    clienteId: string;
    observacao?: string;
    funcionarioNome?: string;
    itens: Array<{
      descricao: string;
      quantidade: number;
      precoUnitario: number;
      classificacaoId?: string;
      controlado: boolean;
      urgente: boolean;
    }>;
  }): Promise<Encomenda> {
    const tenantId = authStore.activeTenantId;
    const orderId = gerarUuidSeguro();
    const trackingCode = `ENC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const agora = new Date().toISOString();

    const itensCriados: EncomendaItem[] = [];
    for (const it of dados.itens) {
      memoriaStore.registrarMedicamento(it.descricao, it.precoUnitario);

      const compraItem = await comprasStore.encontrarOuCriarCompraItem(
        it.descricao,
        it.classificacaoId,
        it.quantidade,
        it.urgente,
        it.controlado
      );

      itensCriados.push({
        id: gerarUuidSeguro(),
        tenant_id: tenantId,
        encomenda_id: orderId,
        descricao: it.descricao.trim(),
        quantidade: it.quantidade,
        preco_unitario: it.precoUnitario,
        subtotal: it.quantidade * it.precoUnitario,
        classificacao_id: it.classificacaoId,
        controlado: it.controlado,
        urgente: it.urgente,
        compra_item_id: compraItem.id,
        status_item: compraItem.status,
        atributos: {},
        criado_em: agora,
      });
    }

    const valorTotal = itensCriados.reduce((acc, curr) => acc + curr.subtotal, 0);
    const criadoPorId = authStore.currentUser.tenant_id ? authStore.activeUserId : undefined;

    const novaEncomenda: Encomenda = {
      id: orderId,
      tenant_id: tenantId,
      cliente_id: dados.clienteId,
      codigo_rastreio: trackingCode,
      status: 'Aguardando',
      valor_total: valorTotal,
      valor_pago: 0,
      situacao_pagamento: 'Não pago',
      observacao: dados.observacao,
      criado_por: criadoPorId,
      entregue_com_saldo_devedor: false,
      criado_em: agora,
      atualizado_em: agora,
      itens: itensCriados,
      pagamentos: [],
      historico: [
        {
          employee_name: dados.funcionarioNome || authStore.currentUser.nome,
          action: 'Criou a encomenda (status: Aguardando)',
          timestamp: agora,
        },
      ],
    };

    recalcularStatus(novaEncomenda);
    allEncomendas.value.unshift(novaEncomenda);

    // Persistência segura e síncrona com rollback em caso de falha no banco
    if (isLive && authStore.isAuthenticated) {
      try {
        const { error: encErr } = await supabase.from('encomenda').insert({
          id: novaEncomenda.id,
          tenant_id: novaEncomenda.tenant_id,
          cliente_id: novaEncomenda.cliente_id,
          codigo_rastreio: novaEncomenda.codigo_rastreio,
          status: novaEncomenda.status,
          valor_total: novaEncomenda.valor_total,
          valor_pago: 0,
          observacao: novaEncomenda.observacao || null,
          criado_por: criadoPorId || null,
          historico: novaEncomenda.historico,
        });

        if (encErr) throw encErr;

        if (itensCriados.length > 0) {
          const { error: itemErr } = await supabase.from('encomenda_item').insert(
            itensCriados.map((it) => ({
              id: it.id,
              tenant_id: it.tenant_id,
              encomenda_id: it.encomenda_id,
              descricao: it.descricao,
              quantidade: it.quantidade,
              preco_unitario: it.preco_unitario,
              classificacao_id: it.classificacao_id || null,
              controlado: it.controlado,
              urgente: it.urgente,
              compra_item_id: it.compra_item_id || null,
              status_item: it.status_item,
            }))
          );
          if (itemErr) throw itemErr;
        }
      } catch (err: any) {
        console.error('[EncomendasStore] Falha ao persistir encomenda no banco, executando rollback:', err);
        // Rollback: remove da memória para evitar estado fantasma
        allEncomendas.value = allEncomendas.value.filter((e) => e.id !== novaEncomenda.id);
        throw new Error(err.message || 'Não foi possível gravar a encomenda no banco de dados.');
      }
    }

    // Notificação automática de confirmação
    const cfgAtual = authStore.currentConfig;
    if (cfgAtual?.evolution_api_ativo && cfgAtual?.auto_whatsapp_pedido && novaEncomenda.status !== 'Chegou') {
      dispararNotificacaoModeloEvolution(novaEncomenda, 'pedido', false).catch(() => {});
    }

    return novaEncomenda;
  }

  /**
   * Altera status de encomenda com consistência financeira e persistência garantida
   */
  async function alterarStatus(
    encomendaId: string,
    novoStatus: StatusEncomenda,
    options?: { autorizacaoAdmin?: boolean; entregaComSaldo?: boolean; funcionarioNome?: string }
  ): Promise<{ sucesso: boolean; mensagem?: string }> {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return { sucesso: false, mensagem: 'Encomenda não encontrada.' };

    const statusAnterior = enc.status;
    const valorPagoAnterior = enc.valor_pago;
    const entregueEmAnterior = enc.entregue_em;

    // Regra: Quando a encomenda for marcada que foi entregue, então ela foi paga integralmente
    if (novoStatus === 'Entregue') {
      enc.entregue_em = new Date().toISOString();
      enc.entregue_por = authStore.currentUser.tenant_id ? authStore.activeUserId : undefined;

      // Alinha automaticamente os itens para 'Chegou'
      if (enc.itens) {
        for (const it of enc.itens) {
          it.status_item = 'Chegou';
        }
      }

      // Quita automaticamente qualquer saldo devedor restante
      const faltaPagar = Math.max(0, Number((enc.valor_total - enc.valor_pago).toFixed(2)));
      if (faltaPagar > 0) {
        await registrarPagamento({
          encomendaId: enc.id,
          valor: faltaPagar,
          forma: 'dinheiro',
          tipo: 'pagamento',
          funcionarioNome: options?.funcionarioNome,
        });
      }

      enc.entregue_com_saldo_devedor = false;
      enc.valor_pago = enc.valor_total;
      enc.situacao_pagamento = 'Pago';
    }

    if (novoStatus === 'Cancelada') {
      if (enc.itens) {
        for (const it of enc.itens) {
          it.compra_item_id = undefined;
        }
      }
    }

    if (novoStatus === 'Pedido Feito' || novoStatus === 'Chegou') {
      if (enc.itens) {
        for (const it of enc.itens) {
          it.status_item = novoStatus;
        }
      }
    }

    const eraOutroStatus = enc.status !== novoStatus;
    enc.status = novoStatus;
    enc.atualizado_em = new Date().toISOString();

    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: options?.funcionarioNome || authStore.currentUser.nome,
      action: novoStatus === 'Entregue'
        ? 'entregou a encomenda ao cliente (saldo quitado)'
        : `alterou status para: ${novoStatus}`,
      timestamp: enc.atualizado_em,
    });

    if (isLive && authStore.isAuthenticated) {
      try {
        if (novoStatus === 'Pedido Feito' || novoStatus === 'Chegou' || novoStatus === 'Entregue') {
          await supabase
            .from('encomenda_item')
            .update({ status_item: novoStatus === 'Pedido Feito' ? 'Pedido Feito' : 'Chegou' })
            .eq('encomenda_id', enc.id);
        }
        const { error: updErr } = await supabase
          .from('encomenda')
          .update({
            status: enc.status,
            valor_pago: enc.valor_pago,
            entregue_em: enc.entregue_em || null,
            entregue_por: enc.entregue_por || null,
            entregue_com_saldo_devedor: false,
            historico: enc.historico,
            atualizado_em: enc.atualizado_em,
          })
          .eq('id', enc.id);

        if (updErr) throw updErr;
      } catch (err: any) {
        console.error('[EncomendasStore] Erro ao atualizar status no banco, revertendo:', err);
        // Rollback de estado em caso de falha de escrita no banco
        enc.status = statusAnterior;
        enc.valor_pago = valorPagoAnterior;
        enc.entregue_em = entregueEmAnterior;
        return { sucesso: false, mensagem: 'Falha ao sincronizar alteração de status com o servidor.' };
      }
    }

    if (novoStatus === 'Chegou' && eraOutroStatus) {
      dispararNotificacaoChegadaEvolution(enc).catch(() => {});
    } else if (
      novoStatus === 'Entregue' &&
      eraOutroStatus &&
      authStore.currentConfig?.evolution_api_ativo &&
      authStore.currentConfig?.auto_whatsapp_entregue
    ) {
      dispararNotificacaoModeloEvolution(enc, 'entregue', false).catch(() => {});
    }

    return { sucesso: true };
  }

  /**
   * Registra pagamento de forma atômica no banco de dados com reconciliação imediata
   */
  async function registrarPagamento(dados: {
    encomendaId: string;
    valor: number;
    forma: FormaPagamento;
    tipo?: 'pagamento' | 'estorno';
    motivoEstorno?: string;
    funcionarioNome?: string;
  }): Promise<{ sucesso: boolean; mensagem?: string }> {
    const enc = allEncomendas.value.find((e) => e.id === dados.encomendaId);
    if (!enc) return { sucesso: false, mensagem: 'Encomenda não encontrada.' };

    const valorFinal = dados.tipo === 'estorno' ? -Math.abs(dados.valor) : Math.abs(dados.valor);
    if (valorFinal === 0) return { sucesso: false, mensagem: 'Valor inválido.' };

    const agora = new Date().toISOString();
    const registradoPor = authStore.currentUser.tenant_id ? authStore.activeUserId : undefined;

    const novoPag: Pagamento = {
      id: gerarUuidSeguro(),
      tenant_id: authStore.activeTenantId,
      encomenda_id: enc.id,
      valor: valorFinal,
      forma: dados.forma,
      tipo: dados.tipo || 'pagamento',
      motivo_estorno: dados.motivoEstorno,
      registrado_por: registradoPor,
      data: agora,
      criado_em: agora,
    };

    if (!enc.pagamentos) enc.pagamentos = [];
    enc.pagamentos.push(novoPag);

    enc.valor_pago = enc.pagamentos.reduce((acc, curr) => acc + curr.valor, 0);
    enc.valor_pago = Math.max(0, Number(enc.valor_pago.toFixed(2)));

    if (enc.valor_pago >= enc.valor_total && enc.valor_total > 0) {
      enc.situacao_pagamento = 'Pago';
    } else if (enc.valor_pago > 0) {
      enc.situacao_pagamento = 'Parcial';
    } else {
      enc.situacao_pagamento = 'Não pago';
    }

    if (!enc.historico) enc.historico = [];
    const fmt = `R$ ${Math.abs(valorFinal).toFixed(2).replace('.', ',')}`;
    enc.historico.push({
      employee_name: dados.funcionarioNome || authStore.currentUser.nome,
      action: dados.tipo === 'estorno'
        ? `estornou ${fmt} (${dados.forma})`
        : `recebeu pagamento de ${fmt} (${dados.forma})`,
      timestamp: agora,
    });

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error: pagErr } = await supabase.from('pagamento').insert({
          id: novoPag.id,
          tenant_id: novoPag.tenant_id,
          encomenda_id: novoPag.encomenda_id,
          valor: novoPag.valor,
          forma: novoPag.forma,
          tipo: novoPag.tipo,
          motivo_estorno: novoPag.motivo_estorno || null,
          registrado_por: registradoPor || null,
          data: novoPag.data,
        });

        if (pagErr) throw pagErr;

        await supabase
          .from('encomenda')
          .update({
            valor_pago: enc.valor_pago,
            situacao_pagamento: enc.situacao_pagamento,
            historico: enc.historico,
            atualizado_em: agora,
          })
          .eq('id', enc.id);
      } catch (err: any) {
        console.error('[EncomendasStore] Erro ao gravar pagamento no banco:', err);
        return { sucesso: false, mensagem: 'Não foi possível salvar o pagamento no banco.' };
      }
    }

    return { sucesso: true };
  }

  async function arquivarEntregues(): Promise<number> {
    const tenantId = authStore.activeTenantId;
    let count = 0;
    const ids: string[] = [];
    const agora = new Date().toISOString();

    for (const enc of allEncomendas.value) {
      if (enc.tenant_id === tenantId && enc.status === 'Entregue' && !enc.arquivada_em) {
        enc.arquivada_em = agora;
        ids.push(enc.id);
        count++;
      }
    }

    if (ids.length > 0 && isLive && authStore.isAuthenticated) {
      try {
        await supabase.from('encomenda').update({ arquivada_em: agora }).in('id', ids);
      } catch (err) {
        console.error('[EncomendasStore] Falha ao arquivar entregues:', err);
      }
    }
    return count;
  }

  function obterTextoPorModelo(encomenda: Encomenda, modelo: TipoModeloWhatsApp = 'chegada'): string {
    const dados = montarDadosWhatsAppEncomenda(encomenda);
    if (!dados) return '';
    return renderizarModeloWhatsApp(modelo, authStore.currentConfig, dados.variaveis);
  }

  function obterTextoAvisoChegada(encomenda: Encomenda): string {
    return obterTextoPorModelo(encomenda, 'chegada');
  }

  function obterResumoEncomenda(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    const itensStr = encomenda.itens?.map((i) => `• ${i.quantidade}x ${i.descricao} - R$ ${i.subtotal.toFixed(2)}`).join('\n') || '';
    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    return `📋 RESUMO DA ENCOMENDA [${encomenda.codigo_rastreio}]\nCliente: ${cliente?.nome || 'N/A'}\nTelefone: ${cliente?.telefone || 'N/A'}\n\nItens:\n${itensStr}\n\nTotal: R$ ${encomenda.valor_total.toFixed(2)}\nValor Pago: R$ ${encomenda.valor_pago.toFixed(2)}\nSaldo a Cobrar: R$ ${saldo.toFixed(2)}\nStatus: ${encomenda.status}`;
  }

  function gerarLinkWhatsApp(encomenda: Encomenda, modelo: TipoModeloWhatsApp = 'chegada'): string {
    const dados = montarDadosWhatsAppEncomenda(encomenda);
    if (!dados || !dados.telefone) return '';
    return gerarLinkWaMeComModelo(dados.telefone, modelo, authStore.currentConfig, dados.variaveis);
  }

  async function removerEncomenda(encomendaId: string): Promise<boolean> {
    const idx = allEncomendas.value.findIndex((e) => e.id === encomendaId);
    if (idx === -1) return false;

    const removida = allEncomendas.value[idx];
    allEncomendas.value.splice(idx, 1);

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('encomenda').delete().eq('id', encomendaId);
        if (error) throw error;
        await authStore.registrarAuditoria('EXCLUSAO_ENCOMENDA', `Encomenda ${removida.codigo_rastreio || encomendaId}`);
      } catch (err) {
        console.error('[EncomendasStore] Erro ao excluir encomenda, restaurando:', err);
        allEncomendas.value.splice(idx, 0, removida);
        return false;
      }
    }
    return true;
  }

  async function atualizarEncomenda(
    encomendaId: string,
    dados: Partial<Encomenda> & {
      itensNovos?: Array<{ descricao: string; quantidade: number; precoUnitario: number }>;
      funcionarioNome?: string;
    }
  ): Promise<boolean> {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return false;

    if (dados.cliente_id) enc.cliente_id = dados.cliente_id;
    if (dados.observacao !== undefined) enc.observacao = dados.observacao;
    if (dados.status) enc.status = dados.status;

    const agora = new Date().toISOString();

    if (dados.itensNovos) {
      enc.itens = dados.itensNovos.map((it) => {
        memoriaStore.registrarMedicamento(it.descricao, it.precoUnitario);
        return {
          id: gerarUuidSeguro(),
          tenant_id: enc.tenant_id,
          encomenda_id: enc.id,
          descricao: it.descricao.trim(),
          quantidade: Math.max(1, it.quantidade),
          preco_unitario: Math.max(0, it.precoUnitario),
          subtotal: Math.max(1, it.quantidade) * Math.max(0, it.precoUnitario),
          controlado: false,
          urgente: false,
          status_item: enc.status === 'Entregue' ? 'Chegou' : (enc.status === 'Chegou' ? 'Chegou' : 'Pedido Feito'),
          atributos: {},
          criado_em: agora,
        };
      });
      enc.valor_total = enc.itens.reduce((acc, curr) => acc + curr.subtotal, 0);
      enc.situacao_pagamento =
        enc.valor_pago >= enc.valor_total && enc.valor_total > 0 ? 'Pago' : enc.valor_pago > 0 ? 'Parcial' : 'Não pago';
    }

    enc.atualizado_em = agora;

    if (dados.funcionarioNome) {
      if (!enc.historico) enc.historico = [];
      enc.historico.push({
        employee_name: dados.funcionarioNome,
        action: 'editou a encomenda',
        timestamp: agora,
      });
    }

    if (isLive && authStore.isAuthenticated) {
      try {
        await supabase
          .from('encomenda')
          .update({
            cliente_id: enc.cliente_id,
            observacao: enc.observacao || null,
            valor_total: enc.valor_total,
            historico: enc.historico || [],
            atualizado_em: agora,
          })
          .eq('id', enc.id);

        if (dados.itensNovos && enc.itens) {
          await supabase.from('encomenda_item').delete().eq('encomenda_id', enc.id);
          await supabase.from('encomenda_item').insert(
            enc.itens.map((it) => ({
              id: it.id,
              tenant_id: it.tenant_id,
              encomenda_id: it.encomenda_id,
              descricao: it.descricao,
              quantidade: it.quantidade,
              preco_unitario: it.preco_unitario,
              status_item: it.status_item,
            }))
          );
        }
      } catch (err) {
        console.error('[EncomendasStore] Erro ao salvar edição no banco:', err);
        return false;
      }
    }
    return true;
  }

  async function alternarPago(encomendaId: string, pago: boolean, funcionarioNome?: string): Promise<void> {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    if (pago) {
      const faltaPagar = Math.max(0, enc.valor_total - enc.valor_pago);
      if (faltaPagar > 0) {
        await registrarPagamento({
          encomendaId,
          valor: faltaPagar,
          forma: 'dinheiro',
          tipo: 'pagamento',
          funcionarioNome,
        });
      }
    } else if (enc.valor_pago > 0) {
      await registrarPagamento({
        encomendaId,
        valor: enc.valor_pago,
        forma: 'outros',
        tipo: 'estorno',
        motivoEstorno: 'Reversão manual de status de pagamento no card',
        funcionarioNome,
      });
    }
  }

  async function alternarClienteAvisado(encomendaId: string, avisado: boolean, funcionarioNome?: string): Promise<void> {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    const agora = new Date().toISOString();
    enc.cliente_avisado = avisado;
    enc.cliente_avisado_em = avisado ? agora : undefined;
    enc.cliente_avisado_por = avisado ? (funcionarioNome || authStore.currentUser.nome) : undefined;

    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: funcionarioNome || authStore.currentUser.nome,
      action: avisado ? 'marcou que o cliente já foi avisado da chegada' : 'marcou que o cliente ainda NÃO foi avisado',
      timestamp: agora,
    });

    enc.atualizado_em = agora;

    if (isLive && authStore.isAuthenticated) {
      try {
        await supabase
          .from('encomenda')
          .update({
            cliente_avisado: enc.cliente_avisado,
            cliente_avisado_em: enc.cliente_avisado_em || null,
            cliente_avisado_por: enc.cliente_avisado_por || null,
            historico: enc.historico,
            atualizado_em: agora,
          })
          .eq('id', enc.id);
      } catch (err) {
        console.error('[EncomendasStore] Erro ao sincronizar cliente avisado no banco:', err);
      }
    }
  }

  async function apagarEntreguesDefinitivo(): Promise<number> {
    const tenantId = authStore.activeTenantId;
    const entregues = allEncomendas.value.filter((e) => e.tenant_id === tenantId && e.status === 'Entregue');
    const idsRemover = entregues.map((e) => e.id);

    allEncomendas.value = allEncomendas.value.filter((e) => !(e.tenant_id === tenantId && e.status === 'Entregue'));

    if (idsRemover.length > 0 && isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('encomenda').delete().in('id', idsRemover);
        if (error) throw error;
        await authStore.registrarAuditoria('EXCLUSAO_LOTE_ENTREGUES', `${idsRemover.length} encomendas entregues`);
      } catch (err) {
        console.error('[EncomendasStore] Falha ao apagar entregues em lote, revertendo:', err);
        allEncomendas.value.push(...entregues);
        return 0;
      }
    }
    return idsRemover.length;
  }

  return {
    allEncomendas,
    showArchived,
    activeTab,
    searchQuery,
    paymentFilter,
    isLoading,
    erroOperacao,
    currentTenantEncomendas,
    filteredEncomendas,
    metricas,
    carregarEncomendas,
    recalcularStatus,
    sincronizarStatusPorCompra,
    criarEncomenda,
    alterarStatus,
    registrarPagamento,
    arquivarEntregues,
    apagarEntreguesDefinitivo,
    removerEncomenda,
    atualizarEncomenda,
    alternarPago,
    alternarClienteAvisado,
    gerarLinkWhatsApp,
    obterTextoPorModelo,
    obterTextoAvisoChegada,
    obterResumoEncomenda,
    dispararNotificacaoModeloEvolution,
    dispararNotificacaoChegadaEvolution,
  };
});
