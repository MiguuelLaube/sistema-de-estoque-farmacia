<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { isLiveSupabaseConfigured } from '../services/supabase';
import {
  Lock,
  Mail,
  LogIn,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  Pill,
  Send,
  Phone,
  Building2,
  X,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('admin@drogariaaeroporto.com.br');
const password = ref('********');
const loading = ref(false);
const errorMessage = ref('');

const isLive = isLiveSupabaseConfigured();

// Modal de Contato / Compra do Sistema
const showContatoModal = ref(false);
const contatoNomeFarmacia = ref('');
const contatoResponsavel = ref('');
const contatoTelefone = ref('');
const contatoCidade = ref('');
const contatoEnviadoSucesso = ref(false);

async function handleLogin() {
  errorMessage.value = '';
  loading.value = true;
  try {
    const res = await authStore.login(email.value, password.value);
    if (res.success) {
      router.push('/dashboard');
    } else {
      errorMessage.value = res.message || 'Falha na autenticação. Verifique suas credenciais.';
    }
  } catch (err: any) {
    errorMessage.value = err.message || 'Erro inesperado ao conectar.';
  } finally {
    loading.value = false;
  }
}

function handleDemoLogin(role: 'admin' | 'operador') {
  authStore.loginAsDemo(role);
  router.push('/dashboard');
}

function abrirWhatsAppComercial() {
  const mensagem = encodeURIComponent(
    'Olá! Tenho interesse em contratar o Sistema de Estoque e Encomendas da Drogaria Aeroporto para a minha farmácia. Poderiam me apresentar os planos e proposta comercial?'
  );
  window.open(`https://wa.me/5511999999999?text=${mensagem}`, '_blank');
}

function enviarSolicitacaoContato() {
  if (!contatoNomeFarmacia.value.trim() || !contatoTelefone.value.trim()) {
    alert('Por favor, preencha o nome da farmácia e o telefone para contato.');
    return;
  }
  contatoEnviadoSucesso.value = true;
}

function fecharModalContato() {
  showContatoModal.value = false;
  contatoEnviadoSucesso.value = false;
  contatoNomeFarmacia.value = '';
  contatoResponsavel.value = '';
  contatoTelefone.value = '';
  contatoCidade.value = '';
}
</script>

<template>
  <div class="login-wrapper-light">
    <!-- Fundo decorativo sutil com o azul cobalto oficial -->
    <div class="login-decor-bg"></div>

    <div class="login-card-container">
      <!-- Topo: Logo Oficial e Marca -->
      <div class="login-card-header">
        <div class="brand-logo-pill" aria-hidden="true">
          <Pill :size="24" class="text-white" />
        </div>
        <h1 class="login-card-title">Drogaria Aeroporto</h1>
        <p class="login-card-subtitle">Sistema de Gestão de Estoque & Encomendas</p>
      </div>

      <!-- Badge de Conexão -->
      <div class="env-badge-pill" :class="isLive ? 'badge-live' : 'badge-local'">
        <span class="status-indicator-dot"></span>
        <span>{{ isLive ? 'Conectado ao Supabase Cloud' : 'Ambiente de Homologação Ativo' }}</span>
      </div>

      <!-- Mensagem de Erro -->
      <div v-if="errorMessage" class="login-error-alert" role="alert">
        <AlertCircle :size="16" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Formulário de Login -->
      <form @submit.prevent="handleLogin" class="login-form-body">
        <div class="form-field-group">
          <label class="form-field-label" for="input-login-email">E-mail Corporativo</label>
          <div class="input-wrapper">
            <Mail :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-login-email"
              v-model="email"
              type="email"
              required
              class="form-field-input"
              placeholder="farmaceutico@drogaria.com.br"
            />
          </div>
        </div>

        <div class="form-field-group">
          <label class="form-field-label" for="input-login-password">Senha de Acesso</label>
          <div class="input-wrapper">
            <Lock :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-login-password"
              v-model="password"
              type="password"
              required
              class="form-field-input"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          class="btn-primary-pill btn-submit-full"
          :disabled="loading"
          id="btn-login-submit"
        >
          <LogIn :size="17" aria-hidden="true" />
          <span>{{ loading ? 'Autenticando...' : 'Entrar no Sistema' }}</span>
        </button>
      </form>

      <!-- Acesso Rápido de Demonstração -->
      <div class="quick-demo-section">
        <div class="divider-line">
          <span>Acesso Rápido de Teste</span>
        </div>

        <div class="demo-buttons-row">
          <button
            type="button"
            @click="handleDemoLogin('operador')"
            class="btn-outline-neutral btn-demo-pill"
            title="Acessar com perfil de balconista/operador"
          >
            <UserCheck :size="15" aria-hidden="true" />
            <span>Atendente de Balcão</span>
          </button>

          <button
            type="button"
            @click="handleDemoLogin('admin')"
            class="btn-outline-neutral btn-demo-pill"
            title="Acessar com perfil de administrador"
          >
            <ShieldCheck :size="15" aria-hidden="true" />
            <span>Administrador / RT</span>
          </button>
        </div>
      </div>

      <!-- DESTAQUE COMERCIAL: OPÇÃO PARA COMPRAR O SISTEMA -->
      <div class="sales-contact-box">
        <div class="sales-header">
          <Building2 :size="16" class="sales-icon" aria-hidden="true" />
          <span class="sales-title">Deseja implantar este sistema na sua farmácia?</span>
        </div>
        <p class="sales-desc">
          Licenciamento B2B especializado para drogarias independentes e redes. Automatize encomendas de balcão e conferência de NF-e.
        </p>
        <div class="sales-actions-grid">
          <!-- Botão WhatsApp Comercial -->
          <button
            type="button"
            @click="abrirWhatsAppComercial"
            class="btn-outline-emerald btn-sales-pill"
            id="btn-comprar-whatsapp"
            title="Falar diretamente com nosso consultor comercial via WhatsApp"
          >
            <Send :size="14" aria-hidden="true" />
            <span>Falar com Consultor (WhatsApp)</span>
          </button>

          <!-- Botão Abrir Formulário de Contato -->
          <button
            type="button"
            @click="showContatoModal = true"
            class="btn-outline-neutral btn-sales-pill"
            id="btn-solicitar-proposta"
            title="Solicitar proposta comercial por e-mail"
          >
            <Phone :size="14" aria-hidden="true" />
            <span>Solicitar Contato Comercial</span>
          </button>
        </div>
      </div>

      <!-- Rodapé do Card de Login -->
      <div class="login-card-footer">
        <span class="footer-security-text">
          <Lock :size="12" aria-hidden="true" />
          <span>Acesso criptografado e auditado por IP (LGPD)</span>
        </span>

        <button
          type="button"
          @click="router.push('/apresentacao')"
          class="link-landing-page"
        >
          <span>Conhecer a apresentação e funcionalidades do SaaS</span>
          <ExternalLink :size="12" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- MODAL DE CONTATO / COMPRA DO SISTEMA (Padrão Farmácia Base44) -->
    <div
      v-if="showContatoModal"
      class="modal-backdrop-blur"
      role="dialog"
      aria-labelledby="modal-contato-title"
      aria-modal="true"
    >
      <div class="modal-card-center">
        <!-- Header do Modal -->
        <div class="modal-header-row">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="modal-icon-badge">
              <Building2 :size="18" class="text-primary" />
            </div>
            <div>
              <h3 id="modal-contato-title" class="modal-h3">Contratar o Sistema</h3>
              <p class="modal-sub">Solicite uma proposta comercial personalizada para a sua drogaria</p>
            </div>
          </div>
          <button
            type="button"
            @click="fecharModalContato"
            class="btn-close-modal"
            aria-label="Fechar janela"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Conteúdo se já enviado -->
        <div v-if="contatoEnviadoSucesso" class="contato-sucesso-box">
          <div class="sucesso-icon-circle">
            <CheckCircle2 :size="36" />
          </div>
          <h4 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 0.35rem;">
            Solicitação Recebida com Sucesso!
          </h4>
          <p style="font-size: 0.88rem; color: #64748b; line-height: 1.5; margin-bottom: 1.5rem;">
            Nossa equipe entrará em contato via WhatsApp/telefone em até 2 horas úteis para apresentar os planos de implantação da sua farmácia.
          </p>
          <button
            type="button"
            @click="fecharModalContato"
            class="btn-primary-pill"
            style="width: 100%; justify-content: center;"
          >
            <span>Concluir</span>
          </button>
        </div>

        <!-- Formulário de Contato -->
        <form v-else @submit.prevent="enviarSolicitacaoContato" class="modal-form-grid">
          <div class="form-field-group">
            <label class="form-field-label" for="contato-farmacia">Nome da Farmácia / Drogaria *</label>
            <input
              id="contato-farmacia"
              v-model="contatoNomeFarmacia"
              type="text"
              required
              class="form-field-input"
              placeholder="Ex: Farmácia Central de Manipulação"
            />
          </div>

          <div class="form-field-group">
            <label class="form-field-label" for="contato-responsavel">Nome do Responsável / Farmacêutico RT</label>
            <input
              id="contato-responsavel"
              v-model="contatoResponsavel"
              type="text"
              class="form-field-input"
              placeholder="Seu nome completo"
            />
          </div>

          <div class="form-field-group">
            <label class="form-field-label" for="contato-telefone">Telefone / WhatsApp com DDD *</label>
            <input
              id="contato-telefone"
              v-model="contatoTelefone"
              type="tel"
              required
              class="form-field-input"
              placeholder="(11) 99999-9999"
            />
          </div>

          <div class="form-field-group">
            <label class="form-field-label" for="contato-cidade">Cidade / UF</label>
            <input
              id="contato-cidade"
              v-model="contatoCidade"
              type="text"
              class="form-field-input"
              placeholder="São Paulo - SP"
            />
          </div>

          <div class="modal-actions-row">
            <button
              type="button"
              @click="fecharModalContato"
              class="btn-outline-neutral"
              style="padding: 0.6rem 1.25rem;"
            >
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              class="btn-primary-pill"
              style="padding: 0.6rem 1.4rem;"
            >
              <span>Enviar Solicitação</span>
              <ArrowRight :size="15" />
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ====================================================================
   LOGIN VIEW - DESIGN PADRÃO DA DROGARIA AEROPORTO
   Minimalista, Claro, Paleta Azul Cobalto (#2563eb)
   WCAG 2.2 Touch Targets (min 44px) e Estilo do Sistema
   ==================================================================== */

.login-wrapper-light {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-body, #f8fafc);
  padding: 1.5rem;
  overflow-x: hidden;
  font-family: var(--font-sans, 'Inter', -apple-system, sans-serif);
}

.login-decor-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at 50% 15%, rgba(37, 99, 235, 0.07) 0%, transparent 60%),
              radial-gradient(circle at 85% 85%, rgba(5, 150, 105, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.login-card-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 480px;
  background-color: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 24px;
  padding: 2.5rem 2.25rem;
  box-shadow: 0 20px 40px -12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.02);
}

@media (max-width: 520px) {
  .login-card-container {
    padding: 2rem 1.5rem;
    border-radius: 20px;
  }
}

/* HEADER DO LOGIN */
.login-card-header {
  text-align: center;
  margin-bottom: 1.25rem;
}

.brand-logo-pill {
  width: 48px;
  height: 48px;
  margin: 0 auto 0.85rem;
  background-color: var(--color-primary, #2563eb);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.login-card-title {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.25rem;
  letter-spacing: -0.02em;
}

.login-card-subtitle {
  font-size: 0.84rem;
  color: #64748b;
  margin: 0;
}

/* BADGE DE CONEXÃO */
.env-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  margin: 0 auto 1.5rem;
  width: fit-content;
  display: flex;
}

.badge-live {
  background-color: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.badge-local {
  background-color: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

/* ALERTA DE ERRO */
.login-error-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 1.25rem;
}

/* FORMULÁRIO */
.login-form-body {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.form-field-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
}

.form-field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 14px;
  color: #94a3b8;
  pointer-events: none;
}

.form-field-input {
  width: 100%;
  height: 44px;
  background-color: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 0 1rem 0 2.6rem;
  font-size: 0.9rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-field-input:focus {
  border-color: var(--color-primary, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.btn-submit-full {
  width: 100%;
  height: 44px;
  justify-content: center;
  margin-top: 0.35rem;
  font-size: 0.92rem;
}

/* ACESSO RÁPIDO */
.quick-demo-section {
  margin-top: 1.5rem;
}

.divider-line {
  position: relative;
  text-align: center;
  margin-bottom: 0.85rem;
}

.divider-line::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background-color: var(--border-color, #e2e8f0);
}

.divider-line span {
  position: relative;
  background-color: #ffffff;
  padding: 0 0.75rem;
  font-size: 0.74rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.demo-buttons-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.btn-demo-pill {
  width: 100%;
  justify-content: center;
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
}

/* BOX COMERCIAL PARA COMPRA DO SISTEMA */
.sales-contact-box {
  margin-top: 1.5rem;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1.15rem;
  text-align: left;
}

.sales-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.35rem;
}

.sales-icon {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
}

.sales-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
}

.sales-desc {
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.45;
  margin: 0 0 0.85rem;
}

.sales-actions-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.btn-sales-pill {
  width: 100%;
  justify-content: center;
  font-size: 0.8rem;
  padding: 0.45rem 0.85rem;
}

/* FOOTER */
.login-card-footer {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
}

.footer-security-text {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.74rem;
  color: #94a3b8;
}

.link-landing-page {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  padding: 0.2rem;
}

.link-landing-page:hover {
  color: #1d4ed8;
}

/* MODAL DE CONTATO / PROPOSTA COMERCIAL */
.modal-backdrop-blur {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-card-center {
  background-color: #ffffff;
  border-radius: 20px;
  width: 100%;
  max-width: 480px;
  padding: 1.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  border: 1px solid #f1f5f9;
  position: relative;
}

.modal-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid #f1f5f9;
}

.modal-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background-color: #eff6ff;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-h3 {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.modal-sub {
  font-size: 0.78rem;
  color: #64748b;
  margin: 2px 0 0;
}

.btn-close-modal {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.btn-close-modal:hover {
  color: #0f172a;
}

.modal-form-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
}

.contato-sucesso-box {
  text-align: center;
  padding: 1rem 0;
}

.sucesso-icon-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #ecfdf5;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
}
</style>
