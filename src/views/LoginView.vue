<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../services/supabase';
import {
  Lock,
  Mail,
  LogIn,
  ShieldCheck,
  AlertCircle,
  Send,
  Phone,
  Building2,
  X,
  CheckCircle2,
  ArrowRight,
  KeyRound,
  ArrowLeft,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const emailConviteModo = ref('');

// Só exibe o boas-vindas de primeiro acesso se houver sessão REAL de recuperação (link com token do e-mail).
// Nunca ativamos o modo "criar senha" a partir de parâmetro de URL (poderia ser forjado).
onMounted(async () => {
  if (!authStore.passwordRecoveryMode) return;
  const { data } = await supabase.auth.getSession();
  emailConviteModo.value = data.session?.user?.email || '';
});

// Credenciais limpas por padrão (sem pré-preenchimento ou exposição de e-mails administrativos)
const email = ref('');
const password = ref('');
const totpCode = ref('');
const recoveryEmail = ref('');
const newPassword = ref('');
const newPasswordConfirm = ref('');

const showForgotPassword = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Modal de Contato / Compra do Sistema
const showContatoModal = ref(false);
const contatoNomeFarmacia = ref('');
const contatoResponsavel = ref('');
const contatoTelefone = ref('');
const contatoCidade = ref('');
const contatoEnviadoSucesso = ref(false);

async function handleLogin() {
  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;
  try {
    const res = await authStore.login(email.value, password.value);
    if (res.success) {
      password.value = '';
      router.push(res.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
    } else if (res.mfaRequired) {
      password.value = '';
      totpCode.value = '';
      successMessage.value = res.message || '';
    } else {
      errorMessage.value = res.message || 'Credenciais inválidas.';
    }
  } catch (err) {
    console.error('[Login Catch Exception]:', err);
    errorMessage.value = 'Não foi possível concluir a autenticação no momento.';
  } finally {
    loading.value = false;
  }
}

async function handleMfaSubmit() {
  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;
  try {
    const res = await authStore.verificarCodigoMfa(totpCode.value);
    if (res.success) {
      totpCode.value = '';
      router.push(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
    } else {
      errorMessage.value = res.message || 'Código 2FA inválido.';
    }
  } finally {
    loading.value = false;
  }
}

async function cancelarMfa() {
  totpCode.value = '';
  errorMessage.value = '';
  successMessage.value = '';
  await authStore.logout();
}

async function handleSolicitarRecuperacao() {
  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;
  try {
    const res = await authStore.solicitarRecuperacaoSenha(recoveryEmail.value);
    if (res.success) {
      successMessage.value = res.message;
    } else {
      errorMessage.value = res.message;
    }
  } finally {
    loading.value = false;
  }
}

async function handleRedefinirSenha() {
  errorMessage.value = '';
  successMessage.value = '';
  if (newPassword.value !== newPasswordConfirm.value) {
    errorMessage.value = 'A confirmação de senha não confere.';
    return;
  }
  loading.value = true;
  try {
    const res = await authStore.redefinirSenhaRecuperacao(newPassword.value);
    if (res.success) {
      newPassword.value = '';
      newPasswordConfirm.value = '';
      successMessage.value = res.message;
      router.push({ name: 'dashboard' });
    } else {
      errorMessage.value = res.message;
    }
  } finally {
    loading.value = false;
  }
}

function abrirWhatsAppComercial() {
  const mensagem = encodeURIComponent(
    'Olá! Tenho interesse em contratar o Sistema de Estoque e Encomendas da Drogaria Aeroporto para a minha farmácia. Poderiam me apresentar os planos e proposta comercial?'
  );
  window.open(`https://wa.me/5511999999999?text=${mensagem}`, '_blank', 'noopener,noreferrer');
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
    <div class="login-decor-bg"></div>

    <div class="login-card-container">
      <!-- Topo: Logo Oficial e Marca -->
      <div class="login-card-header" style="text-align: center;">
        <img
          src="/encomed-logo.png"
          alt="EncoMed - Sistema de Encomendas e Gestão de Medicamentos"
          style="max-height: 58px; max-width: 220px; object-fit: contain; margin: 0 auto 0.75rem auto; display: block;"
        />
        <h1 class="login-card-title">Acesso Seguro</h1>
        <p class="login-card-subtitle">Sistema de Encomendas e Gestão de Medicamentos</p>
      </div>

      <!-- Badge de Segurança -->
      <div class="env-badge-pill badge-live">
        <span class="status-indicator-dot"></span>
        <span>Conexão Criptografada • Proteção Zero-Trust Ativa</span>
      </div>

      <!-- Alerta de Erro Sanitizado -->
      <div v-if="errorMessage" class="login-error-alert" role="alert">
        <AlertCircle :size="16" aria-hidden="true" style="flex-shrink: 0;" />
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Alerta Informativo / Sucesso -->
      <div v-if="successMessage" class="login-success-alert" role="status">
        <ShieldCheck :size="16" aria-hidden="true" style="flex-shrink: 0;" />
        <span>{{ successMessage }}</span>
      </div>

      <!-- FLUXO 1: REDEFINIÇÃO DE SENHA VIA LINK DE RECUPERAÇÃO / CONVITE -->
      <form v-if="authStore.passwordRecoveryMode" @submit.prevent="handleRedefinirSenha" class="login-form-body">
        <div v-if="emailConviteModo" style="padding: 0.75rem 1rem; border-radius: 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-size: 0.82rem; line-height: 1.45;">
          👋 <strong>Primeiro Acesso Farmácia:</strong> Crie sua senha de administrador para a conta <strong>{{ emailConviteModo }}</strong>.
        </div>

        <div class="form-field-group">
          <label class="form-field-label" for="input-new-password">Nova Senha Forte (mín. 12 caracteres)</label>
          <div class="input-wrapper">
            <Lock :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-new-password"
              v-model="newPassword"
              type="password"
              minlength="12"
              required
              autocomplete="new-password"
              class="form-field-input"
              placeholder="Digite sua nova senha"
            />
          </div>
        </div>

        <div class="form-field-group">
          <label class="form-field-label" for="input-confirm-password">Confirmar Nova Senha</label>
          <div class="input-wrapper">
            <Lock :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-confirm-password"
              v-model="newPasswordConfirm"
              type="password"
              minlength="12"
              required
              autocomplete="new-password"
              class="form-field-input"
              placeholder="Repita a nova senha"
            />
          </div>
        </div>

        <button type="submit" class="btn-primary-pill btn-submit-full" :disabled="loading">
          <CheckCircle2 :size="17" />
          <span>{{ loading ? 'Salvando...' : 'Atualizar Senha de Acesso' }}</span>
        </button>
      </form>

      <!-- FLUXO 2: AUTENTICAÇÃO EM DOIS FATORES OBRIGATÓRIA (2FA TOTP - ENROLL OU VERIFY) -->
      <form v-else-if="authStore.mfaStage !== 'none'" @submit.prevent="handleMfaSubmit" class="login-form-body">
        <div
          v-if="authStore.mfaStage === 'enroll'"
          style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 1rem; text-align: center;"
        >
          <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; margin-bottom: 0.4rem;">
            Configuração Obrigatória de 2FA (TOTP)
          </div>
          <p style="font-size: 0.78rem; color: #475569; margin: 0 0 0.75rem; line-height: 1.4;">
            Escaneie o QR Code abaixo no Google Authenticator, Authy ou Microsoft Authenticator e digite o código de 6 dígitos gerado.
          </p>
          <div
            v-if="authStore.mfaQrCode"
            style="background: #ffffff; padding: 10px; border-radius: 12px; display: inline-block; border: 1px solid #e2e8f0;"
          >
            <img :src="authStore.mfaQrCode" alt="QR Code 2FA TOTP" style="width: 190px; height: 190px; display: block;" />
          </div>
          <div v-if="authStore.mfaSecret" style="margin-top: 0.65rem; font-size: 0.74rem; color: #64748b;">
            Chave manual:
            <code style="display: block; margin-top: 3px; font-weight: 700; color: #0f172a; background: #e2e8f0; padding: 4px 8px; border-radius: 6px; user-select: all;">
              {{ authStore.mfaSecret }}
            </code>
          </div>
        </div>

        <div class="form-field-group">
          <label class="form-field-label" for="input-totp-code">Código de 6 Dígitos do Autenticador (2FA)</label>
          <div class="input-wrapper">
            <KeyRound :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-totp-code"
              v-model="totpCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              pattern="[0-9]{6}"
              required
              autocomplete="one-time-code"
              class="form-field-input"
              style="letter-spacing: 0.25em; font-weight: 700; font-size: 1.05rem;"
              placeholder="000000"
            />
          </div>
        </div>

        <button type="submit" class="btn-primary-pill btn-submit-full" :disabled="loading" id="btn-mfa-verify">
          <ShieldCheck :size="17" />
          <span>{{ loading ? 'Verificando 2FA...' : 'Confirmar Segundo Fator (AAL2)' }}</span>
        </button>

        <button
          type="button"
          @click="cancelarMfa"
          class="btn-outline-neutral btn-submit-full"
          style="margin-top: 0;"
        >
          <ArrowLeft :size="15" />
          <span>Cancelar e voltar ao login</span>
        </button>
      </form>

      <!-- FLUXO 3: SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA -->
      <form v-else-if="showForgotPassword" @submit.prevent="handleSolicitarRecuperacao" class="login-form-body">
        <div class="form-field-group">
          <label class="form-field-label" for="input-recovery-email">E-mail Cadastrado</label>
          <div class="input-wrapper">
            <Mail :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-recovery-email"
              v-model="recoveryEmail"
              type="email"
              required
              autocomplete="email"
              class="form-field-input"
              placeholder="seu.email@drogaria.com.br"
            />
          </div>
        </div>

        <button type="submit" class="btn-primary-pill btn-submit-full" :disabled="loading" id="btn-send-recovery">
          <Send :size="16" />
          <span>{{ loading ? 'Enviando...' : 'Enviar Link de Recuperação' }}</span>
        </button>

        <button
          type="button"
          @click="showForgotPassword = false; errorMessage = ''; successMessage = '';"
          class="btn-outline-neutral btn-submit-full"
          style="margin-top: 0;"
        >
          <ArrowLeft :size="15" />
          <span>Voltar para o Login</span>
        </button>
      </form>

      <!-- FLUXO 4: LOGIN CORPORATIVO PADRÃO -->
      <form v-else @submit.prevent="handleLogin" class="login-form-body">
        <div class="form-field-group">
          <label class="form-field-label" for="input-login-email">Identificador Corporativo</label>
          <div class="input-wrapper">
            <Mail :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-login-email"
              v-model="email"
              type="email"
              required
              autocomplete="username"
              class="form-field-input"
              placeholder="colaborador@drogaria.com.br"
            />
          </div>
        </div>

        <div class="form-field-group">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label class="form-field-label" for="input-login-password">Senha de Acesso</label>
            <button
              type="button"
              @click="showForgotPassword = true; errorMessage = ''; successMessage = '';"
              style="background: none; border: none; color: #2563eb; font-size: 0.76rem; font-weight: 600; cursor: pointer; padding: 0;"
              id="btn-esqueci-senha"
            >
              Esqueci minha senha
            </button>
          </div>
          <div class="input-wrapper">
            <Lock :size="17" class="field-icon" aria-hidden="true" />
            <input
              id="input-login-password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="form-field-input"
              placeholder="••••••••••••"
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

      <!-- DESTAQUE COMERCIAL: OPÇÃO PARA CONTRATAR O SISTEMA -->
      <div v-if="authStore.mfaStage === 'none' && !authStore.passwordRecoveryMode" class="sales-contact-box">
        <div class="sales-header">
          <Building2 :size="16" class="sales-icon" aria-hidden="true" />
          <span class="sales-title">Deseja implantar este sistema na sua farmácia?</span>
        </div>
        <p class="sales-desc">
          Licenciamento B2B especializado para drogarias independentes e redes. Automatize encomendas de balcão e conferência de NF-e.
        </p>
        <div class="sales-actions-grid">
          <button
            type="button"
            @click="abrirWhatsAppComercial"
            class="btn-outline-emerald btn-sales-pill"
            id="btn-comprar-whatsapp"
          >
            <Send :size="14" aria-hidden="true" />
            <span>Falar com Consultor (WhatsApp)</span>
          </button>

          <button
            type="button"
            @click="showContatoModal = true"
            class="btn-outline-neutral btn-sales-pill"
            id="btn-solicitar-proposta"
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
          <span>Acesso monitorado, protegido contra força bruta e auditado (LGPD)</span>
        </span>
      </div>
    </div>

    <!-- MODAL DE CONTATO COMERCIAL -->
    <div
      v-if="showContatoModal"
      class="modal-backdrop-blur"
      role="dialog"
      aria-labelledby="modal-contato-title"
      aria-modal="true"
    >
      <div class="modal-card-center">
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

        <form v-else @submit.prevent="enviarSolicitacaoContato" class="modal-form-grid">
          <div class="form-field-group">
            <label class="form-field-label" for="contato-farmacia">Nome da Farmácia / Drogaria *</label>
            <input
              id="contato-farmacia"
              v-model="contatoNomeFarmacia"
              type="text"
              required
              class="form-field-input"
              style="padding-left: 1rem;"
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
              style="padding-left: 1rem;"
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
              style="padding-left: 1rem;"
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
              style="padding-left: 1rem;"
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
  inset: 0;
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

.env-badge-pill {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  margin: 0 auto 1.5rem;
  width: fit-content;
}

.badge-live {
  background-color: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

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

.login-success-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 1.25rem;
}

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
  font-size: 0.9rem;
}

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
