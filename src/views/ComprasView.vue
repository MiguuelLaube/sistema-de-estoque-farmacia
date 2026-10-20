<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useComprasStore } from '../stores/compras';
import { useEncomendasStore } from '../stores/encomendas';
import type { StatusCompra, CompraItem } from '../types';
import {
  ShoppingCart,
  Plus,
  FileSpreadsheet,
  FileCode,
  Archive,
  CheckCircle2,
  Truck,
  X,
  Upload,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const comprasStore = useComprasStore();
const encomendasStore = useEncomendasStore();

// Modals
const showNovoItemModal = ref(false);
const showImportXmlModal = ref(false);
const showArquivarChegouModal = ref(false);

// Form: Novo Item Avulso (sem cliente)
const descNovoItem = ref('');
const qtdNovoItem = ref(1);
const custoNovoItem = ref(0);
const classNovoItem = ref('');
const fornecedorNovoItem = ref('');
const urgenteNovoItem = ref(false);
const controladoNovoItem = ref(false);

// XML Import Simulation State (Spec 5.8)
const xmlFileName = ref('');
const xmlPreviewItens = ref<Array<{
  descricao: string;
  quantidade: number;
  precoCusto: number;
  classificacaoId?: string;
  duplicado: boolean;
  controlado: boolean;
}>>([]);
const xmlImporting = ref(false);

// Filter by status inside Compras
const statusFilter = ref<string>('todos');

const comprasFiltradasPorGrupo = computed(() => {
  return comprasStore.comprasPorClassificacao.map((grupo) => {
    let itens = grupo.itens;
    if (statusFilter.value !== 'todos') {
      itens = itens.filter((i) => i.status === statusFilter.value);
    }
    return {
      ...grupo,
      itens,
    };
  }).filter((g) => g.itens.length > 0);
});

// Count how many orders are linked to each purchase item
function contarVinculos(compraId: string): number {
  let count = 0;
  for (const enc of encomendasStore.currentTenantEncomendas) {
    if (enc.itens) {
      for (const item of enc.itens) {
        if (item.compra_item_id === compraId) {
          count++;
        }
      }
    }
  }
  return count;
}

function formatarMoeda(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function mudarStatusCompra(item: CompraItem, novoStatus: StatusCompra) {
  comprasStore.atualizarStatus(item.id, novoStatus, (id, status) => {
    // Propagação de status em cascata para os EncomendaItem vinculados (Spec 3.3.2)
    encomendasStore.sincronizarStatusPorCompra(id, status);
  });
}

function salvarItemAvulso() {
  if (!descNovoItem.value.trim()) {
    alert('Informe a descrição do produto.');
    return;
  }

  const novo = comprasStore.encontrarOuCriarCompraItem(
    descNovoItem.value,
    classNovoItem.value || undefined,
    qtdNovoItem.value,
    urgenteNovoItem.value,
    controladoNovoItem.value
  );

  if (custoNovoItem.value > 0) {
    novo.preco_custo = custoNovoItem.value;
  }
  if (fornecedorNovoItem.value) {
    novo.fornecedor_id = fornecedorNovoItem.value;
  }

  showNovoItemModal.value = false;
  descNovoItem.value = '';
  qtdNovoItem.value = 1;
  custoNovoItem.value = 0;
}

function abrirImportacaoXML() {
  xmlFileName.value = 'NF-e_PANPHARMA_004921.xml';
  xmlPreviewItens.value = [
    {
      descricao: 'DIPIRONA SODICA 500MG CX 100 CPR',
      quantidade: 5,
      precoCusto: 14.50,
      duplicado: false,
      controlado: false,
    },
    {
      descricao: 'RIVOTRIL 2MG C/ 30 COMPRIMIDOS',
      quantidade: 3,
      precoCusto: 18.00,
      duplicado: true, // Item já presente em compras, sinalizado conforme Spec 5.8
      controlado: true,
    },
    {
      descricao: 'LOSARTANA POTASSICA 50MG CX 30 CPR',
      quantidade: 10,
      precoCusto: 4.80,
      duplicado: false,
      controlado: false,
    },
  ];
  showImportXmlModal.value = true;
}

function confirmarImportacaoXML() {
  xmlImporting.value = true;
  setTimeout(() => {
    for (const item of xmlPreviewItens.value) {
      const criado = comprasStore.encontrarOuCriarCompraItem(
        item.descricao,
        item.classificacaoId,
        item.quantidade,
        false,
        item.controlado
      );
      criado.preco_custo = item.precoCusto;
      criado.origem = 'xml';
    }
    xmlImporting.value = false;
    showImportXmlModal.value = false;
    alert('Importação do XML concluída com sucesso! Os itens foram integrados à lista de compras.');
  }, 400);
}

function executarArquivarChegou() {
  const qtd = comprasStore.arquivarChegou();
  showArquivarChegouModal.value = false;
  alert(`${qtd} item(ns) com status "Chegou" foram arquivados da lista operacional.`);
}
</script>

<template>
  <div class="compras-page">
    <!-- Top Action Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="font-size: 1.5rem; font-weight: 800;">Lista de Compras & Suprimentos</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Reposição consolidada, pedidos a distribuidoras e importação de notas fiscais XML
        </p>
      </div>

      <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <!-- Arquivar Chegou (Spec 5.6) -->
        <button
          @click="showArquivarChegouModal = true"
          class="btn btn-secondary btn-sm"
          id="btn-arquivar-chegou"
          title="Arquivar itens já entregues pelo fornecedor"
        >
          <Archive :size="16" />
          <span>Arquivar Chegou</span>
        </button>

        <!-- Exportar Excel / CSV (Spec 5.8) -->
        <button
          @click="comprasStore.exportarParaCSV()"
          class="btn btn-secondary btn-sm"
          id="btn-exportar-compras"
          title="Exportar planilha para conferência de cotação"
        >
          <FileSpreadsheet :size="16" />
          <span>Exportar CSV/Excel</span>
        </button>

        <!-- Importar XML (Spec 5.8) -->
        <button
          @click="abrirImportacaoXML"
          class="btn btn-secondary btn-sm"
          id="btn-importar-xml"
        >
          <FileCode :size="16" />
          <span>Importar XML</span>
        </button>

        <!-- Adicionar Item Avulso (sem cliente - Spec 8) -->
        <button
          @click="showNovoItemModal = true"
          class="btn btn-primary btn-sm"
          id="btn-novo-item-compra"
        >
          <Plus :size="16" />
          <span>Adicionar Item Avulso</span>
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: center;">
      <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Filtrar por Status:</span>
      <div style="display: flex; gap: 0.5rem;">
        <button
          v-for="st in ['todos', 'Aguardando', 'Pedido Feito', 'Chegou']"
          :key="st"
          @click="statusFilter = st"
          class="btn btn-sm"
          :class="statusFilter === st ? 'btn-primary' : 'btn-secondary'"
        >
          {{ st === 'todos' ? 'Todos os Status' : st }}
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="comprasFiltradasPorGrupo.length === 0"
      class="card"
      style="padding: 3rem; text-align: center; color: var(--text-muted);"
    >
      <ShoppingCart :size="48" style="margin: 0 auto 1rem; opacity: 0.5;" />
      <h3>Nenhum item na lista de compras</h3>
      <p style="font-size: 0.9rem; margin-top: 0.5rem;">
        Ao criar encomendas de clientes, os medicamentos necessários são consolidados aqui automaticamente.
      </p>
    </div>

    <!-- Groups by Classification (Spec 8) -->
    <div v-else style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div
        v-for="grupo in comprasFiltradasPorGrupo"
        :key="grupo.classificacao?.id || 'outros'"
        class="card"
        style="padding: 1.25rem 1.5rem;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem;">
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--color-primary); display: flex; align-items: center; gap: 0.5rem;">
            <span>{{ grupo.classificacao?.nome || 'PRODUTOS GERAIS' }}</span>
            <span class="badge" style="background: var(--bg-body); border-color: var(--border-color); font-size: 0.75rem;">
              {{ grupo.itens.length }} item(ns)
            </span>
          </h3>
        </div>

        <div class="table-container" style="border: none; box-shadow: none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Medicamento / Descrição</th>
                <th style="text-align: center;">Qtd Consolidada</th>
                <th>Fornecedor</th>
                <th style="text-align: right;">Custo Estimado</th>
                <th style="text-align: center;">Pedidos Vinculados</th>
                <th>Status da Compra</th>
                <th style="text-align: right;">Ações de Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in grupo.itens" :key="item.id">
                <td style="font-weight: 600;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>{{ item.descricao }}</span>
                    <span v-if="item.controlado" class="badge badge-controlado" title="Controle Especial">
                      Controlado
                    </span>
                    <span v-if="item.urgente" class="badge badge-urgente" title="Urgência Alta">
                      Urgente
                    </span>
                    <span v-if="item.origem === 'xml'" class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 0.7rem;">
                      XML
                    </span>
                  </div>
                </td>
                <td style="text-align: center; font-weight: 700;">
                  {{ item.quantidade }}
                </td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">
                  {{ item.fornecedor?.nome || 'Panpharma Distribuidora' }}
                </td>
                <td style="text-align: right;">
                  {{ item.preco_custo > 0 ? formatarMoeda(item.preco_custo) : 'A cotar' }}
                </td>
                <td style="text-align: center;">
                  <span
                    class="badge"
                    :style="{
                      background: contarVinculos(item.id) > 0 ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-body)',
                      color: contarVinculos(item.id) > 0 ? 'var(--color-primary)' : 'var(--text-muted)',
                      fontWeight: 700
                    }"
                  >
                    {{ contarVinculos(item.id) }} pedido(s)
                  </span>
                </td>
                <td>
                  <span
                    class="badge"
                    :class="{
                      'badge-aguardando': item.status === 'Aguardando',
                      'badge-pedido-feito': item.status === 'Pedido Feito',
                      'badge-chegou': item.status === 'Chegou',
                    }"
                  >
                    {{ item.status }}
                  </span>
                </td>
                <td style="text-align: right;">
                  <div style="display: flex; justify-content: flex-end; gap: 0.4rem;">
                    <button
                      v-if="item.status === 'Aguardando'"
                      @click="mudarStatusCompra(item, 'Pedido Feito')"
                      class="btn btn-sm btn-secondary"
                      :id="'btn-comprar-' + item.id"
                      title="Marcar que o pedido foi enviado ao distribuidor"
                    >
                      <Truck :size="14" />
                      <span>Pedido Feito</span>
                    </button>

                    <button
                      v-if="item.status === 'Pedido Feito'"
                      @click="mudarStatusCompra(item, 'Chegou')"
                      class="btn btn-sm btn-primary"
                      :id="'btn-chegou-' + item.id"
                      title="Marcar que a mercadoria física chegou na farmácia"
                    >
                      <CheckCircle2 :size="14" />
                      <span>Chegou</span>
                    </button>

                    <button
                      v-if="item.status === 'Chegou' && authStore.isAdmin"
                      @click="mudarStatusCompra(item, 'Pedido Feito')"
                      class="btn btn-sm btn-secondary"
                      title="Admin: retroceder status"
                      style="font-size: 0.72rem;"
                    >
                      <span>Reabrir</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL: NOVO ITEM AVULSO (Spec 8) -->
    <div v-if="showNovoItemModal" class="modal-backdrop">
      <div class="modal-content">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Adicionar Item Avulso de Compra</h3>
          <button @click="showNovoItemModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Descrição do Medicamento / Produto</label>
            <input
              v-model="descNovoItem"
              type="text"
              placeholder="Ex.: Paracetamol 750mg c/ 20 comprimidos"
              class="form-input"
            />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Quantidade</label>
              <input v-model.number="qtdNovoItem" type="number" min="1" class="form-input" />
            </div>

            <div class="form-group">
              <label class="form-label">Preço de Custo (R$)</label>
              <input v-model.number="custoNovoItem" type="number" step="0.01" min="0" class="form-input" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Classificação</label>
            <select v-model="classNovoItem" class="form-select">
              <option value="">Selecione a categoria...</option>
              <option v-for="c in comprasStore.currentClassificacoes" :key="c.id" :value="c.id">
                {{ c.nome }}
              </option>
            </select>
          </div>

          <div style="display: flex; gap: 1.5rem; margin-top: 1rem;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.88rem;">
              <input type="checkbox" v-model="controladoNovoItem" />
              <span>Medicamento Controlado (Portaria 344)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.88rem; color: #dc2626;">
              <input type="checkbox" v-model="urgenteNovoItem" />
              <span>Marcar como Urgente</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showNovoItemModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="salvarItemAvulso" class="btn btn-primary" id="btn-salvar-item-avulso">
            Adicionar à Lista
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: IMPORTAR XML (Spec 5.8: Pré-visualização com sinalização de duplicados) -->
    <div v-if="showImportXmlModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 640px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Pré-visualização do XML de Nota Fiscal</h3>
          <button @click="showImportXmlModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div style="background: var(--bg-body); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 1rem; font-size: 0.85rem;">
            <div><strong>Arquivo:</strong> {{ xmlFileName }}</div>
            <div><strong>Fornecedor:</strong> Distribuidora Panpharma Ltda</div>
            <div><strong>Total de Itens Detectados:</strong> {{ xmlPreviewItens.length }}</div>
          </div>

          <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">
            ITENS DETECTADOS NO XML:
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 250px; overflow-y: auto;">
            <div
              v-for="(it, idx) in xmlPreviewItens"
              :key="idx"
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);"
              :style="{ background: it.duplicado ? '#fffbeb' : 'var(--bg-body)' }"
            >
              <div>
                <div style="font-weight: 600; font-size: 0.88rem;">{{ it.descricao }}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                  Quantidade: {{ it.quantidade }} un. | Custo: {{ formatarMoeda(it.precoCusto) }}
                </div>
              </div>

              <div>
                <!-- Sinalização de item duplicado (Spec 5.8) -->
                <span v-if="it.duplicado" class="badge" style="background: #fef3c7; color: #b45309; border-color: #fde68a;">
                  Já na lista (será somado)
                </span>
                <span v-else class="badge badge-chegou">
                  Novo item
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showImportXmlModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button
            @click="confirmarImportacaoXML"
            class="btn btn-primary"
            id="btn-confirmar-importacao-xml"
            :disabled="xmlImporting"
          >
            <Upload :size="16" />
            <span>{{ xmlImporting ? 'Importando...' : 'Confirmar Importação' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO: ARQUIVAR CHEGOU (Spec 5.6) -->
    <div v-if="showArquivarChegouModal" class="modal-backdrop">
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem;">Arquivar Itens Chegou</h3>
          <button @click="showArquivarChegouModal = false" style="background: none; border: none; cursor: pointer;">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 0.75rem;">
            Os itens com status <strong>Chegou</strong> serão retirados da lista ativa de compras para liberar espaço para novos pedidos.
          </p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            O histórico continuará preservado para relatórios e cruzamento de custos. Deseja arquivar agora?
          </p>
        </div>
        <div class="modal-footer">
          <button @click="showArquivarChegouModal = false" class="btn btn-secondary">
            Cancelar
          </button>
          <button @click="executarArquivarChegou" class="btn btn-primary" id="btn-confirmar-arquivar-chegou">
            Confirmar Arquivamento
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
