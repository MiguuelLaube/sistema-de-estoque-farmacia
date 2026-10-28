import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useAuthStore } from './auth';

export interface MedicamentoMemoriaItem {
  name: string;
  price: number;
  count: number;
}

export const useMedicamentosMemoriaStore = defineStore('medicamentosMemoria', () => {
  const authStore = useAuthStore();
  const getStorageKey = () => `pharma_order_meds_${authStore.activeTenantId || 'default'}`;
  const memory = ref<MedicamentoMemoriaItem[]>([]);

  function carregarMemoria() {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem(getStorageKey());
      if (data) {
        memory.value = JSON.parse(data);
      } else {
        // Defaults iniciais de alta rotatividade
        memory.value = [
          { name: 'OZEMPIC 1MG CANETA INJETAVEL', price: 980.00, count: 12 },
          { name: 'MOUNJARO 5MG SOLUCAO INJETAVEL', price: 1450.00, count: 8 },
          { name: 'VENVANSE 50MG C/ 28 CAPSULAS', price: 480.00, count: 15 },
          { name: 'RYBELSUS 14MG C/ 30 COMPRIMIDOS', price: 620.00, count: 7 },
          { name: 'DIPIRONA SODICA 500MG CX 100 CPR', price: 14.50, count: 25 },
          { name: 'RIVOTRIL 2MG C/ 30 COMPRIMIDOS', price: 18.00, count: 18 },
        ];
        salvarMemoria();
      }
    } catch (e) {
      console.error('Erro ao carregar pharma_order_meds:', e);
    }
  }

  function salvarMemoria() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(memory.value));
    } catch (e) {
      console.error('Erro ao salvar pharma_order_meds:', e);
    }
  }

  // Recarrega memória quando o tenant mudar
  watch(() => authStore.activeTenantId, () => {
    carregarMemoria();
  });

  // Registra uso de medicamento e atualiza contagem e preço mais recente (Documento Pág. 10)
  function registrarMedicamento(nome: string, preco: number) {
    if (!nome.trim()) return;
    const nomeNorm = nome.trim().toUpperCase();
    const item = memory.value.find((m) => m.name.toUpperCase() === nomeNorm);

    if (item) {
      item.count += 1;
      if (preco > 0) item.price = preco;
    } else {
      memory.value.push({
        name: nomeNorm,
        price: preco || 0,
        count: 1,
      });
    }

    // Ordena pelas mais usadas (Documento Pág. 10)
    memory.value.sort((a, b) => b.count - a.count);
    salvarMemoria();
  }

  // Sugestões a partir de pelo menos 2 caracteres, limitadas a 6 entradas (Documento Pág. 10)
  function obterSugestoes(termo: string): MedicamentoMemoriaItem[] {
    if (!termo || termo.trim().length < 2) return [];
    const q = termo.trim().toUpperCase();

    return memory.value
      .filter((m) => m.name.toUpperCase().includes(q))
      .slice(0, 6);
  }

  // Inicializa memória ao carregar store
  carregarMemoria();

  return {
    memory,
    registrarMedicamento,
    obterSugestoes,
  };
});
