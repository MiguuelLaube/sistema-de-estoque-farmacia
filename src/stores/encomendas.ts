import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Encomenda, EncomendaItem, Pagamento, StatusEncomenda, StatusCompra, FormaPagamento } from '../types';
import { initialEncomendas } from '../data/mockData';
import { useAuthStore } from './auth';
import { useComprasStore } from './compras';
import { useClientesStore } from './clientes';
import { useMedicamentosMemoriaStore } from './medicamentosMemoria';
import { enviarMensagemWhatsAppProxy, formatarMensagemNotificacao } from '../services/evolutionApi';
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

  async function carregarEncomendas() {
    if (!isLive || !authStore.isAuthenticated) {
      if (!isLive) allEncomendas.value = initialEncomendas;
      else allEncomendas.value = [];
      return;
    }

    const [encRes, itemRes, pagRes] = await Promise.all([
      supabase.from('encomenda').select('*').order('criado_em', { ascending: false }),
      supabase.from('encomenda_item').select('*').order('criado_em', { ascending: true }),
      supabase.from('pagamento').select('*').order('data', { ascending: true }),
    ]);

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

      allEncomendas.value = (encRes.data as any[]).map((e) => ({
        ...e,
        valor_total: Number(e.valor_total) || 0,
        valor_pago: Number(e.valor_pago) || 0,
        historico: Array.isArray(e.historico) ? e.historico : [],
        itens: itensPorEnc.get(e.id) || [],
        pagamentos: pagsPorEnc.get(e.id) || [],
      })) as Encomenda[];
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
      if (encomenda.status !== 'Entregue') {
        const eraOutroStatus = encomenda.status !== 'Chegou';
        encomenda.status = 'Chegou';
        if (eraOutroStatus) {
          dispararNotificacaoChegadaEvolution(encomenda);
        }
      }
    }
  }

  // Disparo automático via Proxy Backend (/api/whatsapp) sem credenciais no cliente
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

    const resultado = await enviarMensagemWhatsAppProxy(true, cliente.telefone, mensagem);

    if (resultado.sucesso) {
      encomenda.cliente_avisado = true;
      encomenda.cliente_avisado_em = new Date().toISOString();
      encomenda.cliente_avisado_por = 'Robô WhatsApp';
    }

    if (!encomenda.historico) encomenda.historico = [];
    encomenda.historico.push({
      employee_name: 'Robô WhatsApp',
      action: resultado.sucesso
        ? `disparou WhatsApp automático de chegada para ${cliente.nome}`
        : `falha no envio automático do WhatsApp: ${resultado.mensagem}`,
      timestamp: new Date().toISOString(),
    });

    if (isLive && authStore.isAuthenticated) {
      await supabase
        .from('encomenda')
        .update({
          cliente_avisado: encomenda.cliente_avisado || false,
          cliente_avisado_em: encomenda.cliente_avisado_em || null,
          cliente_avisado_por: encomenda.cliente_avisado_por || null,
          historico: encomenda.historico,
        })
        .eq('id', encomenda.id);
    }
  }

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
    const orderId = gerarUuidSeguro();
    const trackingCode = `ENC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const agora = new Date().toISOString();

    const itensCriados: EncomendaItem[] = dados.itens.map((it) => {
      memoriaStore.registrarMedicamento(it.descricao, it.precoUnitario);

      const compraItem = comprasStore.encontrarOuCriarCompraItem(
        it.descricao,
        it.classificacaoId,
        it.quantidade,
        it.urgente,
        it.controlado
      );

      return {
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
      };
    });

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

    if (isLive && authStore.isAuthenticated) {
      (async () => {
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

        if (!encErr && itensCriados.length > 0) {
          await supabase.from('encomenda_item').insert(
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
        }
      })();
    }

    return novaEncomenda;
  }

  function alterarStatus(
    encomendaId: string,
    novoStatus: StatusEncomenda,
    options?: { autorizacaoAdmin?: boolean; entregaComSaldo?: boolean; funcionarioNome?: string }
  ): { sucesso: boolean; mensagem?: string } {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return { sucesso: false, mensagem: 'Encomenda não encontrada.' };

    // Regra 5.2: Entregue só se todos os itens estiverem em Chegou (salvo alçada Admin real)
    if (novoStatus === 'Entregue') {
      const allChegou = enc.itens?.every((i) => i.status_item === 'Chegou');
      if (!allChegou && !options?.autorizacaoAdmin) {
        return {
          sucesso: false,
          mensagem: 'Não é possível marcar como Entregue: existem itens que ainda não chegaram! Apenas um Administrador pode autorizar exceção.',
        };
      }

      const saldoDevedor = enc.valor_total > enc.valor_pago;
      if (saldoDevedor) {
        if (authStore.currentConfig.bloquear_entrega_com_saldo && !authStore.isAdmin) {
          return {
            sucesso: false,
            mensagem: 'Política da farmácia: entrega com saldo devedor exige autorização de Administrador.',
          };
        }
        enc.entregue_com_saldo_devedor = true;
        authStore.registrarAuditoria(
          'LIBERACAO_ENTREGA_COM_SALDO',
          `Encomenda ${enc.codigo_rastreio || enc.id}`,
          `Saldo pendente: R$ ${(enc.valor_total - enc.valor_pago).toFixed(2)}`
        );
      }

      enc.entregue_em = new Date().toISOString();
      enc.entregue_por = authStore.currentUser.tenant_id ? authStore.activeUserId : undefined;
    }

    if (novoStatus === 'Cancelada') {
      if (enc.itens) {
        for (const it of enc.itens) {
          it.compra_item_id = undefined;
        }
      }
    }

    // Se o atendente avançou manualmente o card para Pedido Feito ou Chegou, alinha os itens da encomenda
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
      action: `alterou status para: ${novoStatus}`,
      timestamp: enc.atualizado_em,
    });

    if (isLive && authStore.isAuthenticated) {
      (async () => {
        if (novoStatus === 'Pedido Feito' || novoStatus === 'Chegou') {
          await supabase
            .from('encomenda_item')
            .update({ status_item: novoStatus })
            .eq('encomenda_id', enc.id);
        }
        await supabase
          .from('encomenda')
          .update({
            status: enc.status,
            entregue_em: enc.entregue_em || null,
            entregue_por: enc.entregue_por || null,
            entregue_com_saldo_devedor: enc.entregue_com_saldo_devedor,
            historico: enc.historico,
            atualizado_em: enc.atualizado_em,
          })
          .eq('id', enc.id);
      })();
    }

    if (novoStatus === 'Chegou' && eraOutroStatus) {
      dispararNotificacaoChegadaEvolution(enc);
    }

    return { sucesso: true };
  }

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
    if (valorFinal === 0) return;

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

    enc.valor_pago = Math.max(0, enc.pagamentos.reduce((acc, curr) => acc + curr.valor, 0));
    if (enc.valor_pago >= enc.valor_total && enc.valor_total > 0) {
      enc.situacao_pagamento = 'Pago';
    } else if (enc.valor_pago > 0) {
      enc.situacao_pagamento = 'Parcial';
    } else {
      enc.situacao_pagamento = 'Não pago';
    }

    if (!enc.historico) enc.historico = [];
    enc.historico.push({
      employee_name: dados.funcionarioNome || authStore.currentUser.nome,
      action: `registrou ${dados.tipo || 'pagamento'} de R$ ${Math.abs(dados.valor).toFixed(2)} (${dados.forma})`,
      timestamp: agora,
    });

    if (isLive && authStore.isAuthenticated) {
      (async () => {
        await supabase.from('pagamento').insert({
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
        await supabase
          .from('encomenda')
          .update({ historico: enc.historico, atualizado_em: agora })
          .eq('id', enc.id);
      })();
    }
  }

  function arquivarEntregues(): number {
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
      supabase.from('encomenda').update({ arquivada_em: agora }).in('id', ids).then(() => {});
    }
    return count;
  }

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

  function obterResumoEncomenda(encomenda: Encomenda): string {
    const cliente = clientesStore.allClientes.find((c) => c.id === encomenda.cliente_id);
    const itensStr = encomenda.itens?.map((i) => `• ${i.quantidade}x ${i.descricao} - R$ ${i.subtotal.toFixed(2)}`).join('\n') || '';
    const saldo = Math.max(0, encomenda.valor_total - encomenda.valor_pago);
    return `📋 RESUMO DA ENCOMENDA [${encomenda.codigo_rastreio}]\nCliente: ${cliente?.nome || 'N/A'}\nTelefone: ${cliente?.telefone || 'N/A'}\n\nItens:\n${itensStr}\n\nTotal: R$ ${encomenda.valor_total.toFixed(2)}\nValor Pago: R$ ${encomenda.valor_pago.toFixed(2)}\nSaldo a Cobrar: R$ ${saldo.toFixed(2)}\nStatus: ${encomenda.status}`;
  }

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

  function removerEncomenda(encomendaId: string) {
    const idx = allEncomendas.value.findIndex((e) => e.id === encomendaId);
    if (idx !== -1) {
      const removida = allEncomendas.value[idx];
      allEncomendas.value.splice(idx, 1);
      if (isLive && authStore.isAuthenticated) {
        supabase.from('encomenda').delete().eq('id', encomendaId).then(() => {
          authStore.registrarAuditoria('EXCLUSAO_ENCOMENDA', `Encomenda ${removida.codigo_rastreio || encomendaId}`);
        });
      }
    }
  }

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
      (async () => {
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
      })();
    }
  }

  // BUG-09 FIX: alternarPago reconcilia a tabela pagamento para manter integridade financeira no banco
  function alternarPago(encomendaId: string, pago: boolean, funcionarioNome?: string) {
    const enc = allEncomendas.value.find((e) => e.id === encomendaId);
    if (!enc) return;

    if (pago) {
      const faltaPagar = Math.max(0, enc.valor_total - enc.valor_pago);
      if (faltaPagar > 0) {
        registrarPagamento({
          encomendaId,
          valor: faltaPagar,
          forma: 'dinheiro',
          tipo: 'pagamento',
          funcionarioNome,
        });
      }
    } else if (enc.valor_pago > 0) {
      registrarPagamento({
        encomendaId,
        valor: enc.valor_pago,
        forma: 'outros',
        tipo: 'estorno',
        motivoEstorno: 'Reversão manual de status de pagamento no card',
        funcionarioNome,
      });
    }
  }

  function alternarClienteAvisado(encomendaId: string, avisado: boolean, funcionarioNome?: string) {
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
      supabase
        .from('encomenda')
        .update({
          cliente_avisado: enc.cliente_avisado,
          cliente_avisado_em: enc.cliente_avisado_em || null,
          cliente_avisado_por: enc.cliente_avisado_por || null,
          historico: enc.historico,
          atualizado_em: agora,
        })
        .eq('id', enc.id)
        .then(() => {});
    }
  }

  function apagarEntreguesDefinitivo(): number {
    const tenantId = authStore.activeTenantId;
    const idsRemover = allEncomendas.value
      .filter((e) => e.tenant_id === tenantId && e.status === 'Entregue')
      .map((e) => e.id);

    allEncomendas.value = allEncomendas.value.filter((e) => !(e.tenant_id === tenantId && e.status === 'Entregue'));

    if (idsRemover.length > 0 && isLive && authStore.isAuthenticated) {
      supabase
        .from('encomenda')
        .delete()
        .in('id', idsRemover)
        .then(() => {
          authStore.registrarAuditoria('EXCLUSAO_LOTE_ENTREGUES', `${idsRemover.length} encomendas entregues`);
        });
    }
    return idsRemover.length;
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
    obterTextoAvisoChegada,
    obterResumoEncomenda,
    dispararNotificacaoChegadaEvolution,
  };
});
