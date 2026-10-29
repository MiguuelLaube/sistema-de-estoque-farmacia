<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
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
  Printer,
  UserCheck,
  Bot,
  Send,
  Loader2,
} from 'lucide-vue-next';
import { enviarMensagemEvolutionApi } from '../services/evolutionApi';

const authStore = useAuthStore();
const comprasStore = useComprasStore();

const activeConfigTab = ref<'visual' | 'whatsapp' | 'cupom' | 'classificacoes' | 'funcionarios' | 'usuarios' | 'retencao'>('visual');

watch(
  () => activeConfigTab.value,
  (tab) => {
    if (tab === 'whatsapp') {
      carregarQrCode();
    }
  }
);

onMounted(() => {
  if (activeConfigTab.value === 'whatsapp') {
    carregarQrCode();
  }
});

// Form Identidade Visual
const formNomeSistema = ref(authStore.currentConfig.nome_sistema);
const formCorPrimaria = ref(authStore.currentConfig.cor_primaria);

// Form WhatsApp (Templates de mensagens)
const formMsgWhatsapp = ref(authStore.currentConfig.mensagem_whatsapp);
const formMsgWhatsappPedido = ref(authStore.currentConfig.mensagem_whatsapp_pedido || 'Olá {cliente}! Confirmamos seu pedido de {medicamento} na farmácia. Em breve avisaremos assim que chegar.');
const formMsgWhatsappCobranca = ref(authStore.currentConfig.mensagem_whatsapp_cobranca || 'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível. Saldo a acertar: {saldo}.');
const formEvolutionAtivo = ref(authStore.currentConfig.evolution_api_ativo !== false);
const formEvolutionUrl = ref(authStore.currentConfig.evolution_api_url || 'http://localhost:8080');
const formEvolutionKey = ref(authStore.currentConfig.evolution_api_key || 'farmacia_secret_api_key_2026');
const formEvolutionInstance = ref(authStore.currentConfig.evolution_api_instance || 'drogaria');
const testandoConexao = ref(false);
const testeResultado = ref<{ sucesso: boolean; mensagem: string } | null>(null);
const numeroTeste = ref('');
const qrcodeBase64 = ref<string | null>(null);
const statusInstancia = ref<'connecting' | 'open' | 'close' | 'desconhecido'>('connecting');
const carregandoQr = ref(false);

async function carregarQrCode() {
  carregandoQr.value = true;
  try {
    const baseUrl = (formEvolutionUrl.value || 'http://localhost:8080').trim().replace(/\/+$/, '');
    const inst = (formEvolutionInstance.value || 'drogaria').trim();
    const key = (formEvolutionKey.value || 'farmacia_secret_api_key_2026').trim();

    // 1. Checa estado real da conexão primeiro
    const stateRes = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(inst)}`, {
      headers: { apikey: key }
    });
    const stateData = await stateRes.json().catch(() => null);
    const estado = stateData?.instance?.state || stateData?.state;
    if (estado) {
      statusInstancia.value = estado;
    }

    // Se já estiver conectado (open), não precisa buscar QR Code
    if (statusInstancia.value === 'open') {
      qrcodeBase64.value = null;
      return;
    }

    // 2. Se não estiver conectado, obtém QR code
    const url = `${baseUrl}/instance/connect/${encodeURIComponent(inst)}`;
    const res = await fetch(url, {
      headers: { apikey: key }
    });
    const data = await res.json().catch(() => null);
    if (data?.base64) {
      qrcodeBase64.value = data.base64;
    } else if (data?.instance?.state === 'open' || data?.state === 'open') {
      statusInstancia.value = 'open';
      qrcodeBase64.value = null;
    }
  } catch (err) {
    console.error('Erro ao buscar QR Code ou status:', err);
  } finally {
    carregandoQr.value = false;
  }
}

// Form PrintTemplate (Documento Seção 2 / Pág. 4 e 5)
const formHeaderTitle = ref(authStore.currentConfig.header_title || 'DROGARIA AEROPORTO');
const formHeaderSubtitle = ref(authStore.currentConfig.header_subtitle || 'Sistema de Encomendas');
const formFooterText = ref(authStore.currentConfig.footer_text || 'Obrigado pela preferencia!');
const formShowPhone = ref(authStore.currentConfig.show_phone !== false);
const formShowPayment = ref(authStore.currentConfig.show_payment !== false);
const formShowStatus = ref(authStore.currentConfig.show_status !== false);
const formFontSize = ref(authStore.currentConfig.font_size || 14);

// Form Funcionários (Documento Seção 2 / Pág. 4)
const novoFuncionarioNome = ref('');
const novoFuncionarioCargo = ref('');

// Form Classificações
const novaClassificacaoNome = ref('');

// Form Retenção & Políticas
const formBloquearEntregaComSaldo = ref(authStore.currentConfig.bloquear_entrega_com_saldo);
const formDiasRetencao = ref(authStore.currentConfig.dias_retencao_arquivamento);
const formOcultarMedicamentosNotificacao = ref(authStore.currentConfig.ocultar_medicamentos_notificacao || false);

watch(
  () => authStore.activeTenantId,
  () => {
    const cfg = authStore.currentConfig;
    formNomeSistema.value = cfg.nome_sistema;
    formCorPrimaria.value = cfg.cor_primaria;
    formMsgWhatsapp.value = cfg.mensagem_whatsapp;
    formMsgWhatsappPedido.value = cfg.mensagem_whatsapp_pedido || 'Olá {cliente}! Confirmamos seu pedido de {medicamento} na farmácia. Em breve avisaremos assim que chegar.';
    formMsgWhatsappCobranca.value = cfg.mensagem_whatsapp_cobranca || 'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível. Saldo a acertar: {saldo}.';
    formHeaderTitle.value = cfg.header_title || 'DROGARIA AEROPORTO';
    formHeaderSubtitle.value = cfg.header_subtitle || 'Sistema de Encomendas';
    formFooterText.value = cfg.footer_text || 'Obrigado pela preferencia!';
    formShowPhone.value = cfg.show_phone !== false;
    formShowPayment.value = cfg.show_payment !== false;
    formShowStatus.value = cfg.show_status !== false;
    formFontSize.value = cfg.font_size || 14;
    formBloquearEntregaComSaldo.value = cfg.bloquear_entrega_com_saldo;
    formDiasRetencao.value = cfg.dias_retencao_arquivamento;
    formOcultarMedicamentosNotificacao.value = cfg.ocultar_medicamentos_notificacao || false;
    formEvolutionAtivo.value = cfg.evolution_api_ativo || false;
    formEvolutionUrl.value = cfg.evolution_api_url || 'http://localhost:8080';
    formEvolutionKey.value = cfg.evolution_api_key || '';
    formEvolutionInstance.value = cfg.evolution_api_instance || '';
  }
);

function salvarIdentidadeVisual() {
  authStore.currentConfig.nome_sistema = formNomeSistema.value;
  authStore.currentConfig.cor_primaria = formCorPrimaria.value;
  authStore.applyTheme();
  alert('Identidade visual atualizada com sucesso!');
}

function salvarWhatsapp() {
  authStore.currentConfig.mensagem_whatsapp = formMsgWhatsapp.value;
  authStore.currentConfig.mensagem_whatsapp_pedido = formMsgWhatsappPedido.value;
  authStore.currentConfig.mensagem_whatsapp_cobranca = formMsgWhatsappCobranca.value;
  if (authStore.isSuperAdmin) {
    authStore.currentConfig.ocultar_medicamentos_notificacao = formOcultarMedicamentosNotificacao.value;
    authStore.currentConfig.evolution_api_ativo = formEvolutionAtivo.value;
    authStore.currentConfig.evolution_api_url = formEvolutionUrl.value;
    authStore.currentConfig.evolution_api_key = formEvolutionKey.value;
    authStore.currentConfig.evolution_api_instance = formEvolutionInstance.value;
  }
  alert('Modelos de mensagens do WhatsApp atualizados com sucesso!');
}

async function testarEvolutionApi() {
  if (!numeroTeste.value.trim()) {
    alert('Informe um número de telefone com DDD para receber o teste (ex: 11999998888).');
    return;
  }
  testandoConexao.value = true;
  testeResultado.value = null;

  try {
    const res = await enviarMensagemEvolutionApi(
      {
        ativo: true,
        apiUrl: formEvolutionUrl.value,
        apiKey: formEvolutionKey.value,
        instanceName: formEvolutionInstance.value,
      },
      numeroTeste.value,
      '🧪 *Drogaria - Teste do Robô de Chegada*\n\nConexão com a Evolution API realizada com sucesso! As mensagens automáticas de pedidos recebidos serão enviadas neste canal.'
    );
    testeResultado.value = res;
  } catch (e: any) {
    testeResultado.value = {
      sucesso: false,
      mensagem: e?.message || 'Falha ao testar conexão',
    };
  } finally {
    testandoConexao.value = false;
  }
}

function salvarModeloCupom() {
  authStore.currentConfig.header_title = formHeaderTitle.value;
  authStore.currentConfig.header_subtitle = formHeaderSubtitle.value;
  authStore.currentConfig.footer_text = formFooterText.value;
  authStore.currentConfig.show_phone = formShowPhone.value;
  authStore.currentConfig.show_payment = formShowPayment.value;
  authStore.currentConfig.show_status = formShowStatus.value;
  authStore.currentConfig.font_size = formFontSize.value;
  alert('Modelo de impressão de cupom térmico (80mm) atualizado com sucesso!');
}

function adicionarFuncionario() {
  if (!novoFuncionarioNome.value.trim()) {
    alert('O nome do funcionário é obrigatório.');
    return;
  }
  authStore.adicionarFuncionario(novoFuncionarioNome.value, novoFuncionarioCargo.value);
  novoFuncionarioNome.value = '';
  novoFuncionarioCargo.value = '';
}

function removerFuncionario(id: string, nome: string) {
  if (confirm(`Deseja realmente remover o funcionário "${nome}"?`)) {
    authStore.removerFuncionario(id);
  }
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
    <div class="sub-tabs-container" style="margin-bottom: 1.5rem;">
      <button
        @click="activeConfigTab = 'visual'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'visual' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <Palette :size="16" />
        <span>Identidade Visual</span>
      </button>

      <button
        @click="activeConfigTab = 'whatsapp'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'whatsapp' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <MessageSquare :size="16" />
        <span>Mensagens WhatsApp</span>
      </button>

      <button
        v-if="authStore.isSuperAdmin"
        @click="activeConfigTab = 'cupom'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'cupom' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <Printer :size="16" />
        <span>Modelo de Impressão (80mm)</span>
      </button>

      <button
        @click="activeConfigTab = 'classificacoes'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'classificacoes' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <span>Categorias / Classificações</span>
      </button>

      <button
        @click="activeConfigTab = 'funcionarios'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'funcionarios' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <UserCheck :size="16" />
        <span>Funcionários / Balconistas</span>
      </button>

      <button
        @click="activeConfigTab = 'usuarios'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'usuarios' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <Users :size="16" />
        <span>Equipe & Perfis</span>
      </button>

      <button
        v-if="authStore.isSuperAdmin"
        @click="activeConfigTab = 'retencao'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'retencao' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
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
        <button @click="salvarIdentidadeVisual" class="btn-primary-pill" id="btn-salvar-identidade">
          <CheckCircle :size="16" />
          <span>Salvar Alterações</span>
        </button>
      </div>
    </div>

    <!-- TAB: WHATSAPP (Spec 8 & 3.1) -->
    <div v-if="activeConfigTab === 'whatsapp'" class="card" style="max-width: 750px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.75rem;">Modelos de Mensagens do WhatsApp</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Personalize o texto enviado em cada etapa operacional. As variáveis <code>{cliente}</code>, <code>{medicamento}</code> e <code>{saldo}</code> serão substituídas automaticamente.
      </p>

      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        <!-- Função 1: Notificação de Chegada -->
        <div class="form-group" style="margin: 0;">
          <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
            <Package :size="15" style="color: #059669;" />
            <span>1. Mensagem de Chegada (Retirada de Pedido)</span>
          </label>
          <textarea
            v-model="formMsgWhatsapp"
            rows="3"
            class="form-textarea"
            id="textarea-whatsapp-template-chegada"
            placeholder="Texto quando o medicamento chega na loja..."
          ></textarea>
        </div>

        <!-- Função 2: Confirmação de Novo Pedido -->
        <div class="form-group" style="margin: 0;">
          <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
            <CheckCircle :size="15" style="color: #2563eb;" />
            <span>2. Mensagem de Confirmação de Pedido Realizado</span>
          </label>
          <textarea
            v-model="formMsgWhatsappPedido"
            rows="3"
            class="form-textarea"
            id="textarea-whatsapp-template-pedido"
            placeholder="Texto quando uma nova encomenda é cadastrada..."
          ></textarea>
        </div>

        <!-- Função 3: Lembrete / Saldo Pendente -->
        <div class="form-group" style="margin: 0;">
          <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
            <DollarSign :size="15" style="color: #d97706;" />
            <span>3. Mensagem de Lembrete & Saldo a Acertar</span>
          </label>
          <textarea
            v-model="formMsgWhatsappCobranca"
            rows="3"
            class="form-textarea"
            id="textarea-whatsapp-template-cobranca"
            placeholder="Texto para lembrar o cliente com saldo a acertar..."
          ></textarea>
        </div>
      </div>

      <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 10px;">
        💡 Variáveis disponíveis: <code>{cliente}</code> (primeiro nome), <code>{medicamento}</code> (itens da encomenda), <code>{saldo}</code> (valor a pagar).
      </div>

      <!-- Privacidade e Sigilo Médico LGPD (Restrito ao Super Admin) -->
      <div v-if="authStore.isSuperAdmin" style="margin-top: 1.25rem; padding: 1rem; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
        <label style="display: flex; align-items: flex-start; gap: 0.65rem; cursor: pointer;">
          <input
            v-model="formOcultarMedicamentosNotificacao"
            type="checkbox"
            style="margin-top: 3px; accent-color: var(--color-primary);"
            id="checkbox-ocultar-medicamentos-lgpd"
          />
          <div>
            <div style="font-size: 0.9rem; font-weight: 600; color: #0f172a;">
              🛡️ Privacidade e Sigilo Médico (LGPD Art. 11) - Configuração Restrita
            </div>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
              Substituir nomes explícitos de medicamentos por termos genéricos (ex: <em>"sua encomenda"</em>) ao gerar links de WhatsApp e cópia de aviso, evitando expor diagnósticos e tratamentos a terceiros na tela de bloqueio do celular do paciente.
            </div>
          </div>
        </label>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button @click="salvarWhatsapp" class="btn-primary-pill" id="btn-salvar-whatsapp">
          <CheckCircle :size="16" />
          <span>Salvar Mensagens do WhatsApp</span>
        </button>
      </div>

      <!-- PAINEL: EVOLUTION API (ROBÔ AUTOMÁTICO DE WHATSAPP) - Restrito à Diretoria/TI -->
      <div v-if="authStore.isSuperAdmin" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <Bot :size="22" style="color: var(--color-primary);" />
            <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Robô Evolution API (Envio 100% Automático)</h4>
          </div>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.88rem; cursor: pointer;">
            <input
              v-model="formEvolutionAtivo"
              type="checkbox"
              style="width: 18px; height: 18px; accent-color: #10b981;"
              id="checkbox-evolution-ativo"
            />
            <span>Ativar Disparo Automático</span>
          </label>
        </div>

        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem; line-height: 1.4;">
          Quando ativado, o robô dispara a mensagem instantaneamente no WhatsApp do cliente no momento exato em que a encomenda ou compra for marcada como <strong>"Chegou"</strong>, sem necessidade de intervenção do operador.
        </p>

        <div style="display: flex; flex-direction: column; gap: 1rem; background: #f8fafc; padding: 1.25rem; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">URL da Instância Evolution API</label>
            <input
              v-model="formEvolutionUrl"
              type="text"
              class="form-input"
              id="input-evolution-url"
              placeholder="https://api.seuzap.com.br ou http://localhost:8080"
            />
            <span style="font-size: 0.75rem; color: var(--text-muted);">Endereço HTTP onde a Evolution API está hospedada.</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Nome da Instância</label>
              <input
                v-model="formEvolutionInstance"
                type="text"
                class="form-input"
                id="input-evolution-instance"
                placeholder="Ex: farmacia_loja1"
              />
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">API Key / Token de Acesso</label>
              <input
                v-model="formEvolutionKey"
                type="password"
                class="form-input"
                id="input-evolution-key"
                placeholder="Sua Global API Key ou Token"
              />
            </div>
          </div>

          <!-- Seção de Pareamento com WhatsApp (QR Code) -->
          <div style="margin-top: 0.5rem; padding: 1.25rem; border-radius: 10px; background: #ffffff; border: 1px solid #cbd5e1;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
              <div>
                <h5 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #1e293b;">
                  Pareamento com WhatsApp da Drogaria
                </h5>
                <span style="font-size: 0.8rem; color: #64748b;">
                  Status atual:
                  <strong :style="{ color: statusInstancia === 'open' ? '#059669' : '#d97706' }">
                    {{ statusInstancia === 'open' ? '🟢 Conectado ao WhatsApp' : '🟡 Aguardando leitura do QR Code' }}
                  </strong>
                </span>
              </div>
              <button
                @click="carregarQrCode"
                :disabled="carregandoQr"
                class="btn-secondary-pill"
                style="padding: 6px 14px; font-size: 0.8rem;"
              >
                <Loader2 v-if="carregandoQr" class="animate-spin" :size="14" />
                <span v-else>🔄 Atualizar QR Code</span>
              </button>
            </div>

            <div v-if="statusInstancia === 'open'" style="padding: 1rem; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 0.88rem; text-align: center;">
              🎉 <strong>Seu WhatsApp já está conectado e pronto!</strong> As notificações de chegada serão disparadas por este aparelho.
            </div>

            <div v-else style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div v-if="qrcodeBase64" style="background: white; padding: 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <img :src="qrcodeBase64" alt="QR Code WhatsApp" style="width: 240px; height: 240px; display: block;" />
              </div>
              <div v-else style="padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
                <Loader2 class="animate-spin" :size="24" style="margin: 0 auto 0.5rem;" />
                Clique em "Atualizar QR Code" para gerar o código na tela.
              </div>
              <p style="font-size: 0.82rem; color: #475569; text-align: center; margin: 0; max-width: 400px;">
                Abra o <strong>WhatsApp</strong> no celular &gt; Menu dos 3 pontinhos &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong> e aponte para o QR Code acima.
              </p>
            </div>
          </div>

          <!-- Seção de Teste de Conexão -->
          <div style="margin-top: 0.5rem; padding-top: 1rem; border-top: 1px dashed #cbd5e1;">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Testar Envio com Mensagem Real</label>
            <div style="display: flex; gap: 0.5rem;">
              <input
                v-model="numeroTeste"
                type="text"
                class="form-input"
                id="input-teste-whatsapp"
                placeholder="DDD + Número (ex: 11999998888)"
                style="flex: 1;"
              />
              <button
                @click="testarEvolutionApi"
                :disabled="testandoConexao"
                class="btn-secondary-pill"
                id="btn-testar-evolution"
                style="white-space: nowrap;"
              >
                <Loader2 v-if="testandoConexao" class="animate-spin" :size="15" />
                <Send v-else :size="15" />
                <span>{{ testandoConexao ? 'Enviando...' : 'Enviar Teste' }}</span>
              </button>
            </div>

            <!-- Feedback de Teste -->
            <div
              v-if="testeResultado"
              :style="{
                marginTop: '0.75rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                background: testeResultado.sucesso ? '#ecfdf5' : '#fef2f2',
                color: testeResultado.sucesso ? '#065f46' : '#991b1b',
                border: `1px solid ${testeResultado.sucesso ? '#a7f3d0' : '#fecaca'}`,
              }"
            >
              {{ testeResultado.sucesso ? '✅' : '❌' }} {{ testeResultado.mensagem }}
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
            <button @click="salvarWhatsapp" class="btn-primary-pill" id="btn-salvar-evolution">
              <CheckCircle :size="16" />
              <span>Salvar Configuração do Robô</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: MODELO DE IMPRESSÃO / PRINT TEMPLATE (Documento Seção 2 / Pág. 4 e 5) -->
    <div v-if="activeConfigTab === 'cupom'" class="card" style="max-width: 900px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Modelo de Impressão de Cupom Térmico (80mm)</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        Configurações do leiaute e cabeçalho/rodapé emitidos nas impressoras de bobina térmica de 80mm.
      </p>

      <div style="display: grid; grid-template-columns: 1fr 340px; gap: 2rem; align-items: start;">
        <!-- Formulário de Configuração -->
        <div>
          <div class="form-group">
            <label class="form-label">Título do Cabeçalho (Empresa/Farmácia)</label>
            <input
              v-model="formHeaderTitle"
              type="text"
              class="form-input"
              id="input-header-title"
              placeholder="DROGARIA AEROPORTO"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Subtítulo do Cabeçalho</label>
            <input
              v-model="formHeaderSubtitle"
              type="text"
              class="form-input"
              id="input-header-subtitle"
              placeholder="Sistema de Reservas"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Texto de Rodapé (Agradecimento)</label>
            <textarea
              v-model="formFooterText"
              rows="2"
              class="form-textarea"
              id="textarea-footer-text"
              placeholder="Obrigado pela preferencia!"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Tamanho Base da Fonte da Impressora (px)</label>
            <input
              v-model.number="formFontSize"
              type="number"
              min="10"
              max="20"
              class="form-input"
              style="width: 100px;"
            />
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.25rem;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem;">
              <input type="checkbox" v-model="formShowPhone" />
              <span>Exibir telefone do cliente no cupom</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem;">
              <input type="checkbox" v-model="formShowPayment" />
              <span>Exibir detalhamento financeiro (total, pago e saldo a cobrar)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem;">
              <input type="checkbox" v-model="formShowStatus" />
              <span>Exibir status de pagamento (PAGO / PENDENTE)</span>
            </label>
          </div>

          <div style="display: flex; justify-content: flex-start; margin-top: 1.5rem;">
            <button @click="salvarModeloCupom" class="btn-primary-pill" id="btn-salvar-cupom">
              <CheckCircle :size="16" />
              <span>Salvar Modelo de Impressão</span>
            </button>
          </div>
        </div>

        <!-- Preview ao Vivo da Bobina de 80mm -->
        <div style="background: #ffffff; color: #000000; border: 1px solid #cbd5e1; border-radius: 6px; padding: 1.25rem 1rem; font-family: monospace; line-height: 1.35; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);" :style="{ fontSize: `${formFontSize}px` }">
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; font-size: 1.05em;">{{ formHeaderTitle || 'DROGARIA AEROPORTO' }}</div>
            <div style="font-size: 0.9em;">{{ formHeaderSubtitle || 'Sistema de Reservas' }}</div>
            <div style="font-size: 0.85em; margin-top: 4px;">RECIBO: #A1B2C3</div>
            <div style="font-size: 0.8em; color: #475569;">{{ new Date().toLocaleDateString('pt-BR') }} 14:30</div>
          </div>

          <div style="margin-bottom: 8px; font-size: 0.9em;">
            <div>CLIENTE: MARIA APARECIDA</div>
            <div v-if="formShowPhone">TEL: (11) 98765-4321</div>
          </div>

          <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span>1x OZEMPIC 1MG CANETA</span>
              <span>R$ 980,00</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>1x DIPIRONA 500MG CX 100</span>
              <span>R$ 14,50</span>
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>TOTAL:</span>
              <span>R$ 994,50</span>
            </div>
            <div v-if="formShowPayment" style="display: flex; justify-content: space-between; font-size: 0.9em; color: #475569;">
              <span>VALOR PAGO:</span>
              <span>R$ 500,00</span>
            </div>
            <div v-if="formShowPayment" style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;">
              <span>SALDO A COBRAR:</span>
              <span>R$ 494,50</span>
            </div>
            <div v-if="formShowStatus" style="text-align: right; font-size: 0.85em; margin-top: 4px;">
              STATUS: PENDENTE
            </div>
          </div>

          <div style="text-align: center; border-top: 1px dashed #000; padding-top: 8px; font-size: 0.85em;">
            {{ formFooterText || 'Obrigado pela preferencia!' }}
          </div>
        </div>
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
        <button @click="adicionarClassificacao" class="btn-primary-pill" style="white-space: nowrap;">
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
                  class="btn-outline-neutral"
                  style="color: #ef4444 !important; padding: 4px 12px; font-size: 0.8rem;"
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

    <!-- TAB: FUNCIONÁRIOS / BALCONISTAS (Documento Seção 2 / Pág. 4) -->
    <div v-if="activeConfigTab === 'funcionarios'" class="card" style="max-width: 750px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Funcionários / Balconistas da Loja</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Cadastro dos colaboradores responsáveis pelas encomendas, baixas e cupons emitidos.
      </p>

      <!-- Formulário de Novo Funcionário -->
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.75rem; margin-bottom: 1.5rem; align-items: end;">
        <div>
          <label class="form-label">Nome do Funcionário *</label>
          <input
            v-model="novoFuncionarioNome"
            type="text"
            placeholder="Nome do colaborador"
            class="form-input"
          />
        </div>

        <div>
          <label class="form-label">Cargo / Função (Opcional)</label>
          <input
            v-model="novoFuncionarioCargo"
            type="text"
            placeholder="Ex.: Balconista, Farmacêutico..."
            class="form-input"
          />
        </div>

        <button @click="adicionarFuncionario" class="btn-primary-pill" style="white-space: nowrap;">
          <Plus :size="16" />
          <span>Cadastrar</span>
        </button>
      </div>

      <!-- Tabela de Funcionários -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo / Função</th>
              <th>Cadastrado Em</th>
              <th style="text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="authStore.tenantFuncionarios.length === 0">
              <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                Nenhum funcionário cadastrado para esta loja.
              </td>
            </tr>

            <tr v-for="f in authStore.tenantFuncionarios" :key="f.id">
              <td style="font-weight: 600;">{{ f.nome }}</td>
              <td>{{ f.cargo || 'Não especificado' }}</td>
              <td style="font-size: 0.82rem; color: var(--text-muted);">
                {{ new Date(f.criado_em).toLocaleDateString('pt-BR') }}
              </td>
              <td style="text-align: right;">
                <button
                  @click="removerFuncionario(f.id, f.nome)"
                  class="btn-outline-neutral"
                  style="color: #ef4444 !important; padding: 4px 12px; font-size: 0.8rem;"
                  title="Remover funcionário"
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
        <button @click="salvarPoliticas" class="btn-primary-pill" id="btn-salvar-politicas">
          <CheckCircle :size="16" />
          <span>Salvar Políticas</span>
        </button>
      </div>
    </div>
  </div>
</template>
