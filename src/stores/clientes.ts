import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Cliente } from '../types';
import { initialClientes } from '../data/mockData';
import { useAuthStore } from './auth';
import { supabase, isLiveSupabaseConfigured } from '../services/supabase';

function gerarUuidSeguro(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

async function calcularSha256Hex(texto: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

export const useClientesStore = defineStore('clientes', () => {
  const authStore = useAuthStore();
  const isLive = isLiveSupabaseConfigured();
  const allClientes = ref<Cliente[]>(isLive ? [] : initialClientes);
  const isLoading = ref<boolean>(false);
  const erroOperacao = ref<string | null>(null);

  const currentTenantClientes = computed(() => {
    return allClientes.value.filter(
      (c) => c.tenant_id === authStore.activeTenantId && !c.excluido_em
    );
  });

  /**
   * Carrega clientes sob isolamento RLS multi-tenant
   */
  async function carregarClientes(): Promise<void> {
    if (!isLive || !authStore.isAuthenticated) {
      if (!isLive) allClientes.value = initialClientes;
      else allClientes.value = [];
      return;
    }

    isLoading.value = true;
    erroOperacao.value = null;

    try {
      const { data, error } = await supabase
        .from('cliente')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;
      if (data) {
        allClientes.value = data as Cliente[];
      }
    } catch (err: any) {
      console.error('[ClientesStore] Erro ao carregar base de clientes:', err);
      erroOperacao.value = 'Falha ao sincronizar clientes cadastrados.';
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    () => [authStore.isAuthenticated, authStore.activeTenantId, authStore.breakGlassTenantId],
    () => {
      carregarClientes();
    },
    { immediate: true }
  );

  function normalizarTelefone(tel: string): string {
    const digits = tel.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return tel.trim();
  }

  function validarCPF(cpf: string): boolean {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(clean.charAt(i)) * (10 - i);
    let resto = 11 - (soma % 11);
    const dig1 = resto === 10 || resto === 11 ? 0 : resto;
    if (dig1 !== parseInt(clean.charAt(9))) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(clean.charAt(i)) * (11 - i);
    resto = 11 - (soma % 11);
    const dig2 = resto === 10 || resto === 11 ? 0 : resto;
    return dig2 === parseInt(clean.charAt(10));
  }

  function formatarCPF(cpf: string): string {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf.trim();
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }

  function verificarDuplicidade(nome: string, telefone: string, cpf?: string, ignoreId?: string) {
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    const cleanTel = telefone.replace(/\D/g, '');
    const normNome = nome.trim().toLowerCase();

    for (const c of currentTenantClientes.value) {
      if (ignoreId && c.id === ignoreId) continue;

      if (cleanCpf && c.cpf && c.cpf.replace(/\D/g, '') === cleanCpf) {
        return { tipo: 'cpf', mensagem: `Já existe um cliente cadastrado com este CPF: ${c.nome}` };
      }

      if (cleanTel && c.telefone.replace(/\D/g, '') === cleanTel) {
        return { tipo: 'telefone', mensagem: `Já existe um cliente cadastrado com este telefone: ${c.nome}` };
      }

      if (normNome && c.nome.trim().toLowerCase() === normNome) {
        return { tipo: 'nome', mensagem: `Atenção: Já existe um cliente com o mesmo nome: ${c.nome}` };
      }
    }

    return null;
  }

  /**
   * Adiciona cliente com cálculo assíncrono de SHA-256 e persistência atômica no Supabase
   */
  async function adicionarCliente(dados: {
    nome: string;
    telefone: string;
    cpf?: string;
    endereco?: string;
    base_legal?: string;
  }): Promise<Cliente> {
    const cpfLimpo = dados.cpf ? dados.cpf.replace(/\D/g, '') : '';
    const cpfFormatado = cpfLimpo.length === 11 ? formatarCPF(cpfLimpo) : undefined;
    const agora = new Date().toISOString();
    const hash = cpfLimpo.length === 11 ? await calcularSha256Hex(cpfLimpo) : undefined;

    const novoCliente: Cliente = {
      id: gerarUuidSeguro(),
      tenant_id: authStore.activeTenantId,
      nome: dados.nome.trim().toUpperCase(),
      telefone: normalizarTelefone(dados.telefone || '(00) 00000-0000'),
      cpf: cpfFormatado,
      cpf_hash: hash,
      endereco: dados.endereco ? dados.endereco.trim() : undefined,
      consentimento_em: agora,
      base_legal: dados.base_legal || 'execucao_contrato',
      criado_em: agora,
    };

    allClientes.value.unshift(novoCliente);

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('cliente').insert({
          id: novoCliente.id,
          tenant_id: novoCliente.tenant_id,
          nome: novoCliente.nome,
          telefone: novoCliente.telefone,
          cpf: novoCliente.cpf || null,
          cpf_hash: hash || null,
          endereco: novoCliente.endereco || null,
          consentimento_em: novoCliente.consentimento_em,
          base_legal: novoCliente.base_legal,
        });
        if (error) throw error;
      } catch (err) {
        console.error('[ClientesStore] Erro ao persistir cliente no Supabase:', err);
        allClientes.value = allClientes.value.filter((c) => c.id !== novoCliente.id);
        throw err;
      }
    }

    return novoCliente;
  }

  /**
   * Atualiza dados de cliente e recalcula hash criptográfico se CPF foi modificado
   */
  async function atualizarCliente(id: string, dados: Partial<Cliente>): Promise<boolean> {
    const index = allClientes.value.findIndex((c) => c.id === id);
    if (index === -1) return false;

    const snapshot = { ...allClientes.value[index] };
    const cpfLimpo = dados.cpf !== undefined ? (dados.cpf ? dados.cpf.replace(/\D/g, '') : '') : undefined;
    const cpfFinal =
      cpfLimpo !== undefined ? (cpfLimpo.length === 11 ? formatarCPF(cpfLimpo) : undefined) : snapshot.cpf;

    const hash = cpfLimpo !== undefined ? (cpfLimpo.length === 11 ? await calcularSha256Hex(cpfLimpo) : undefined) : snapshot.cpf_hash;

    allClientes.value[index] = {
      ...snapshot,
      ...dados,
      nome: dados.nome ? dados.nome.trim().toUpperCase() : snapshot.nome,
      telefone: dados.telefone ? normalizarTelefone(dados.telefone) : snapshot.telefone,
      cpf: cpfFinal,
      cpf_hash: hash,
    };

    const atualizado = allClientes.value[index];

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('cliente')
          .update({
            nome: atualizado.nome,
            telefone: atualizado.telefone,
            cpf: atualizado.cpf || null,
            cpf_hash: hash || null,
            endereco: atualizado.endereco || null,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[ClientesStore] Erro ao sincronizar atualização de cliente:', err);
        allClientes.value[index] = snapshot;
        return false;
      }
    }
    return true;
  }

  /**
   * Arquiva cliente de forma segura (preserva histórico financeiro e pedidos)
   */
  async function arquivarCliente(id: string): Promise<boolean> {
    const cliente = allClientes.value.find((c) => c.id === id);
    if (!cliente) return false;

    const anterior = cliente.arquivado_em;
    const agora = new Date().toISOString();
    cliente.arquivado_em = agora;

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase.from('cliente').update({ arquivado_em: agora }).eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[ClientesStore] Erro ao arquivar cliente no banco:', err);
        cliente.arquivado_em = anterior;
        return false;
      }
    }
    return true;
  }

  /**
   * Atendimento ao Direito de Eliminação / Anonimização (Art. 18, IV e VI da LGPD)
   */
  async function anonimizarCliente(id: string): Promise<boolean> {
    const index = allClientes.value.findIndex((c) => c.id === id);
    if (index === -1) return false;

    const original = { ...allClientes.value[index] };
    const agora = new Date().toISOString();
    const nomeAnonimo = `TITULAR ANONIMIZADO #${original.id.slice(-4)}`;

    allClientes.value[index] = {
      ...original,
      nome: nomeAnonimo,
      cpf: undefined,
      cpf_hash: undefined,
      telefone: '(00) 00000-0000',
      endereco: undefined,
      excluido_em: agora,
      arquivado_em: agora,
    };

    if (isLive && authStore.isAuthenticated) {
      try {
        const { error } = await supabase
          .from('cliente')
          .update({
            nome: nomeAnonimo,
            cpf: null,
            cpf_hash: null,
            telefone: '(00) 00000-0000',
            endereco: null,
            excluido_em: agora,
            arquivado_em: agora,
          })
          .eq('id', id);

        if (error) throw error;

        await authStore.registrarAuditoria(
          'ANONIMIZACAO_TITULAR_LGPD',
          `Titular #${original.id.slice(-8)}`,
          'Exercício do Direito de Eliminação/Anonimização (Art. 18, IV e VI LGPD)'
        );
      } catch (err) {
        console.error('[ClientesStore] Erro na operação de anonimização no Supabase:', err);
        allClientes.value[index] = original;
        return false;
      }
    }
    return true;
  }

  /**
   * Atendimento ao Direito de Acesso e Portabilidade (Art. 18, II e V da LGPD)
   */
  async function exportarDadosTitular(id: string) {
    const cliente = allClientes.value.find((c) => c.id === id);
    if (!cliente) return null;

    const dadosExportacao = {
      termo: 'Relatório de Atendimento aos Direitos do Titular de Dados Pessoais (Art. 18 da Lei nº 13.709/2018 - LGPD)',
      data_geracao: new Date().toISOString(),
      farmacia_tenant_id: cliente.tenant_id,
      titular: {
        id: cliente.id,
        nome: cliente.nome,
        cpf: cliente.cpf ? cliente.cpf : 'Não informado',
        telefone: cliente.telefone,
        endereco: cliente.endereco || 'Não informado',
        base_legal_cadastrada: cliente.base_legal,
        data_consentimento_ou_cadastro: cliente.consentimento_em || cliente.criado_em,
      },
      seguranca_e_privacidade: {
        cpf_pseudonimizado_hash: cliente.cpf_hash || 'N/A',
        situacao_cadastro: cliente.excluido_em ? 'Excluído/Anonimizado' : cliente.arquivado_em ? 'Arquivado' : 'Ativo',
      },
      instrucoes_titular: 'Este arquivo contém os dados cadastrais mantidos sob sua titularidade conforme garantia do Art. 18 da LGPD.',
    };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(dadosExportacao, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dados_titular_lgpd_${cliente.nome.replace(/\s+/g, '_').toLowerCase()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    await authStore.registrarAuditoria(
      'EXPORTACAO_PORTABILIDADE_LGPD',
      `Titular #${cliente.id.slice(-8)}`,
      'Atendimento ao Direito de Acesso e Portabilidade (Art. 18, II e V LGPD)'
    );

    return dadosExportacao;
  }

  function mascararCPF(cpf?: string): string {
    if (!cpf) return '';
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf;
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9)}`;
  }

  return {
    allClientes,
    currentTenantClientes,
    isLoading,
    erroOperacao,
    carregarClientes,
    normalizarTelefone,
    validarCPF,
    verificarDuplicidade,
    adicionarCliente,
    atualizarCliente,
    arquivarCliente,
    anonimizarCliente,
    exportarDadosTitular,
    mascararCPF,
  };
});
