<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEncomendasStore } from '../stores/encomendas';

const route = useRoute();
const router = useRouter();
const encomendasStore = useEncomendasStore();

onMounted(() => {
  const clienteIdUrl = route.query.clienteId as string;
  encomendasStore.abrirModalNovaEncomenda(clienteIdUrl);
  router.replace('/encomendas');
});
</script>

<template>
  <div style="min-height: 50vh; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.9rem;">
    <span>Abrindo tela de encomenda...</span>
  </div>
</template>
