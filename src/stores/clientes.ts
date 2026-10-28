import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Cliente } from '../types';
import { initialClientes } from '../data/mockData';
import { useAuthStore } from './auth';

export const useClientesStore = defineStore('clientes', () => {
  const authStore = useAuthStore();
  const allClientes = ref<Cliente[]>(initialClientes);

  // Filtered by current tenant and not deleted
  const currentTenantClientes = computed(() => {
    return allClientes.value.filter(
      (c) => c.tenant_id === authStore.activeTenantId && !c.excluido_em
    );
  });

  function normalizarTelefone(tel: string): string {
    const digits = tel.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return tel;
  }

  function validarCPF(cpf: string): boolean {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(clean.charAt(i)) * (10 - i);
    let resto = 11 - (soma % 11);
    let dig1 = resto === 10 || resto === 11 ? 0 : resto;
    if (dig1 !== parseInt(clean.charAt(9))) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(clean.charAt(i)) * (11 - i);
    resto = 11 - (soma % 11);
    let dig2 = resto === 10 || resto === 11 ? 0 : resto;
    return dig2 === parseInt(clean.charAt(10));
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

  function adicionarCliente(dados: {
    nome: string;
    telefone: string;
    cpf?: string;
    endereco?: string;
    base_legal?: string;
  }): Cliente {
    const novoCliente: Cliente = {
      id: 'd' + Math.random().toString(36).substr(2, 9),
      tenant_id: authStore.activeTenantId,
      nome: dados.nome.trim().toUpperCase(),
      telefone: normalizarTelefone(dados.telefone),
      cpf: dados.cpf ? dados.cpf.trim() : undefined,
      cpf_hash: dados.cpf ? 'hash_' + dados.cpf.replace(/\D/g, '') : undefined,
      endereco: dados.endereco ? dados.endereco.trim() : undefined,
      consentimento_em: new Date().toISOString(),
      base_legal: dados.base_legal || 'execucao_contrato',
      criado_em: new Date().toISOString(),
    };

    allClientes.value.unshift(novoCliente);
    return novoCliente;
  }

  function atualizarCliente(id: string, dados: Partial<Cliente>) {
    const index = allClientes.value.findIndex((c) => c.id === id);
    if (index !== -1) {
      allClientes.value[index] = {
        ...allClientes.value[index],
        ...dados,
        nome: dados.nome ? dados.nome.trim().toUpperCase() : allClientes.value[index].nome,
        telefone: dados.telefone ? normalizarTelefone(dados.telefone) : allClientes.value[index].telefone,
        cpf: dados.cpf !== undefined ? (dados.cpf ? dados.cpf.trim() : undefined) : allClientes.value[index].cpf,
      };
    }
  }

  function arquivarCliente(id: string) {
    const cliente = allClientes.value.find((c) => c.id === id);
    if (cliente) {
      cliente.arquivado_em = new Date().toISOString();
    }
  }

  // Atendimento ao Direito de Eliminação / Anonimização (Art. 18, IV e VI da LGPD)
  function anonimizarCliente(id: string): boolean {
    const index = allClientes.value.findIndex((c) => c.id === id);
    if (index === -1) return false;

    const original = allClientes.value[index];
    allClientes.value[index] = {
      ...original,
      nome: `TITULAR ANONIMIZADO #${original.id.slice(-4)}`,
      cpf: undefined,
      cpf_hash: undefined,
      telefone: '(00) 00000-0000',
      endereco: undefined,
      excluido_em: new Date().toISOString(),
      arquivado_em: new Date().toISOString(),
    };
    return true;
  }

  // Atendimento ao Direito de Acesso e Portabilidade (Art. 18, II e V da LGPD)
  function exportarDadosTitular(id: string) {
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

    return dadosExportacao;
  }

  // Função utilitária de mascaramento de CPF em tela (Art. 6º, IV da LGPD)
  function mascararCPF(cpf?: string): string {
    if (!cpf) return '';
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf;
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9)}`;
  }

  return {
    allClientes,
    currentTenantClientes,
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
