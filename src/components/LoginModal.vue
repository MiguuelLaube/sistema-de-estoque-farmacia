<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useConfirmDialog } from '../composables/useConfirmDialog';
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
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-vue-next';

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'login-success'): void;
}>();

const router = useRouter();
const authStore = useAuthStore();
const dialog = useConfirmDialog();

// Formulário de Login
const email = ref('');
const password = ref('');
const totpCode = ref('');
const recoveryEmail = ref('');
const showPassword = ref(false);
const showForgotPassword = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Modal interno de Contato Comercial
const showContatoModal = ref(false);
const contatoNomeFarmacia = ref('');
const contatoResponsavel = ref('');
const contatoTelefone = ref('');
const contatoCidade = ref('');
const contatoEnviadoSucesso = ref(false);

function fecharModal() {
  emit('update:modelValue', false);
  errorMessage.value = '';
  successMessage.value = '';
  showForgotPassword.value = false;
  showContatoModal.value = false;
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    fecharModal();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (showContatoModal.value) {
      showContatoModal.value = false;
    } else {
      fecharModal();
    }
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (typeof document !== 'undefined') {
      if (val) {
        const supportsGutter = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('scrollbar-gutter', 'stable');
        if (!supportsGutter && typeof window !== 'undefined') {
          const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
          if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
          }
        }
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    }
  }
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown);
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
});

function abrirEsqueciSenha() {
  if (email.value.trim()) {
    recoveryEmail.value = email.value.trim();
  }
  showForgotPassword.value = true;
  errorMessage.value = '';
  successMessage.value = '';
}

async function handleLogin() {
  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;
  try {
    const res = await authStore.login(email.value, password.value);
    if (res.success) {
      password.value = '';
      emit('login-success');
      fecharModal();
      router.push(res.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
    } else if (res.mfaRequired) {
      password.value = '';
      totpCode.value = '';
      successMessage.value = res.message || 'Digite o código de 6 dígitos do autenticador.';
    } else {
      errorMessage.value = res.message || 'Identificador ou senha incorretos.';
    }
  } catch (err: any) {
    console.error('[LoginModal Catch Exception]:', err);
    errorMessage.value = err?.message || 'Falha de comunicação ou credenciais incorretas. Tente novamente.';
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
      emit('login-success');
      fecharModal();
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

function abrirWhatsAppComercial() {
  const mensagem = encodeURIComponent(
    'Olá! Tenho interesse em implantar o EncoMed na minha drogaria. Poderiam me apresentar os planos e proposta comercial?'
  );
  window.open(`https://wa.me/5511999999999?text=${mensagem}`, '_blank', 'noopener,noreferrer');
}

async function enviarSolicitacaoContato() {
  if (!contatoNomeFarmacia.value.trim() || !contatoTelefone.value.trim()) {
    await dialog.alert({
      title: 'Campos Obrigatórios',
      message: 'Por favor, preencha o nome da drogaria e o telefone para contato.',
      tipo: 'aviso',
    });
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
  <Teleport to="body">
    <Transition name="login-modal-fade">
      <div
        v-if="modelValue"
        class="login-floating-backdrop"
        @click="handleBackdropClick"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floating-login-title"
      >
        <div class="login-floating-card">
          <!-- Botão Fechar Modal (X) -->
          <button
            type="button"
            @click="fecharModal"
            class="btn-close-floating"
            title="Fechar (voltar para a página)"
            aria-label="Fechar janela de login"
          >
            <X :size="18" />
          </button>

          <!-- Topo: Marca e Título -->
          <div class="modal-card-header">
            <img
              src="/encomed-logo.svg"
              alt="EncoMed"
              class="brand-logo-img"
            />
            <h2 id="floating-login-title" class="login-title">Acesso Seguro</h2>
            <p class="login-subtitle">Sistema de Encomendas e Gestão de Medicamentos</p>
          </div>

          <!-- Badge de Segurança Zero-Trust -->
          <div class="env-badge-pill">
            <span class="status-indicator-dot"></span>
            <span>Conexão Criptografada • Proteção Zero-Trust Ativa</span>
          </div>

          <!-- Alerta de Erro Sanitizado -->
          <div v-if="errorMessage" class="login-error-alert" role="alert">
            <AlertCircle :size="16" aria-hidden="true" style="flex-shrink: 0;" />
            <div style="display: flex; flex-direction: column; gap: 0.35rem; width: 100%;">
              <span>{{ errorMessage }}</span>
              <button
                v-if="!showForgotPassword && (errorMessage.includes('incorretos') || errorMessage.includes('credenciais') || errorMessage.includes('senha'))"
                type="button"
                @click="abrirEsqueciSenha"
                class="link-redefinir-inline"
              >
                Clique aqui para redefinir sua senha por e-mail &rarr;
              </button>
            </div>
          </div>

          <!-- Alerta Informativo / Sucesso -->
          <div v-if="successMessage" class="login-success-alert" role="status">
            <ShieldCheck :size="16" aria-hidden="true" style="flex-shrink: 0;" />
            <span>{{ successMessage }}</span>
          </div>

          <!-- FLUXO 1: 2FA TOTP (SE REQUERIDO) -->
          <form v-if="authStore.mfaStage !== 'none'" @submit.prevent="handleMfaSubmit" class="login-form-body">
            <div class="mfa-box">
              <div class="mfa-title">Autenticação em Dois Fatores (2FA)</div>
              <p class="mfa-desc">Digite o código de 6 dígitos gerado pelo aplicativo autenticador.</p>
            </div>

            <div class="form-field-group">
              <label class="form-field-label" for="modal-totp-code">Código do Autenticador (6 dígitos)</label>
              <div class="input-wrapper">
                <KeyRound :size="17" class="field-icon" aria-hidden="true" />
                <input
                  id="modal-totp-code"
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

            <button type="submit" class="btn-primary-pill btn-submit-full" :disabled="loading">
              <Loader2 v-if="loading" :size="16" class="spin-animation" />
              <ShieldCheck v-else :size="17" />
              <span>{{ loading ? 'Verificando 2FA...' : 'Confirmar Segundo Fator' }}</span>
            </button>

            <button
              type="button"
              @click="cancelarMfa"
              class="btn-outline-neutral btn-submit-full"
            >
              <ArrowLeft :size="15" />
              <span>Voltar ao Login</span>
            </button>
          </form>

          <!-- FLUXO 2: RECUPERAÇÃO DE SENHA -->
          <form v-else-if="showForgotPassword" @submit.prevent="handleSolicitarRecuperacao" class="login-form-body">
            <div class="form-field-group">
              <label class="form-field-label" for="modal-recovery-email">E-mail Cadastrado</label>
              <div class="input-wrapper">
                <Mail :size="17" class="field-icon" aria-hidden="true" />
                <input
                  id="modal-recovery-email"
                  v-model="recoveryEmail"
                  type="email"
                  required
                  autocomplete="email"
                  class="form-field-input"
                  placeholder="seu.email@drogaria.com.br"
                />
              </div>
            </div>

            <button type="submit" class="btn-primary-pill btn-submit-full" :disabled="loading">
              <Loader2 v-if="loading" :size="16" class="spin-animation" />
              <Send v-else :size="16" />
              <span>{{ loading ? 'Enviando link...' : 'Enviar Link de Recuperação' }}</span>
            </button>

            <button
              type="button"
              @click="showForgotPassword = false; errorMessage = ''; successMessage = '';"
              class="btn-outline-neutral btn-submit-full"
            >
              <ArrowLeft :size="15" />
              <span>Voltar para o Login</span>
            </button>
          </form>

          <!-- FLUXO 3: LOGIN CORPORATIVO PADRÃO -->
          <form v-else @submit.prevent="handleLogin" class="login-form-body">
            <div class="form-field-group">
              <label class="form-field-label" for="modal-login-email">Identificador Corporativo</label>
              <div class="input-wrapper">
                <Mail :size="17" class="field-icon" aria-hidden="true" />
                <input
                  id="modal-login-email"
                  v-model.trim="email"
                  type="email"
                  required
                  autocomplete="username"
                  class="form-field-input"
                  placeholder="colaborador@drogaria.com.br"
                />
              </div>
            </div>

            <div class="form-field-group">
              <div class="label-with-link">
                <label class="form-field-label" for="modal-login-password">Senha de Acesso</label>
                <button
                  type="button"
                  @click="abrirEsqueciSenha"
                  class="btn-forgot-password"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div class="input-wrapper">
                <Lock :size="17" class="field-icon" aria-hidden="true" />
                <input
                  id="modal-login-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  class="form-field-input"
                  style="padding-right: 2.75rem;"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="btn-toggle-eye"
                  :title="showPassword ? 'Ocultar senha' : 'Ver senha'"
                  aria-label="Alternar visibilidade da senha"
                >
                  <EyeOff v-if="showPassword" :size="17" />
                  <Eye v-else :size="17" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="btn-primary-pill btn-submit-full"
              :disabled="loading"
              id="btn-modal-login-submit"
            >
              <Loader2 v-if="loading" :size="17" class="spin-animation" />
              <LogIn v-else :size="17" aria-hidden="true" />
              <span>{{ loading ? 'Autenticando...' : 'Entrar no Sistema' }}</span>
            </button>
          </form>

          <!-- BOX COMERCIAL: IMPLANTAR ENCOMED -->
          <div v-if="authStore.mfaStage === 'none'" class="sales-contact-box">
            <div class="sales-header">
              <Building2 :size="15" class="sales-icon" aria-hidden="true" />
              <span class="sales-title">Deseja implantar este sistema na sua farmácia?</span>
            </div>
            <p class="sales-desc">
              Licenciamento B2B especializado para drogarias independentes e redes.
            </p>
            <div class="sales-actions-grid">
              <button
                type="button"
                @click="abrirWhatsAppComercial"
                class="btn-outline-emerald btn-sales-pill"
              >
                <Send :size="13" aria-hidden="true" />
                <span>Falar com Consultor</span>
              </button>

              <button
                type="button"
                @click="showContatoModal = true"
                class="btn-outline-neutral btn-sales-pill"
              >
                <Phone :size="13" aria-hidden="true" />
                <span>Solicitar Contato</span>
              </button>
            </div>
          </div>

          <!-- Rodapé de Auditoria e Segurança -->
          <div class="modal-card-footer">
            <span class="footer-security-text">
              <Lock :size="11" aria-hidden="true" />
              <span>Acesso monitorado, protegido contra força bruta e auditado (LGPD)</span>
            </span>
          </div>

          <!-- SUB-MODAL DE CONTATO COMERCIAL -->
          <div
            v-if="showContatoModal"
            class="submodal-backdrop"
            @click.self="fecharModalContato"
          >
            <div class="submodal-card">
              <div class="submodal-header">
                <div>
                  <h3 class="submodal-title">Implantar na sua Drogaria</h3>
                  <p class="submodal-subtitle">Receba uma proposta comercial personalizada</p>
                </div>
                <button
                  type="button"
                  @click="fecharModalContato"
                  class="btn-close-submodal"
                >
                  <X :size="16" />
                </button>
              </div>

              <div v-if="contatoEnviadoSucesso" class="submodal-success">
                <CheckCircle2 :size="32" style="color: #059669;" />
                <h4>Solicitação Recebida!</h4>
                <p>Nossa equipe entrará em contato em até 2 horas úteis pelo WhatsApp ou telefone.</p>
                <button
                  type="button"
                  @click="fecharModalContato"
                  class="btn-primary-pill"
                  style="width: 100%; justify-content: center;"
                >
                  Fechar
                </button>
              </div>

              <form v-else @submit.prevent="enviarSolicitacaoContato" class="submodal-form">
                <div class="form-field-group">
                  <label class="form-field-label">Nome da Farmácia / Drogaria *</label>
                  <input
                    v-model="contatoNomeFarmacia"
                    type="text"
                    required
                    class="form-field-input"
                    placeholder="Ex: Farmácia Central"
                  />
                </div>

                <div class="form-field-group">
                  <label class="form-field-label">Telefone / WhatsApp com DDD *</label>
                  <input
                    v-model="contatoTelefone"
                    type="tel"
                    required
                    class="form-field-input"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div class="form-field-group">
                  <label class="form-field-label">Cidade / UF</label>
                  <input
                    v-model="contatoCidade"
                    type="text"
                    class="form-field-input"
                    placeholder="Ex: Curitiba - PR"
                  />
                </div>

                <div class="submodal-actions">
                  <button
                    type="button"
                    @click="fecharModalContato"
                    class="btn-outline-neutral"
                    style="flex: 1;"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    class="btn-primary-pill"
                    style="flex: 1; justify-content: center;"
                  >
                    <span>Enviar</span>
                    <ArrowRight :size="15" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Backdrop Flutuante com Efeito Blur Glassmorphic */
.login-floating-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background-color: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  overflow-y: auto;
}

/* Card Flutuante Centralizado */
.login-floating-card {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border-radius: 24px;
  padding: 2.25rem 2rem;
  box-shadow: 0 25px 65px -12px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(226, 232, 240, 0.85);
  animation: modalCardPop 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  margin: auto;
}

@keyframes modalCardPop {
  0% {
    opacity: 0;
    transform: scale(0.94) translateY(14px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Botão Fechar (X) */
.btn-close-floating {
  position: absolute;
  top: 1.15rem;
  right: 1.15rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 10;
}

.btn-close-floating:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
  transform: scale(1.06);
}

/* Header */
.modal-card-header {
  text-align: center;
  margin-bottom: 0.9rem;
}

.brand-logo-img {
  max-height: 44px;
  max-width: 180px;
  width: auto;
  object-fit: contain;
  margin: 0 auto 0.65rem auto;
  display: block;
}

.login-title {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.2rem;
  letter-spacing: -0.02em;
}

.login-subtitle {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
}

/* Badge Zero-Trust */
.env-badge-pill {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.28rem 0.75rem;
  border-radius: 9999px;
  margin: 0 auto 1.25rem;
  width: fit-content;
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

/* Alertas */
.login-error-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background-color: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.8rem;
  margin-bottom: 1.1rem;
}

.link-redefinir-inline {
  background: none;
  border: none;
  color: #b91c1c;
  text-decoration: underline;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;
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
  font-size: 0.8rem;
  margin-bottom: 1.1rem;
}

/* Formulário */
.login-form-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
}

.form-field-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
}

.label-with-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-forgot-password {
  background: none;
  border: none;
  color: var(--color-primary, #2563eb);
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.btn-forgot-password:hover {
  text-decoration: underline;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 13px;
  color: #94a3b8;
  pointer-events: none;
}

.form-field-input {
  width: 100%;
  height: 42px;
  background-color: #ffffff;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 12px;
  padding: 0 1rem 0 2.5rem;
  font-size: 0.88rem;
  color: #0f172a;
  outline: none;
  transition: all 0.15s ease;
}

.form-field-input:focus {
  border-color: var(--color-primary, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.btn-toggle-eye {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.btn-toggle-eye:hover {
  color: #0f172a;
}

.btn-submit-full {
  width: 100%;
  height: 44px;
  justify-content: center;
  margin-top: 0.25rem;
  font-size: 0.88rem;
}

/* 2FA */
.mfa-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 0.85rem;
  text-align: center;
}

.mfa-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.25rem;
}

.mfa-desc {
  font-size: 0.74rem;
  color: #475569;
  margin: 0;
  line-height: 1.4;
}

/* Caixa Comercial */
.sales-contact-box {
  margin-top: 1.25rem;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 0.95rem 1rem;
  text-align: left;
}

.sales-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.sales-icon {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
}

.sales-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f172a;
}

.sales-desc {
  font-size: 0.73rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0 0 0.65rem;
}

.sales-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}

.btn-sales-pill {
  padding: 0.42rem 0.65rem;
  font-size: 0.7rem;
  justify-content: center;
  width: 100%;
}

/* Rodapé */
.modal-card-footer {
  margin-top: 1.1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
  text-align: center;
}

.footer-security-text {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.68rem;
  color: #94a3b8;
}

/* Sub-modal de Contato */
.submodal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 20;
}

.submodal-card {
  background: #ffffff;
  border-radius: 18px;
  width: 100%;
  max-width: 380px;
  padding: 1.35rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.submodal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.submodal-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.submodal-subtitle {
  font-size: 0.74rem;
  color: #64748b;
  margin: 2px 0 0;
}

.btn-close-submodal {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

.btn-close-submodal:hover {
  color: #0f172a;
}

.submodal-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.submodal-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.submodal-success {
  text-align: center;
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.submodal-success h4 {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
}

.submodal-success p {
  font-size: 0.78rem;
  color: #64748b;
  margin: 0 0 0.8rem;
  line-height: 1.45;
}

/* Transições Vue */
.login-modal-fade-enter-active,
.login-modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.login-modal-fade-enter-from,
.login-modal-fade-leave-to {
  opacity: 0;
}

.spin-animation {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
