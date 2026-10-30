<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Loader2,
  KeyRound,
} from 'lucide-vue-next';

const authStore = useAuthStore();
const router = useRouter();

const novaSenha = ref('');
const confirmarNovaSenha = ref('');
const showSenha = ref(false);
const showConfirmar = ref(false);

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

async function handleSalvarSenha() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!novaSenha.value || novaSenha.value.length < 8) {
    errorMessage.value = 'A nova senha deve possuir no mínimo 8 caracteres.';
    return;
  }

  if (novaSenha.value !== confirmarNovaSenha.value) {
    errorMessage.value = 'A confirmação de senha não confere.';
    return;
  }

  loading.value = true;
  try {
    const res = await authStore.concluirTrocaSenhaPrimeiroAcesso(novaSenha.value);
    if (res.sucesso) {
      successMessage.value = res.mensagem;
      novaSenha.value = '';
      confirmarNovaSenha.value = '';
      // Modal fecha automaticamente pois authStore.exigeTrocaSenha passa a ser false
    } else {
      errorMessage.value = res.mensagem;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || 'Falha ao salvar a nova senha definitiva.';
  } finally {
    loading.value = false;
  }
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div v-if="authStore.exigeTrocaSenha" class="modal-primeiro-acesso-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-primeiro-acesso-titulo">
    <div class="modal-primeiro-acesso-card">
      <!-- Topo com Ícone e Marca -->
      <div class="modal-header-box">
        <div class="icon-circle-badge">
          <KeyRound :size="26" />
        </div>
        <h2 id="modal-primeiro-acesso-titulo" class="modal-title">
          Defina sua Senha Definitiva
        </h2>
        <p class="modal-subtitle">
          Primeiro acesso à plataforma <strong>{{ authStore.currentTenant.nome_empresa }}</strong>
        </p>
      </div>

      <!-- Mensagem Informativa de Boas-Vindas -->
      <div class="primeiro-acesso-aviso">
        <p>
          👋 Olá, <strong>{{ authStore.currentUser.nome }}</strong>! Você acessou o sistema utilizando uma <strong>senha provisória</strong>.
        </p>
        <p style="margin-top: 0.35rem; font-size: 0.78rem; opacity: 0.9;">
          Por conformidade de segurança e proteção de dados da sua farmácia (LGPD), cadastre sua senha definitiva para continuar utilizando o sistema.
        </p>
      </div>

      <!-- Alertas -->
      <div v-if="errorMessage" class="alerta-erro" role="alert">
        <AlertCircle :size="16" style="flex-shrink: 0;" />
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="successMessage" class="alerta-sucesso" role="status">
        <CheckCircle2 :size="16" style="flex-shrink: 0;" />
        <span>{{ successMessage }}</span>
      </div>

      <!-- Formulário de Alteração de Senha -->
      <form @submit.prevent="handleSalvarSenha" class="form-troca-senha">
        <div class="campo-grupo">
          <label class="campo-label" for="input-nova-senha">Nova Senha Definitiva (mín. 8 caracteres) *</label>
          <div class="input-wrapper-senha">
            <Lock :size="17" class="field-icon-left" />
            <input
              id="input-nova-senha"
              v-model="novaSenha"
              :type="showSenha ? 'text' : 'password'"
              minlength="8"
              required
              autocomplete="new-password"
              class="campo-input"
              placeholder="Digite sua nova senha definitiva"
            />
            <button
              type="button"
              @click="showSenha = !showSenha"
              class="btn-toggle-eye"
              :title="showSenha ? 'Ocultar senha' : 'Ver senha'"
              aria-label="Alternar visibilidade da senha"
            >
              <EyeOff v-if="showSenha" :size="17" />
              <Eye v-else :size="17" />
            </button>
          </div>
        </div>

        <div class="campo-grupo">
          <label class="campo-label" for="input-confirmar-senha">Confirmar Nova Senha *</label>
          <div class="input-wrapper-senha">
            <Lock :size="17" class="field-icon-left" />
            <input
              id="input-confirmar-senha"
              v-model="confirmarNovaSenha"
              :type="showConfirmar ? 'text' : 'password'"
              minlength="8"
              required
              autocomplete="new-password"
              class="campo-input"
              placeholder="Repita a nova senha"
            />
            <button
              type="button"
              @click="showConfirmar = !showConfirmar"
              class="btn-toggle-eye"
              :title="showConfirmar ? 'Ocultar senha' : 'Ver senha'"
              aria-label="Alternar visibilidade da confirmação"
            >
              <EyeOff v-if="showConfirmar" :size="17" />
              <Eye v-else :size="17" />
            </button>
          </div>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="btn-primary-pill btn-salvar-senha"
          id="btn-salvar-senha-primeiro-acesso"
        >
          <Loader2 v-if="loading" class="animate-spin" :size="17" />
          <ShieldCheck v-else :size="17" />
          <span>{{ loading ? 'Salvando Senha...' : 'Salvar Nova Senha e Acessar Sistema' }}</span>
        </button>
      </form>

      <!-- Rodapé com Opção de Logout -->
      <div class="modal-footer-box">
        <button
          type="button"
          @click="handleLogout"
          class="btn-link-sair"
          title="Sair do sistema agora"
        >
          <LogOut :size="14" />
          <span>Sair da conta e voltar ao login</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-primeiro-acesso-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background-color: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.modal-primeiro-acesso-card {
  width: 100%;
  max-width: 480px;
  background-color: #ffffff;
  border-radius: 24px;
  padding: 2.25rem 2rem;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
  border: 1px solid #e2e8f0;
  animation: modalEntrada 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalEntrada {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header-box {
  text-align: center;
  margin-bottom: 1.25rem;
}

.icon-circle-badge {
  width: 56px;
  height: 56px;
  margin: 0 auto 0.85rem;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1.5px solid #bfdbfe;
  color: #2563eb;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.15);
}

.modal-title {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.35rem;
  letter-spacing: -0.02em;
}

.modal-subtitle {
  font-size: 0.84rem;
  color: #64748b;
  margin: 0;
}

.primeiro-acesso-aviso {
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  margin-bottom: 1.25rem;
  font-size: 0.82rem;
  color: #1e40af;
  line-height: 1.45;
}

.primeiro-acesso-aviso p {
  margin: 0;
}

.alerta-erro {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 1.15rem;
}

.alerta-sucesso {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 1.15rem;
}

.form-troca-senha {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.campo-grupo {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
}

.campo-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}

.input-wrapper-senha {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon-left {
  position: absolute;
  left: 14px;
  color: #94a3b8;
  pointer-events: none;
}

.campo-input {
  width: 100%;
  height: 44px;
  background-color: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  padding: 0 2.75rem 0 2.6rem;
  font-size: 0.9rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.campo-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.btn-toggle-eye {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.15s ease, background-color 0.15s ease;
  z-index: 2;
}

.btn-toggle-eye:hover {
  color: #0f172a;
  background-color: #f1f5f9;
}

.btn-salvar-senha {
  width: 100%;
  height: 46px;
  justify-content: center;
  margin-top: 0.5rem;
  font-size: 0.92rem;
  font-weight: 700;
}

.modal-footer-box {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
  text-align: center;
}

.btn-link-sair {
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  transition: color 0.15s ease;
}

.btn-link-sair:hover {
  color: #dc2626;
}
</style>
