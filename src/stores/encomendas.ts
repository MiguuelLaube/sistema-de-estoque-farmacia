import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Encomenda, EncomendaItem, Pagamento, StatusEncomenda, StatusCompra, FormaPagamento } from '../types';
import { initialEncomendas } from '../data/mockData';
import { useAuthStore } from './auth';
import { useComprasStore } from './compras';
import { useClientesStore } from './clientes';

export const useEncomendasStore = defineStore('encomendas', () => {
  const authStore = useAuthStore();
  const comprasStore = useComprasStore();
  const clientesStore = useClientesStore();

  const allEncomendas = ref<Encomenda[]>(initialEncomendas);
  const showArchived = ref<boolean>(false);
  const activeTab = ref<StatusEncomenda | 'Todas'>('Todas');
  const searchQuery = ref<string>('');
  const paymentFilter = ref<string>('todos');

  // Tenant-scoped orders with enriched client and purchase references
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

  // Filtered orders according to current tab and search query
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

  // Metrics from the single consolidated view (Spec 5.5)
  const metricas = computed(() => {
    const list = currentTenantEncomendas.value.filter((e) => !e.arquivada_em);
    const total = list.length;
    const pendentes = list.filter((e) => e.status !== 'Entregue' && e.status !== 'Cancelada').length;
    const entregues = list.filter((e) => e.status === 'Entregue').length;
    const aguardandoAviso = list.filter((e) => e.status === 'Chegou').length;

    const valorTotalGeral = list.reduce((acc, curr) => acc + curr.valor_total, 0);
    const valorPagoGeral = list.reduce((acc, curr) => acc + curr.valor_pago, 0);
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

  // Recalculates order status based on minimum status of its items (Spec 5.2)
  function recalcularStatus(encomenda: Encomenda) {
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
      // Se todos chegaram e já estava marcada como Entregue, mantém
      if (encomenda.status !== 'Entregue') {
        encomenda.status = 'Chegou';
      }
    }
  }

  // Hook called when a purchase item changes status
  function sincronizarStatusPorCompra(compraId: string, novoStatus: StatusCompra) {
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

  // Create new order with multiple items and automatic purchase item links
  function criarEncomenda(dados: {
    clienteId: string;
    observacao?: string;
    itens: Array<{
      descricao: string;
      quantidade: number;
      precoUnitario: number;
      classificacaoId?: string;
      controlado: boolean;
      urgente: boolean;
    }>;
  }): Encomenda {
    const tenantId = authStore.activeTenantId;
    const orderId = 'e' + Math.random().toString(36).substr(2, 9);
    const trackingCode = `ENC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const itensCriados: EncomendaItem[] = dados.itens.map((it) => {
      // Procura ou cria o item na lista de compras da farmácia
      const compraItem = comprasStore.encontrarOuCriarCompraItem(
        it.descricao,
        it.classificacaoId,
        it.quantidade,
        it.urgente,
        it.controlado
      );

      return {
        id: 'i' + Math.random().toString(36).substr(2, 9),
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
        criado_em: new Date().toISOString(),
      };
    });

    const valorTotal = itensCriados.reduce((acc, curr) => acc + curr.subtotal, 0);

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
      criado_por: authStore.activeUserId,
      entregue_com_saldo_devedor: false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      itens: itensCriados,
      pagamentos: [],
    };

    recalcularStatus(novaEncomenda);
    allEncomendas.value.unshift(novaEncomenda);
    return novaEncomenda;
  }

  // Update order status with business rules
  function alterarStatus(
    encomendaId: string,
    novoStatus: StatusEncomenda,
    options?: { autorizacaoAdmin?: boolean; entregaComSaldo?: boolean }
  ): { sucesso: boolean; mensagem?: string } {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return { sucesso: false, mensagem: 'Encomenda não encontrada.' };

    // Regra 5.2: "Entregue só é marcado manualmente, e apenas se todos os itens estiverem em Chegou."
    if (novoStatus === 'Entregue') {
      const allChegou = enc.itens?.every((i) => i.status_item === 'Chegou');
      if (!allChegou && !options?.autorizacaoAdmin) {
        return {
          sucesso: false,
          mensagem: 'Não é possível marcar como Entregue: existem itens que ainda não chegaram!',
        };
      }

      // Regra 5.2: "Entregue com saldo devedor é permitida mediante confirmação e registro em auditoria"
      const saldoDevedor = enc.valor_total > enc.valor_pago;
      if (saldoDevedor) {
        if (authStore.currentConfig.bloquear_entrega_com_saldo && !authStore.isAdmin) {
          return {
            sucesso: false,
            mensagem: 'Este tenant não permite entrega com saldo devedor sem autorização do Administrador.',
          };
        }
        enc.entregue_com_saldo_devedor = true;
      }

      enc.entregue_em = new Date().toISOString();
      enc.entregue_por = authStore.activeUserId;
    }

    // Regra 3.3.4: "Se a encomenda for cancelada, o vínculo é desfeito"
    if (novoStatus === 'Cancelada') {
      if (enc.itens) {
        for (const it of enc.itens) {
          it.compra_item_id = undefined;
        }
      }
    }

    enc.status = novoStatus;
    enc.atualizado_em = new Date().toISOString();
    return { sucesso: true };
  }

  // Register payment (supports positive payment and negative estorno)
  function registrarPagamento(dados: {
    encomendaId: string;
    valor: number;
    forma: FormaPagamento;
    tipo?: 'pagamento' | 'estorno';
    motivoEstorno?: string;
  }) {
    const enc = allEncomendas.value.find((e) => e.id === dados.encomendaId);
    if (!enc) return;

    const valorFinal = dados.tipo === 'estorno' ? -Math.abs(dados.valor) : Math.abs(dados.valor);

    const novoPag: Pagamento = {
      id: 'p' + Math.random().toString(36).substr(2, 9),
      tenant_id: authStore.activeTenantId,
      encomenda_id: enc.id,
      valor: valorFinal,
      forma: dados.forma,
      tipo: dados.tipo || 'pagamento',
      motivo_estorno: dados.motivoEstorno,
      registrado_por: authStore.activeUserId,
      data: new Date().toISOString(),
      criado_em: new Date().toISOString(),
    };

    if (!enc.pagamentos) enc.pagamentos = [];
    enc.pagamentos.push(novoPag);

    // Atualiza valor_pago e situacao_pagamento
    enc.valor_pago = enc.pagamentos.reduce((acc, curr) => acc + curr.valor, 0);
    if (enc.valor_pago >= enc.valor_total && enc.valor_total > 0) {
      enc.situacao_pagamento = 'Pago';
    } else if (enc.valor_pago > 0) {
      enc.situacao_pagamento = 'Parcial';
    } else {
      enc.situacao_pagamento = 'Não pago';
    }
  }

  // Archive delivered orders in batch (Spec 5.6: "Arquivar Entregues")
  function arquivarEntregues(): number {
    const tenantId = authStore.activeTenantId;
    let count = 0;
    for (const enc of allEncomendas.value) {
      if (enc.tenant_id === tenantId && enc.status === 'Entregue' && !enc.arquivada_em) {
        enc.arquivada_em = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  // Generate WhatsApp wa.me link with template interpolation (Spec 2.4, 5.1 & 8)
  function gerarLinkWhatsApp(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    if (!cliente || !cliente.telefone) return '';

    const template = authStore.currentConfig.mensagem_whatsapp;
    const medicamentos = encomenda.itens?.map((i) => i.descricao).join(', ') || 'seu medicamento';

    const mensagem = template
      .replace('{cliente}', cliente.nome.split(' ')[0])
      .replace('{medicamento}', medicamentos);

    const telLimpo = cliente.telefone.replace(/\D/g, '');
    const numComDdd = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
    return `https://wa.me/${numComDdd}?text=${encodeURIComponent(mensagem)}`;
  }

  return {
    allEncomendas,
    showArchived,
    activeTab,
    searchQuery,
    paymentFilter,
    currentTenantEncomendas,
    filteredEncomendas,
    metricas,
    recalcularStatus,
    sincronizarStatusPorCompra,
    criarEncomenda,
    alterarStatus,
    registrarPagamento,
    arquivarEntregues,
    gerarLinkWhatsApp,
  };
});
