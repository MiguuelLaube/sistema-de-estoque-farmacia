<script setup lang="ts">
import { ref, computed } from 'vue';
import { useClientesStore } from '../stores/clientes';
import { useEncomendasStore } from '../stores/encomendas';
import type { Cliente } from '../types';
import {
  UserPlus,
  Search,
  AlertTriangle,
  Archive,
  Edit2,
  Eye,
  EyeOff,
  FileDown,
  X,
  CheckCircle,
} from 'lucide-vue-next';

const clientesStore = useClientesStore();
const encomendasStore = useEncomendasStore();

// UI States
const buscaTexto = ref('');
const formularioAberto = ref(false); // Recolhido por padrão (Spec 5.7 & 8)
const clienteEmEdicao = ref<Cliente | null>(null);
const desmascarados = ref<Record<string, boolean>>({});

// Form Model
const formNome = ref('');
const formTelefone = ref('');
const formCpf = ref('');
const formEndereco = ref('');
const formBaseLegal = ref('execucao_contrato');
const alertaDuplicidade = ref<string | null>(null);

// Clientes Enriquecidos com contagem de pedidos e saldo em aberto
const clientesEnriquecidos = computed(() => {
  const q = buscaTexto.value.toLowerCase().trim();

  return clientesStore.currentTenantClientes
    .filter((c) => !c.arquivado_em)
    .map((c) => {
      const pedidosDoCliente = encomendasStore.currentTenantEncomendas.filter((e) => e.cliente_id === c.id);
      const totalPedidos = pedidosDoCliente.length;
      const totalEmAberto = pedidosDoCliente.reduce((acc, curr) => {
        return acc + Math.max(0, curr.valor_total - curr.valor_pago);
      }, 0);

      return {
        ...c,
        encomendas_count: totalPedidos,
        total_em_aberto: totalEmAberto,
      };
    })
    .filter((c) => {
      if (!q) return true;
      const nomeMatch = c.nome.toLowerCase().includes(q);
      const telMatch = c.telefone.toLowerCase().includes(q);
      const cpfMatch = c.cpf ? c.cpf.includes(q) : false;
      return nomeMatch || telMatch || cpfMatch;
    });
});

function formatarMoeda(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

// Mascaramento LGPD (Spec 7.2)
function mascararCPF(cpf?: string): string {
  if (!cpf) return 'Não informado';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9)}`;
  }
  return cpf;
}

function mascararTelefone(tel: string): string {
  const clean = tel.replace(/\D/g, '');
  if (clean.length >= 10) {
    return `(${clean.slice(0, 2)}) 9****-${clean.slice(-4)}`;
  }
  return tel;
}

function alternarExibicaoCompleta(id: string) {
  desmascarados.value[id] = !desmascarados.value[id];
}

function verificarDuplicidadeTempoReal() {
  if (formNome.value.length > 2 || formTelefone.value.length > 6 || formCpf.value.length > 5) {
    const dup = clientesStore.verificarDuplicidade(
      formNome.value,
      formTelefone.value,
      formCpf.value,
      clienteEmEdicao.value?.id
    );
    alertaDuplicidade.value = dup ? dup.mensagem : null;
  } else {
    alertaDuplicidade.value = null;
  }
}

function abrirFormularioNovo() {
  clienteEmEdicao.value = null;
  formNome.value = '';
  formTelefone.value = '';
  formCpf.value = '';
  formEndereco.value = '';
  formBaseLegal.value = 'execucao_contrato';
  alertaDuplicidade.value = null;
  formularioAberto.value = true;
}

function abrirEdicao(c: Cliente) {
  clienteEmEdicao.value = c;
  formNome.value = c.nome;
  formTelefone.value = c.telefone;
  formCpf.value = c.cpf || '';
  formEndereco.value = c.endereco || '';
  formBaseLegal.value = c.base_legal || 'execucao_contrato';
  alertaDuplicidade.value = null;
  formularioAberto.value = true;
}

function salvarCliente() {
  if (!formNome.value.trim() || !formTelefone.value.trim()) {
    alert('Nome e Telefone são campos obrigatórios.');
    return;
  }

  // Validação de CPF caso informado
  if (formCpf.value.trim()) {
    const cpfValido = clientesStore.validarCPF(formCpf.value);
    if (!cpfValido) {
      alert('O CPF informado possui dígitos verificadores inválidos.');
      return;
    }
  }

  if (clienteEmEdicao.value) {
    clientesStore.atualizarCliente(clienteEmEdicao.value.id, {
      nome: formNome.value,
      telefone: formTelefone.value,
      cpf: formCpf.value || undefined,
      endereco: formEndereco.value || undefined,
      base_legal: formBaseLegal.value,
    });
    alert('Cadastro do cliente atualizado com sucesso.');
  } else {
    clientesStore.adicionarCliente({
      nome: formNome.value,
      telefone: formTelefone.value,
      cpf: formCpf.value || undefined,
      endereco: formEndereco.value || undefined,
      base_legal: formBaseLegal.value,
    });
    alert('Novo cliente cadastrado com sucesso.');
  }

  formularioAberto.value = false;
}

// Arquivamento no lugar de exclusão (Spec 5.6 & 5.7)
function arquivarCliente(c: Cliente) {
  const confirmacao = confirm(`Deseja arquivar o cliente "${c.nome}"? Seu histórico continuará preservado.`);
  if (confirmacao) {
    clientesStore.arquivarCliente(c.id);
  }
}

// Exportação de Dados do Titular (LGPD Art. 18 / Marco Civil - Spec 7.2)
function exportarDadosTitular(c: Cliente) {
  const pedidos = encomendasStore.currentTenantEncomendas.filter((e) => e.cliente_id === c.id);
  const jsonExport = {
    titular: {
      nome: c.nome,
      cpf: c.cpf,
      telefone: c.telefone,
      endereco: c.endereco,
      baseLegal: c.base_legal,
      cadastradoEm: c.criado_em,
    },
    historicoEncomendas: pedidos,
    emitidoEm: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(jsonExport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dados_titular_${c.nome.replace(/\s+/g, '_')}.json`;
  link.click();
}
</script>

<template>
  <div class="clientes-page">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="font-size: 1.5rem; font-weight: 800;">Cadastro de Clientes</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Gestão de clientes com validação de CPF, normalização de contato e conformidade LGPD
        </p>
      </div>

      <button
        @click="formularioAberto ? (formularioAberto = false) : abrirFormularioNovo()"
        class="btn btn-primary"
        id="btn-novo-cliente-toggle"
      >
        <UserPlus :size="18" />
        <span>{{ formularioAberto ? 'Fechar Formulário' : 'Novo Cliente' }}</span>
      </button>
    </div>

    <!-- Formulário Recolhível por Padrão (Spec 5.7 & 8) -->
    <div
      v-if="formularioAberto"
      class="card"
      id="card-formulario-cliente"
      style="margin-bottom: 1.75rem; border: 2px solid var(--color-primary-alpha); background: var(--bg-surface-elevated);"
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700;">
          {{ clienteEmEdicao ? 'Editar Cadastro de Cliente' : 'Cadastrar Novo Cliente' }}
        </h3>
        <button @click="formularioAberto = false" style="background: none; border: none; cursor: pointer; color: var(--text-muted);">
          <X :size="20" />
        </button>
      </div>

      <!-- Alerta de Duplicidade em Tempo Real (Spec 5.7) -->
      <div
        v-if="alertaDuplicidade"
        class="card"
        style="padding: 0.75rem 1rem; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;"
      >
        <AlertTriangle :size="20" style="color: #b45309; flex-shrink: 0;" />
        <span style="font-size: 0.88rem; font-weight: 600;">{{ alertaDuplicidade }}</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Nome Completo *</label>
          <input
            v-model="formNome"
            @input="verificarDuplicidadeTempoReal"
            type="text"
            placeholder="Nome do cliente"
            class="form-input"
            id="input-cliente-nome"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Telefone / WhatsApp * (com DDD)</label>
          <input
            v-model="formTelefone"
            @input="verificarDuplicidadeTempoReal"
            type="text"
            placeholder="(11) 98765-4321"
            class="form-input"
            id="input-cliente-telefone"
          />
        </div>

        <div class="form-group">
          <label class="form-label">CPF (Opcional - Validado com dígitos)</label>
          <input
            v-model="formCpf"
            @input="verificarDuplicidadeTempoReal"
            type="text"
            placeholder="000.000.000-00"
            class="form-input"
            id="input-cliente-cpf"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Endereço (Opcional - apenas para entregas)</label>
          <input
            v-model="formEndereco"
            type="text"
            placeholder="Rua, número, apto, bairro"
            class="form-input"
            id="input-cliente-endereco"
          />
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;">
        <button @click="formularioAberto = false" class="btn btn-secondary">
          Cancelar
        </button>
        <button @click="salvarCliente" class="btn btn-primary" id="btn-salvar-cliente">
          <CheckCircle :size="16" />
          <span>{{ clienteEmEdicao ? 'Atualizar Cliente' : 'Salvar Cliente' }}</span>
        </button>
      </div>
    </div>

    <!-- Barra de Pesquisa Rápida (Spec 8: Busca por nome, CPF e telefone) -->
    <div style="margin-bottom: 1.5rem; position: relative;">
      <Search :size="16" style="position: absolute; left: 14px; top: 12px; color: var(--text-muted);" />
      <input
        v-model="buscaTexto"
        type="text"
        placeholder="Buscar clientes por nome, telefone ou CPF..."
        class="form-input"
        id="input-busca-clientes"
        style="padding-left: 2.5rem;"
      />
    </div>

    <!-- Lista de Clientes em Tabela Limpa -->
    <div class="table-container">
      <table class="data-table" id="tabela-clientes">
        <thead>
          <tr>
            <th>Nome do Cliente</th>
            <th>Telefone (WhatsApp)</th>
            <th>CPF</th>
            <th style="text-align: center;">Total Encomendas</th>
            <th style="text-align: right;">Saldo em Aberto</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="clientesEnriquecidos.length === 0">
            <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
              Nenhum cliente encontrado.
            </td>
          </tr>

          <tr v-for="c in clientesEnriquecidos" :key="c.id">
            <td style="font-weight: 600;">
              <div>{{ c.nome }}</div>
              <div v-if="c.endereco" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 400;">
                {{ c.endereco }}
              </div>
            </td>

            <!-- Telefone com Mascaramento LGPD (Spec 7.2) -->
            <td>
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span>{{ desmascarados[c.id] ? c.telefone : mascararTelefone(c.telefone) }}</span>
                <button
                  @click="alternarExibicaoCompleta(c.id)"
                  style="background: none; border: none; cursor: pointer; color: var(--text-muted);"
                  :title="desmascarados[c.id] ? 'Mascarar dado' : 'Exibir completo (auditoria)'"
                >
                  <Eye v-if="!desmascarados[c.id]" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
              </div>
            </td>

            <!-- CPF com Mascaramento LGPD (Spec 7.2) -->
            <td>
              <span style="font-family: monospace; font-size: 0.85rem;">
                {{ desmascarados[c.id] ? (c.cpf || 'Não informado') : mascararCPF(c.cpf) }}
              </span>
            </td>

            <!-- Contador de Encomendas (Spec 8) -->
            <td style="text-align: center;">
              <span class="badge" style="background: var(--bg-body); font-weight: 700;">
                {{ c.encomendas_count }} pedido(s)
              </span>
            </td>

            <!-- Saldo em Aberto (Spec 8) -->
            <td style="text-align: right; font-weight: 700;" :style="{ color: c.total_em_aberto && c.total_em_aberto > 0 ? '#dc2626' : '#16a34a' }">
              {{ formatarMoeda(c.total_em_aberto || 0) }}
            </td>

            <!-- Ações com Rótulo Textual (Spec 5.6: "Todo botão destrutivo tem rótulo textual, não só ícone") -->
            <td style="text-align: right;">
              <div style="display: flex; justify-content: flex-end; gap: 0.4rem;">
                <button
                  @click="exportarDadosTitular(c)"
                  class="btn btn-sm btn-secondary"
                  title="Exportar dados do titular (LGPD Art. 18)"
                >
                  <FileDown :size="14" />
                  <span>Exportar</span>
                </button>

                <button
                  @click="abrirEdicao(c)"
                  class="btn btn-sm btn-secondary"
                  :id="'btn-editar-cliente-' + c.id"
                >
                  <Edit2 :size="14" />
                  <span>Editar</span>
                </button>

                <button
                  @click="arquivarCliente(c)"
                  class="btn btn-sm btn-secondary"
                  style="color: #9f1239;"
                  :id="'btn-arquivar-cliente-' + c.id"
                  title="Arquivar cadastro do cliente"
                >
                  <Archive :size="14" />
                  <span>Arquivar</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
