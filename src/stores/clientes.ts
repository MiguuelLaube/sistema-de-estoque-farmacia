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
      nome: dados.nome.trim(),
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
        telefone: dados.telefone ? normalizarTelefone(dados.telefone) : allClientes.value[index].telefone,
      };
    }
  }

  function arquivarCliente(id: string) {
    const cliente = allClientes.value.find((c) => c.id === id);
    if (cliente) {
      cliente.arquivado_em = new Date().toISOString();
    }
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
  };
});
