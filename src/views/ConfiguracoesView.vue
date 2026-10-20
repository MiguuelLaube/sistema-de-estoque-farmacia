<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useComprasStore } from '../stores/compras';
import {
  Palette,
  MessageSquare,
  Users,
  ShieldCheck,
  CheckCircle,
  Plus,
  Trash2,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const comprasStore = useComprasStore();

const activeConfigTab = ref<'visual' | 'whatsapp' | 'cupom' | 'classificacoes' | 'usuarios' | 'retencao'>('visual');

// Form Identidade Visual
const formNomeSistema = ref(authStore.currentConfig.nome_sistema);
const formCorPrimaria = ref(authStore.currentConfig.cor_primaria);

// Form WhatsApp
const formMsgWhatsapp = ref(authStore.currentConfig.mensagem_whatsapp);

// Form Classificações
const novaClassificacaoNome = ref('');

// Form Retenção & Políticas
const formBloquearEntregaComSaldo = ref(authStore.currentConfig.bloquear_entrega_com_saldo);
const formDiasRetencao = ref(authStore.currentConfig.dias_retencao_arquivamento);

function salvarIdentidadeVisual() {
  authStore.currentConfig.nome_sistema = formNomeSistema.value;
  authStore.currentConfig.cor_primaria = formCorPrimaria.value;
  authStore.applyTheme();
  alert('Identidade visual atualizada com sucesso!');
}

function salvarWhatsapp() {
  authStore.currentConfig.mensagem_whatsapp = formMsgWhatsapp.value;
  alert('Modelo de mensagem do WhatsApp atualizado com sucesso!');
}

function salvarPoliticas() {
  authStore.currentConfig.bloquear_entrega_com_saldo = formBloquearEntregaComSaldo.value;
  authStore.currentConfig.dias_retencao_arquivamento = formDiasRetencao.value;
  alert('Políticas de retenção e governança atualizadas!');
}

function adicionarClassificacao() {
  if (!novaClassificacaoNome.value.trim()) return;

  comprasStore.allClassificacoes.push({
    id: 'c' + Math.random().toString(36).substr(2, 9),
    tenant_id: authStore.activeTenantId,
    nome: novaClassificacaoNome.value.trim().toUpperCase(),
    ordem: comprasStore.currentClassificacoes.length + 1,
    criado_em: new Date().toISOString(),
  });

  novaClassificacaoNome.value = '';
}

function removerClassificacao(id: string) {
  const idx = comprasStore.allClassificacoes.findIndex((c) => c.id === id);
  if (idx !== -1) {
    comprasStore.allClassificacoes.splice(idx, 1);
  }
}
</script>

<template>
  <div class="configuracoes-page">
    <div style="margin-bottom: 1.5rem;">
      <h2 style="font-size: 1.5rem; font-weight: 800;">Configurações do Tenant</h2>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        Personalização da loja, mensagens automáticas de aviso, categorias e parâmetros de conformidade
      </p>
    </div>

    <!-- Configuration Tabs -->
    <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; flex-wrap: wrap;">
      <button
        @click="activeConfigTab = 'visual'"
        class="btn btn-sm"
        :style="{
          background: activeConfigTab === 'visual' ? 'var(--color-primary)' : 'transparent',
          color: activeConfigTab === 'visual' ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          padding: '0.6rem 1rem'
        }"
      >
        <Palette :size="16" />
        <span>Identidade Visual</span>
      </button>

      <button
        @click="activeConfigTab = 'whatsapp'"
        class="btn btn-sm"
        :style="{
          background: activeConfigTab === 'whatsapp' ? 'var(--color-primary)' : 'transparent',
          color: activeConfigTab === 'whatsapp' ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          padding: '0.6rem 1rem'
        }"
      >
        <MessageSquare :size="16" />
        <span>Mensagens WhatsApp</span>
      </button>

      <button
        @click="activeConfigTab = 'classificacoes'"
        class="btn btn-sm"
        :style="{
          background: activeConfigTab === 'classificacoes' ? 'var(--color-primary)' : 'transparent',
          color: activeConfigTab === 'classificacoes' ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          padding: '0.6rem 1rem'
        }"
      >
        <span>Categorias / Classificações</span>
      </button>

      <button
        @click="activeConfigTab = 'usuarios'"
        class="btn btn-sm"
        :style="{
          background: activeConfigTab === 'usuarios' ? 'var(--color-primary)' : 'transparent',
          color: activeConfigTab === 'usuarios' ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          padding: '0.6rem 1rem'
        }"
      >
        <Users :size="16" />
        <span>Equipe & Perfis</span>
      </button>

      <button
        @click="activeConfigTab = 'retencao'"
        class="btn btn-sm"
        :style="{
          background: activeConfigTab === 'retencao' ? 'var(--color-primary)' : 'transparent',
          color: activeConfigTab === 'retencao' ? '#ffffff' : 'var(--text-muted)',
          fontWeight: 600,
          border: 'none',
          padding: '0.6rem 1rem'
        }"
      >
        <ShieldCheck :size="16" />
        <span>Privacidade & Alçadas</span>
      </button>
    </div>

    <!-- TAB: IDENTIDADE VISUAL (Spec 8) -->
    <div v-if="activeConfigTab === 'visual'" class="card" style="max-width: 600px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1.25rem;">Personalização da Marca</h3>

      <div class="form-group">
        <label class="form-label">Nome de Exibição do Sistema</label>
        <input
          v-model="formNomeSistema"
          type="text"
          class="form-input"
          id="input-config-nome-sistema"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Cor Primária do Tenant (Brand Color)</label>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <input
            v-model="formCorPrimaria"
            type="color"
            style="width: 50px; height: 38px; border: none; cursor: pointer; border-radius: var(--radius-sm);"
          />
          <input
            v-model="formCorPrimaria"
            type="text"
            class="form-input"
            style="width: 140px; font-family: monospace;"
          />
          <span style="font-size: 0.85rem; color: var(--text-muted);">
            Aplicada em botões, abas e cartões.
          </span>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button @click="salvarIdentidadeVisual" class="btn btn-primary" id="btn-salvar-identidade">
          <CheckCircle :size="16" />
          <span>Salvar Alterações</span>
        </button>
      </div>
    </div>

    <!-- TAB: WHATSAPP (Spec 8 & 3.1) -->
    <div v-if="activeConfigTab === 'whatsapp'" class="card" style="max-width: 650px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.75rem;">Modelo de Notificação de Chegada</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Esta mensagem será carregada automaticamente no WhatsApp Web quando você clicar em "Avisar no WhatsApp".
      </p>

      <div class="form-group">
        <label class="form-label">Texto da Mensagem</label>
        <textarea
          v-model="formMsgWhatsapp"
          rows="4"
          class="form-textarea"
          id="textarea-whatsapp-template"
        ></textarea>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px;">
          Variáveis aceitas: <code>{cliente}</code> (primeiro nome do cliente), <code>{medicamento}</code> (itens que chegaram).
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button @click="salvarWhatsapp" class="btn btn-primary" id="btn-salvar-whatsapp">
          <CheckCircle :size="16" />
          <span>Salvar Mensagem</span>
        </button>
      </div>
    </div>

    <!-- TAB: CATEGORIAS / CLASSIFICAÇÕES (Spec 8 & 3.1) -->
    <div v-if="activeConfigTab === 'classificacoes'" class="card" style="max-width: 650px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Classificações de Medicamentos & Produtos</h3>

      <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
        <input
          v-model="novaClassificacaoNome"
          type="text"
          placeholder="Nova categoria (ex: DERMOCOSMÉTICOS, DIABETES...)"
          class="form-input"
        />
        <button @click="adicionarClassificacao" class="btn btn-primary" style="white-space: nowrap;">
          <Plus :size="16" />
          <span>Adicionar</span>
        </button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome da Classificação</th>
              <th style="text-align: right;">Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in comprasStore.currentClassificacoes" :key="c.id">
              <td style="font-weight: 600;">{{ c.nome }}</td>
              <td style="text-align: right;">
                <button
                  @click="removerClassificacao(c.id)"
                  class="btn btn-sm btn-secondary"
                  style="color: #ef4444;"
                >
                  <Trash2 :size="14" />
                  <span>Remover</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB: USUÁRIOS & PERFIS (Spec 8 & 4.1) -->
    <div v-if="activeConfigTab === 'usuarios'" class="card" style="max-width: 750px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Usuários Cadastrados no Tenant</h3>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil de Acesso</th>
              <th style="text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in authStore.tenantUsers" :key="u.id">
              <td style="font-weight: 600;">{{ u.nome }}</td>
              <td>{{ u.email }}</td>
              <td>
                <span class="badge" style="background: var(--bg-body); text-transform: uppercase;">
                  {{ u.perfil.replace('_', ' ') }}
                </span>
              </td>
              <td style="text-align: center;">
                <span class="badge badge-chegou">Ativo</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB: RETENÇÃO & ALÇADAS (Spec 8, 5.2 & 5.6) -->
    <div v-if="activeConfigTab === 'retencao'" class="card" style="max-width: 650px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1.25rem;">Parâmetros de Governança & Retenção</h3>

      <div class="form-group">
        <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
          <input type="checkbox" v-model="formBloquearEntregaComSaldo" style="margin-top: 4px;" />
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">Restringir entrega com saldo devedor apenas ao Administrador</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              (Regra 5.2): Se marcado, operadores do balcão não poderão concluir a entrega se houver saldo restante a pagar pelo cliente.
            </div>
          </div>
        </label>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label class="form-label">Prazo para arquivamento automático de pedidos entregues (dias)</label>
        <input
          v-model.number="formDiasRetencao"
          type="number"
          class="form-input"
          style="max-width: 140px;"
        />
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
          (Regra 5.6): Padrão 90 dias após a data de entrega física.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button @click="salvarPoliticas" class="btn btn-primary" id="btn-salvar-politicas">
          <CheckCircle :size="16" />
          <span>Salvar Políticas</span>
        </button>
      </div>
    </div>
  </div>
</template>
