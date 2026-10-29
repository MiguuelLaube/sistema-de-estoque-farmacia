<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEncomendasStore } from '../stores/encomendas';
import { useClientesStore } from '../stores/clientes';
import {
  PackageOpen,
  Clock,
  CheckCircle2,
  DollarSign,
  Users,
  Plus,
  Send,
  TrendingUp,
  Loader2,
  Check,
} from 'lucide-vue-next';
import { enviarMensagemWhatsAppProxy, formatarMensagemNotificacao } from '../services/evolutionApi';

const router = useRouter();
const authStore = useAuthStore();
const encomendasStore = useEncomendasStore();
const clientesStore = useClientesStore();

const metricas = computed(() => encomendasStore.metricas);
const totalClientes = computed(() => clientesStore.currentTenantClientes.length);

// Encomendas em status 'Chegou' prontas para aviso
const encomendasParaAvisar = computed(() => {
  return encomendasStore.currentTenantEncomendas.filter((e) => e.status === 'Chegou');
});

// Ranking dos medicamentos mais pedidos (Spec 5.5)
const medicamentosMaisPedidos = computed(() => {
  const contagem: Record<string, number> = {};
  for (const enc of encomendasStore.currentTenantEncomendas) {
    if (enc.itens) {
      for (const item of enc.itens) {
        contagem[item.descricao] = (contagem[item.descricao] || 0) + item.quantidade;
      }
    }
  }
  return Object.entries(contagem)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
});

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

const enviandoAvisoId = ref<string | null>(null);

async function dispararAvisoBot(enc: any) {
  const cfg = authStore.currentConfig;
  const cliente = clientesStore.allClientes.find((c) => c.id === enc.cliente_id) || enc.cliente;
  if (!cliente || !cliente.telefone) {
    alert('Cliente não possui telefone cadastrado.');
    return;
  }

  // Se robô não estiver ativo, usa rota manual WhatsApp Web
  if (!cfg.evolution_api_ativo) {
    const url = encomendasStore.gerarLinkWhatsApp(enc);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      encomendasStore.alternarClienteAvisado(enc.id, true, authStore.currentUser.nome);
    }
    return;
  }

  enviandoAvisoId.value = enc.id;
  try {
    const itensDesc = enc.itens?.map((i: any) => i.descricao).join(', ') || '';
    const saldo = Math.max(0, enc.valor_total - enc.valor_pago);
    const msg = formatarMensagemNotificacao(
      cfg.mensagem_whatsapp,
      cliente.nome,
      itensDesc,
      saldo,
      cfg.ocultar_medicamentos_notificacao
    );

    const res = await enviarMensagemWhatsAppProxy(true, cliente.telefone, msg);

    if (res.sucesso) {
      encomendasStore.alternarClienteAvisado(enc.id, true, 'Robô WhatsApp');
      alert(`✅ Mensagem de chegada enviada com sucesso para ${cliente.nome}!`);
    } else {
      alert(`❌ Falha no disparo automático: ${res.mensagem}\nVocê pode abrir pelo WhatsApp Web.`);
      const url = encomendasStore.gerarLinkWhatsApp(enc);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    alert('Não foi possível conectar ao serviço de mensageria no momento.');
  } finally {
    enviandoAvisoId.value = null;
  }
}
</script>

<template>
  <div class="dashboard-page">
    <!-- Header with Quick Action (matching Base44 Dashboard) -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="font-size: 1.85rem; font-weight: 700; color: var(--text-main); font-family: var(--font-heading);">
          Bem-vindo
        </h1>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 2px;">
          Painel de controle da {{ authStore.currentConfig.header_title || 'Drogaria Aeroporto' }}
        </p>
      </div>

      <button
        @click="router.push('/nova-encomenda')"
        class="btn-primary-pill"
        id="btn-dashboard-nova-encomenda"
      >
        <Plus :size="16" />
        <span>Nova Encomenda</span>
      </button>
    </div>

    <!-- Stat Grid (Drogaria Aeroporto 4 Key Metrics: Clientes Cadastrados, Total, Pendentes, Entregues) -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem;">
      <div class="stat-card" id="card-stat-clientes" style="cursor: pointer;" @click="router.push('/clientes')">
        <div class="stat-info">
          <div class="stat-label">Clientes Cadastrados</div>
          <div class="stat-value">{{ totalClientes }}</div>
        </div>
        <div class="stat-icon" style="background: hsla(var(--primary), 0.1); color: var(--color-primary);">
          <Users :size="24" />
        </div>
      </div>

      <div class="stat-card" id="card-stat-total" style="cursor: pointer;" @click="router.push('/encomendas')">
        <div class="stat-info">
          <div class="stat-label">Total de Encomendas</div>
          <div class="stat-value">{{ metricas.total }}</div>
        </div>
        <div class="stat-icon" style="background: #eff6ff; color: #2563eb;">
          <PackageOpen :size="24" />
        </div>
      </div>

      <div class="stat-card" id="card-stat-pendentes" style="cursor: pointer;" @click="router.push('/encomendas')">
        <div class="stat-info">
          <div class="stat-label">Encomendas Pendentes</div>
          <div class="stat-value" style="color: #d97706;">{{ metricas.pendentes }}</div>
        </div>
        <div class="stat-icon" style="background: #fffbeb; color: #d97706;">
          <Clock :size="24" />
        </div>
      </div>

      <div class="stat-card" id="card-stat-entregues" style="cursor: pointer;" @click="router.push('/encomendas')">
        <div class="stat-info">
          <div class="stat-label">Encomendas Entregues</div>
          <div class="stat-value" style="color: #059669;">{{ metricas.entregues }}</div>
        </div>
        <div class="stat-icon" style="background: #ecfdf5; color: #059669;">
          <CheckCircle2 :size="24" />
        </div>
      </div>

      <!-- Card "A Receber" (Visível para Admin / Financeiro - Spec 4.2 & 8) -->
      <div v-if="authStore.isAdmin || authStore.isComprador" class="stat-card" id="card-stat-receber">
        <div class="stat-info">
          <div class="stat-label">A Receber</div>
          <div class="stat-value" style="color: #dc2626;">{{ formatarMoeda(metricas.valorAReceber) }}</div>
        </div>
        <div class="stat-icon" style="background: #fee2e2; color: #dc2626;">
          <DollarSign :size="24" />
        </div>
      </div>
    </div>

    <!-- Middle Section: Priority Alerts & Top Medications -->
    <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
      <!-- Itens Chegando para Avisar (WhatsApp Direct Action - Spec 8) -->
      <div class="card" id="section-avisos-chegada">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <Send :size="18" style="color: #25d366;" />
            <h3 style="font-size: 1.05rem;">Prontos para Retirada (Avisar Cliente)</h3>
          </div>
          <span class="badge badge-chegou">{{ encomendasParaAvisar.length }} disponíveis</span>
        </div>

        <div v-if="encomendasParaAvisar.length === 0" style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          Nenhuma encomenda aguardando notificação no momento.
        </div>

        <div v-else style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div
            v-for="enc in encomendasParaAvisar"
            :key="enc.id"
            style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; background: var(--bg-body); border-radius: var(--radius-md); border: 1px solid var(--border-color);"
          >
            <div>
              <div style="font-weight: 600; font-size: 0.92rem;">
                {{ enc.cliente?.nome || 'Cliente' }}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                {{ enc.itens?.map((i) => i.descricao).join(', ') }}
              </div>
              <div style="display: flex; gap: 0.4rem; margin-top: 0.4rem;">
                <span class="badge" :class="enc.situacao_pagamento === 'Pago' ? 'badge-pago' : 'badge-nao-pago'">
                  {{ enc.situacao_pagamento }}
                </span>
                <span class="badge badge-chegou">Chegou</span>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span
                v-if="enc.cliente_avisado"
                style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.73rem; font-weight: 600; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 9999px;"
              >
                <Check :size="12" />
                <span>Já avisado</span>
              </span>

              <button
                @click="dispararAvisoBot(enc)"
                :disabled="enviandoAvisoId === enc.id"
                class="btn-outline-emerald"
                style="padding: 0.35rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem;"
                :id="'btn-whatsapp-' + enc.id"
                :title="authStore.currentConfig.evolution_api_ativo ? 'Disparar WhatsApp pelo Robô' : 'Abrir no WhatsApp Web'"
              >
                <Loader2 v-if="enviandoAvisoId === enc.id" class="animate-spin" :size="13" />
                <Send v-else :size="13" />
                <span>{{ enviandoAvisoId === enc.id ? 'Enviando...' : (authStore.currentConfig.evolution_api_ativo ? 'Disparar Bot' : 'Avisar WhatsApp') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Ranking de Medicamentos Mais Pedidos (Spec 5.5) -->
      <div class="card" id="section-ranking-medicamentos">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
          <TrendingUp :size="18" style="color: var(--color-primary);" />
          <h3 style="font-size: 1.05rem;">Medicamentos Mais Pedidos</h3>
        </div>

        <div v-if="medicamentosMaisPedidos.length === 0" style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          Sem histórico suficiente para exibir o ranking.
        </div>

        <div v-else style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div
            v-for="(item, idx) in medicamentosMaisPedidos"
            :key="item.nome"
            style="display: flex; align-items: center; justify-content: space-between;"
          >
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span
                style="width: 24px; height: 24px; border-radius: 50%; background: var(--bg-body); font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-muted);"
              >
                {{ idx + 1 }}
              </span>
              <span style="font-size: 0.88rem; font-weight: 500;">{{ item.nome }}</span>
            </div>
            <span class="badge badge-pedido-feito" style="font-size: 0.8rem;">
              {{ item.total }} un.
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Breakdown Overview -->
    <div class="card" id="section-status-distribuicao">
      <h3 style="font-size: 1.05rem; margin-bottom: 1rem;">Distribuição por Status</h3>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem;">
        <div
          v-for="(count, statusName) in metricas.porStatus"
          :key="statusName"
          style="padding: 1rem; border-radius: var(--radius-md); background: var(--bg-body); border: 1px solid var(--border-color); text-align: center;"
        >
          <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
            {{ statusName }}
          </div>
          <div style="font-size: 1.5rem; font-weight: 800; font-family: var(--font-heading); margin-top: 0.25rem;">
            {{ count }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
