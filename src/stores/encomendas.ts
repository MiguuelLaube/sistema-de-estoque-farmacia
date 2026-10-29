import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Encomenda, EncomendaItem, Pagamento, StatusEncomenda, StatusCompra, FormaPagamento } from '../types';
import { initialEncomendas } from '../data/mockData';
import { useAuthStore } from './auth';
import { useComprasStore } from './compras';
import { useClientesStore } from './clientes';
import { useMedicamentosMemoriaStore } from './medicamentosMemoria';
import { enviarMensagemEvolutionApi, formatarMensagemNotificacao } from '../services/evolutionApi';

export const useEncomendasStore = defineStore('encomendas', () => {
  const authStore = useAuthStore();
  const comprasStore = useComprasStore();
  const clientesStore = useClientesStore();
  const memoriaStore = useMedicamentosMemoriaStore();

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
        const eraOutroStatus = encomenda.status !== 'Chegou';
        encomenda.status = 'Chegou';
        if (eraOutroStatus) {
          dispararNotificacaoChegadaEvolution(encomenda);
        }
      }
    }
  }

  // Disparo automático via Evolution API quando o status passa para Chegou
  async function dispararNotificacaoChegadaEvolution(encomenda: Encomenda) {
    const cfg = authStore.currentConfig;
    if (!cfg || !cfg.evolution_api_ativo) return;

    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    if (!cliente || !cliente.telefone) return;

    const itensDesc = encomenda.itens?.map((i) => i.descricao).join(', ') || '';
    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    const mensagem = formatarMensagemNotificacao(
      cfg.mensagem_whatsapp,
      cliente.nome,
      itensDesc,
      saldo,
      cfg.ocultar_medicamentos_notificacao
    );

    const resultado = await enviarMensagemEvolutionApi(
      {
        ativo: true,
        apiUrl: cfg.evolution_api_url || '',
        apiKey: cfg.evolution_api_key || '',
        instanceName: cfg.evolution_api_instance || '',
      },
      cliente.telefone,
      mensagem
    );

    if (resultado.sucesso) {
      encomenda.cliente_avisado = true;
      encomenda.cliente_avisado_em = new Date().toISOString();
      encomenda.cliente_avisado_por = 'Robô Evolution API';
    }

    if (!encomenda.historico) encomenda.historico = [];
    encomenda.historico.push({
      employee_name: 'Robô Evolution API',
      action: resultado.sucesso
        ? `disparou WhatsApp automático de chegada para ${cliente.nome}`
        : `falha no envio automático do WhatsApp: ${resultado.mensagem}`,
      timestamp: new Date().toISOString(),
    });
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
    funcionarioNome?: string;
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
      // Registra na memória de medicamentos mais pedidos (Documento Pág. 10)
      memoriaStore.registrarMedicamento(it.descricao, it.precoUnitario);

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
      historico: [
        {
          employee_name: dados.funcionarioNome || authStore.currentUser.nome,
          action: 'Criou a encomenda (status: Aguardando)',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    recalcularStatus(novaEncomenda);
    allEncomendas.value.unshift(novaEncomenda);
    return novaEncomenda;
  }

  // Update order status with business rules
  function alterarStatus(
    encomendaId: string,
    novoStatus: StatusEncomenda,
    options?: { autorizacaoAdmin?: boolean; entregaComSaldo?: boolean; funcionarioNome?: string }
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

    const eraOutroStatus = enc.status !== novoStatus;
    enc.status = novoStatus;
    enc.atualizado_em = new Date().toISOString();

    if (novoStatus === 'Chegou' && eraOutroStatus) {
      dispararNotificacaoChegadaEvolution(enc);
    }

    // Registra no histórico (Documento Seção 3 / Pág. 7)
    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: options?.funcionarioNome || authStore.currentUser.nome,
      action: `alterou status para: ${novoStatus}`,
      timestamp: new Date().toISOString(),
    });

    return { sucesso: true };
  }

  // Register payment (supports positive payment and negative estorno)
  function registrarPagamento(dados: {
    encomendaId: string;
    valor: number;
    forma: FormaPagamento;
    tipo?: 'pagamento' | 'estorno';
    motivoEstorno?: string;
    funcionarioNome?: string;
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

    // Registra no histórico (Documento Seção 3 / Pág. 7)
    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: dados.funcionarioNome || authStore.currentUser.nome,
      action: `registrou ${dados.tipo || 'pagamento'} de R$ ${Math.abs(dados.valor).toFixed(2)} (${dados.forma})`,
      timestamp: new Date().toISOString(),
    });
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

  // Gera texto de aviso de chegada para a área de transferência (Documento Seção 3 / Pág. 8 & LGPD Art. 11)
  function obterTextoAvisoChegada(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    const primeiroNome = cliente ? cliente.nome.split(' ')[0] : 'Cliente';
    const ocultarMedicamentos = authStore.currentConfig?.ocultar_medicamentos_notificacao;
    const medicamentos = ocultarMedicamentos
      ? 'sua encomenda'
      : (encomenda.itens?.map((i) => i.descricao).join(', ') || 'seu medicamento');
    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    const textoSaldo = saldo > 0 ? ` Saldo restante a pagar: R$ ${saldo.toFixed(2)}.` : ' Pedido 100% pago.';
    return `Olá, ${primeiroNome}! Seu pedido de ${medicamentos} já chegou na drogaria e está pronto para retirada.${textoSaldo} Obrigado pela preferência!`;
  }

  // Gera resumo da encomenda para a área de transferência (Documento Seção 3 / Pág. 8)
  function obterResumoEncomenda(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    const itensStr = encomenda.itens?.map((i) => `• ${i.quantidade}x ${i.descricao} - R$ ${i.subtotal.toFixed(2)}`).join('\n') || '';
    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    return `📋 RESUMO DA ENCOMENDA [${encomenda.codigo_rastreio}]\nCliente: ${cliente?.nome || 'N/A'}\nTelefone: ${cliente?.telefone || 'N/A'}\n\nItens:\n${itensStr}\n\nTotal: R$ ${encomenda.valor_total.toFixed(2)}\nValor Pago: R$ ${encomenda.valor_pago.toFixed(2)}\nSaldo a Cobrar: R$ ${saldo.toFixed(2)}\nStatus: ${encomenda.status}`;
  }

  // Generate WhatsApp wa.me link with template interpolation (Spec 2.4, 5.1 & 8)
  function gerarLinkWhatsApp(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    if (!cliente || !cliente.telefone) return '';

    const template = authStore.currentConfig.mensagem_whatsapp;
    const ocultarMedicamentos = authStore.currentConfig?.ocultar_medicamentos_notificacao;
    const medicamentos = ocultarMedicamentos
      ? 'sua encomenda'
      : (encomenda.itens?.map((i) => i.descricao).join(', ') || 'seu medicamento');

    const mensagem = template
      .replace('{cliente}', cliente.nome.split(' ')[0])
      .replace('{medicamento}', medicamentos);

    const telLimpo = cliente.telefone.replace(/\D/g, '');
    const numComDdd = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
    return `https://wa.me/${numComDdd}?text=${encodeURIComponent(mensagem)}`;
  }

  // Delete single order
  function removerEncomenda(encomendaId: string) {
    const idx = allEncomendas.value.findIndex((e) => e.id === encomendaId);
    if (idx !== -1) {
      allEncomendas.value.splice(idx, 1);
    }
  }

  // Update order details (medications, notes, etc.)
  function atualizarEncomenda(
    encomendaId: string,
    dados: Partial<Encomenda> & {
      itensNovos?: Array<{ descricao: string; quantidade: number; precoUnitario: number }>;
      funcionarioNome?: string;
    }
  ) {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    if (dados.cliente_id) enc.cliente_id = dados.cliente_id;
    if (dados.observacao !== undefined) enc.observacao = dados.observacao;
    if (dados.status) enc.status = dados.status;

    if (dados.itensNovos) {
      enc.itens = dados.itensNovos.map((it) => {
        memoriaStore.registrarMedicamento(it.descricao, it.precoUnitario);
        return {
          id: 'i' + Math.random().toString(36).substr(2, 9),
          tenant_id: enc.tenant_id,
          encomenda_id: enc.id,
          descricao: it.descricao.trim(),
          quantidade: it.quantidade,
          preco_unitario: it.precoUnitario,
          subtotal: it.quantidade * it.precoUnitario,
          controlado: false,
          urgente: false,
          status_item: enc.status === 'Entregue' ? 'Chegou' : (enc.status === 'Chegou' ? 'Chegou' : 'Pedido Feito'),
          atributos: {},
          criado_em: new Date().toISOString(),
        };
      });
      enc.valor_total = enc.itens.reduce((acc, curr) => acc + curr.subtotal, 0);
    }

    if (dados.valor_pago !== undefined) {
      enc.valor_pago = dados.valor_pago;
      enc.situacao_pagamento = enc.valor_pago >= enc.valor_total && enc.valor_total > 0 ? 'Pago' : (enc.valor_pago > 0 ? 'Parcial' : 'Não pago');
    }

    enc.atualizado_em = new Date().toISOString();

    if (dados.funcionarioNome) {
      if (!enc.historico) enc.historico = [];
      enc.historico.push({
        employee_name: dados.funcionarioNome,
        action: 'editou a encomenda',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Toggle paid status directly
  function alternarPago(encomendaId: string, pago: boolean, funcionarioNome?: string) {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    if (pago) {
      enc.valor_pago = enc.valor_total;
      enc.situacao_pagamento = 'Pago';
    } else {
      enc.valor_pago = 0;
      enc.situacao_pagamento = 'Não pago';
    }

    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: funcionarioNome || authStore.currentUser.nome,
      action: pago ? 'marcou como pago' : 'marcou como não pago',
      timestamp: new Date().toISOString(),
    });

    enc.atualizado_em = new Date().toISOString();
  }

  // Toggle whether client was notified manually
  function alternarClienteAvisado(encomendaId: string, avisado: boolean, funcionarioNome?: string) {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    enc.cliente_avisado = avisado;
    enc.cliente_avisado_em = avisado ? new Date().toISOString() : undefined;
    enc.cliente_avisado_por = avisado ? (funcionarioNome || authStore.currentUser.nome) : undefined;

    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: funcionarioNome || authStore.currentUser.nome,
      action: avisado ? 'marcou que o cliente já foi avisado da chegada' : 'marcou que o cliente ainda NÃO foi avisado',
      timestamp: new Date().toISOString(),
    });

    enc.atualizado_em = new Date().toISOString();
  }

  // Definitively delete delivered orders (matching "Apagar Entregues" button in Base44)
  function apagarEntreguesDefinitivo(): number {
    const tenantId = authStore.activeTenantId;
    const initialLen = allEncomendas.value.length;
    allEncomendas.value = allEncomendas.value.filter((e) => !(e.tenant_id === tenantId && e.status === 'Entregue'));
    return initialLen - allEncomendas.value.length;
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
    apagarEntreguesDefinitivo,
    removerEncomenda,
    atualizarEncomenda,
    alternarPago,
    alternarClienteAvisado,
    gerarLinkWhatsApp,
    obterTextoAvisoChegada,
    obterResumoEncomenda,
    dispararNotificacaoChegadaEvolution,
  };
});
