<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';
import { useConfirmDialog } from '../composables/useConfirmDialog';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
} from 'lucide-vue-next';

const dialog = useConfirmDialog();

const tituloPadrao = computed(() => {
  if (dialog.options.value.title) return dialog.options.value.title;
  if (dialog.options.value.isConfirm) {
    if (dialog.options.value.tipo === 'perigo') return 'Confirmar Remoção';
    return 'Confirmação';
  }
  if (dialog.options.value.tipo === 'perigo') return 'Atenção';
  if (dialog.options.value.tipo === 'aviso') return 'Aviso';
  if (dialog.options.value.tipo === 'sucesso') return 'Sucesso';
  return 'Notificação';
});

const textoConfirmar = computed(() => {
  if (dialog.options.value.confirmText) return dialog.options.value.confirmText;
  if (dialog.options.value.tipo === 'perigo') return 'Sim, remover';
  return 'Confirmar';
});

const textoCancelar = computed(() => {
  return dialog.options.value.cancelText || 'Cancelar';
});

function handleKeydown(e: KeyboardEvent) {
  if (!dialog.isOpen.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    dialog.onCancel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    dialog.onConfirm();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <transition name="modal-fade">
    <div
      v-if="dialog.isOpen.value"
      class="app-dialog-backdrop"
      @click.self="dialog.onCancel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
    >
      <div class="app-dialog-card" :class="`tipo-${dialog.options.value.tipo || 'info'}`">
        <!-- Botão Fechar no Canto Superior -->
        <button
          type="button"
          @click="dialog.onCancel"
          class="btn-fechar-dialog"
          aria-label="Fechar"
        >
          <X :size="17" />
        </button>

        <!-- Ícone Redondo Semântico -->
        <div class="app-dialog-icon-wrapper" :class="dialog.options.value.tipo || 'info'">
          <AlertTriangle v-if="dialog.options.value.tipo === 'perigo'" :size="24" />
          <AlertCircle v-else-if="dialog.options.value.tipo === 'aviso'" :size="24" />
          <CheckCircle v-else-if="dialog.options.value.tipo === 'sucesso'" :size="24" />
          <Info v-else :size="24" />
        </div>

        <!-- Título -->
        <h3 id="app-dialog-title" class="app-dialog-title">
          {{ tituloPadrao }}
        </h3>

        <!-- Mensagem de Texto -->
        <p class="app-dialog-message">
          {{ dialog.options.value.message }}
        </p>

        <!-- Ações do Pop-up em Pílula (Rounded-Full) -->
        <div class="app-dialog-actions" :class="{ 'actions-confirm': dialog.options.value.isConfirm }">
          <button
            v-if="dialog.options.value.isConfirm"
            type="button"
            @click="dialog.onCancel"
            class="btn-dialog-cancel"
            id="btn-dialog-cancel"
          >
            {{ textoCancelar }}
          </button>

          <button
            type="button"
            @click="dialog.onConfirm"
            class="btn-dialog-confirm"
            :class="[
              dialog.options.value.tipo === 'perigo' ? 'btn-danger' :
              dialog.options.value.tipo === 'sucesso' ? 'btn-success' : 'btn-primary'
            ]"
            id="btn-dialog-confirm"
          >
            {{ dialog.options.value.isConfirm ? textoConfirmar : (dialog.options.value.confirmText || 'Entendido') }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.app-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10005;
  padding: 1.25rem;
}

.app-dialog-card {
  position: relative;
  background: #ffffff;
  border-radius: 20px;
  max-width: 420px;
  width: 100%;
  padding: 1.75rem 1.6rem 1.5rem;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-sizing: border-box;
  animation: dialogPop 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dialogPop {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.btn-fechar-dialog {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-fechar-dialog:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.app-dialog-icon-wrapper {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.1rem;
  flex-shrink: 0;
}

.app-dialog-icon-wrapper.perigo {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.app-dialog-icon-wrapper.aviso {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #d97706;
}

.app-dialog-icon-wrapper.sucesso {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
}

.app-dialog-icon-wrapper.info {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
}

.app-dialog-title {
  font-family: var(--font-heading, inherit);
  font-size: 1.18rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
  line-height: 1.3;
}

.app-dialog-message {
  font-size: 0.88rem;
  color: #64748b;
  line-height: 1.55;
  margin: 0 0 1.5rem 0;
  white-space: pre-line;
  max-width: 360px;
}

.app-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
}

.app-dialog-actions.actions-confirm {
  justify-content: stretch;
}

.btn-dialog-cancel {
  flex: 1;
  padding: 0.65rem 1.15rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 40px;
}

.btn-dialog-cancel:hover {
  background: #f8fafc;
  color: #0f172a;
  border-color: #94a3b8;
}

.btn-dialog-confirm {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1.25rem;
  border-radius: 9999px;
  border: none;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 40px;
}

.btn-dialog-confirm.btn-danger {
  background: #dc2626;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
}

.btn-dialog-confirm.btn-danger:hover {
  background: #b91c1c;
  box-shadow: 0 6px 16px rgba(220, 38, 38, 0.35);
}

.btn-dialog-confirm.btn-primary {
  background: var(--color-primary, #2563eb);
  color: #ffffff;
  box-shadow: 0 4px 12px var(--color-primary-alpha, rgba(37, 99, 235, 0.25));
}

.btn-dialog-confirm.btn-primary:hover {
  filter: brightness(0.92);
}

.btn-dialog-confirm.btn-success {
  background: #059669;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
}

.btn-dialog-confirm.btn-success:hover {
  background: #047857;
}
</style>

