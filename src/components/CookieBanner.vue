<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ShieldCheck,
  Cookie as CookieIcon,
  Check,
  Settings2,
  X,
  Lock,
  Palette,
  Activity,
} from 'lucide-vue-next';
import {
  carregarConsentimentoLGPD,
  salvarConsentimentoLGPD,
  type ConsentimentoCookies,
} from '../services/cookieStorage';

const visivel = ref(false);
const modalPreferenciasAberto = ref(false);

const consentimento = ref<ConsentimentoCookies>({
  essenciais: true,
  preferencias: true,
  analiticos: false,
  atualizado_em: '',
});

onMounted(() => {
  const salvo = carregarConsentimentoLGPD();
  if (!salvo) {
    // Primeiro acesso do usuário: exibe o banner LGPD
    visivel.value = true;
  } else {
    consentimento.value = salvo;
  }

  // Registra ouvinte global para que outras telas possam reabrir as configurações de cookies
  if (typeof window !== 'undefined') {
    (window as any).abrirGerenciadorCookies = () => {
      modalPreferenciasAberto.value = true;
    };
    (window as any).reabrirBannerCookies = () => {
      visivel.value = true;
    };

    window.addEventListener('cookie-consent-updated', (event: any) => {
      if (event?.detail) {
        consentimento.value = event.detail;
      } else {
        consentimento.value = {
          essenciais: true,
          preferencias: true,
          analiticos: false,
          atualizado_em: '',
        };
        visivel.value = true;
      }
    });
  }
});

function aceitarTodos() {
  consentimento.value = salvarConsentimentoLGPD({
    essenciais: true,
    preferencias: true,
    analiticos: true,
  });
  visivel.value = false;
  modalPreferenciasAberto.value = false;
}

function aceitarApenasEssenciais() {
  consentimento.value = salvarConsentimentoLGPD({
    essenciais: true,
    preferencias: false,
    analiticos: false,
  });
  visivel.value = false;
  modalPreferenciasAberto.value = false;
}

function salvarPreferenciasPersonalizadas() {
  consentimento.value = salvarConsentimentoLGPD({
    essenciais: true,
    preferencias: consentimento.value.preferencias,
    analiticos: consentimento.value.analiticos,
  });
  visivel.value = false;
  modalPreferenciasAberto.value = false;
}

function abrirModalPreferencias() {
  modalPreferenciasAberto.value = true;
}

function fecharModalPreferencias() {
  modalPreferenciasAberto.value = false;
}
</script>

<template>
  <div>
    <!-- BANNER FLUTUANTE DE COOKIES (RODAPÉ) -->
    <transition name="slide-fade">
      <aside
        v-if="visivel && !modalPreferenciasAberto"
        class="cookie-banner-fixed"
        aria-label="Aviso de Consentimento de Cookies LGPD"
        role="region"
      >
        <div class="cookie-banner-card">
          <div class="cookie-banner-content">
            <div class="cookie-icon-wrapper">
              <CookieIcon class="cookie-icon text-amber-500" :size="24" />
            </div>
            <div class="cookie-text-box">
              <h3 class="cookie-title">
                Privacidade &amp; Cookies no EncoMed
                <span class="cookie-badge-lgpd">LGPD • Lei 13.709/2018</span>
              </h3>
              <p class="cookie-description">
                Utilizamos cookies de sessão e autenticação segura para manter sua conta conectada, garantir a integridade dos dados da sua farmácia e lembrar suas preferências de navegação. Nenhum dado de saúde é compartilhado com terceiros para fins publicitários.
              </p>
            </div>
          </div>

          <div class="cookie-actions">
            <button
              type="button"
              class="btn-cookie-preferences"
              @click="abrirModalPreferencias"
              title="Personalizar categorias de cookies"
            >
              <Settings2 :size="15" />
              <span>Preferências</span>
            </button>

            <button
              type="button"
              class="btn-cookie-essential"
              @click="aceitarApenasEssenciais"
              title="Manter apenas cookies indispensáveis de autenticação"
            >
              <span>Apenas Essenciais</span>
            </button>

            <button
              type="button"
              class="btn-cookie-accept"
              @click="aceitarTodos"
              title="Aceitar todos os cookies para melhor experiência"
            >
              <Check :size="16" />
              <span>Aceitar Todos</span>
            </button>
          </div>
        </div>
      </aside>
    </transition>

    <!-- MODAL DE PREFERÊNCIAS DE COOKIES -->
    <transition name="modal-fade">
      <div
        v-if="modalPreferenciasAberto"
        class="cookie-modal-backdrop"
        @click.self="fecharModalPreferencias"
      >
        <div class="cookie-modal-dialog" role="dialog" aria-modal="true">
          <div class="cookie-modal-header">
            <div class="flex items-center gap-3">
              <div class="modal-icon-circle">
                <ShieldCheck class="text-blue-600" :size="20" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-slate-800">Preferências de Cookies &amp; LGPD</h2>
                <p class="text-xs text-slate-500">Controle a utilização de dados no seu navegador</p>
              </div>
            </div>
            <button
              type="button"
              class="btn-modal-close"
              @click="fecharModalPreferencias"
              aria-label="Fechar"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="cookie-modal-body">
            <p class="text-xs text-slate-600 mb-4 leading-relaxed">
              Em conformidade com a <strong>Lei Geral de Proteção de Dados (Art. 7º e 18)</strong>, você tem total controle sobre quais cookies e tecnologias de armazenamento local autoriza em sua navegação.
            </p>

            <div class="cookie-options-list">
              <!-- 1. ESSENCIAIS (SEMPRE ATIVO) -->
              <div class="cookie-option-card">
                <div class="cookie-option-header">
                  <div class="flex items-center gap-2">
                    <Lock :size="16" class="text-emerald-600" />
                    <span class="font-semibold text-sm text-slate-800">Cookies Estritamente Necessários</span>
                    <span class="badge-always-active">Sempre Ativo</span>
                  </div>
                  <div class="switch-locked" title="Obrigatório para login e segurança">
                    <input type="checkbox" checked disabled class="sr-only" />
                    <span class="switch-slider switch-active disabled"></span>
                  </div>
                </div>
                <p class="cookie-option-desc">
                  Essenciais para a segurança, autenticação com tokens criptografados (Supabase Auth), persistência de sessão corporativa e proteção contra ataques de falsificação de requisições (CSRF). Não podem ser desativados.
                </p>
              </div>

              <!-- 2. PREFERÊNCIAS -->
              <div class="cookie-option-card">
                <div class="cookie-option-header">
                  <div class="flex items-center gap-2">
                    <Palette :size="16" class="text-blue-600" />
                    <span class="font-semibold text-sm text-slate-800">Cookies de Preferências &amp; Layout</span>
                  </div>
                  <label class="switch-toggle">
                    <input
                      type="checkbox"
                      v-model="consentimento.preferencias"
                      class="sr-only"
                    />
                    <span class="switch-slider" :class="{ 'switch-active': consentimento.preferencias }"></span>
                  </label>
                </div>
                <p class="cookie-option-desc">
                  Salvam preferências locais de interface da farmácia, tais como cores da identidade visual, colunas de exibição nas encomendas e estado do menu lateral.
                </p>
              </div>

              <!-- 3. ANALÍTICOS -->
              <div class="cookie-option-card">
                <div class="cookie-option-header">
                  <div class="flex items-center gap-2">
                    <Activity :size="16" class="text-indigo-600" />
                    <span class="font-semibold text-sm text-slate-800">Cookies de Desempenho &amp; Estabilidade</span>
                  </div>
                  <label class="switch-toggle">
                    <input
                      type="checkbox"
                      v-model="consentimento.analiticos"
                      class="sr-only"
                    />
                    <span class="switch-slider" :class="{ 'switch-active': consentimento.analiticos }"></span>
                  </label>
                </div>
                <p class="cookie-option-desc">
                  Coletam métricas anônimas sobre tempo de carregamento de páginas e eventuais falhas de conexão de API para aprimoramento contínuo da estabilidade do sistema.
                </p>
              </div>
            </div>
          </div>

          <div class="cookie-modal-footer">
            <button
              type="button"
              class="btn-footer-reject"
              @click="aceitarApenasEssenciais"
            >
              Rejeitar Não Essenciais
            </button>
            <button
              type="button"
              class="btn-footer-save"
              @click="salvarPreferenciasPersonalizadas"
            >
              Salvar Minhas Escolhas
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* BANNER FLUTUANTE */
.cookie-banner-fixed {
  position: fixed;
  bottom: 1.25rem;
  left: 1.25rem;
  right: 1.25rem;
  z-index: 9999;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.cookie-banner-card {
  pointer-events: auto;
  max-width: 1040px;
  width: 100%;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.05);
  border-radius: 1.25rem;
  padding: 1.15rem 1.4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

@media (max-width: 860px) {
  .cookie-banner-card {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
    gap: 1rem;
  }
}

.cookie-banner-content {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  flex: 1;
}

.cookie-icon-wrapper {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 0.75rem;
  padding: 0.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cookie-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0 0 0.25rem 0;
}

.cookie-badge-lgpd {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cookie-description {
  font-size: 0.81rem;
  color: #475569;
  line-height: 1.45;
  margin: 0;
}

/* BOTÕES EM PÍLULA (DESIGN SYSTEM FARMÁCIA) */
.cookie-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .cookie-actions {
    justify-content: flex-end;
  }
}

.btn-cookie-preferences {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  padding: 0.45rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-cookie-preferences:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.btn-cookie-essential {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  padding: 0.45rem 1.05rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-cookie-essential:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.btn-cookie-accept {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #2563eb;
  color: #ffffff;
  border: 1px solid transparent;
  border-radius: 9999px;
  padding: 0.45rem 1.25rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
  transition: all 150ms ease;
}

.btn-cookie-accept:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
}

/* MODAL DE PREFERÊNCIAS */
.cookie-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.cookie-modal-dialog {
  background: #ffffff;
  border-radius: 1.25rem;
  max-width: 580px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.cookie-modal-header {
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-icon-circle {
  background: #eff6ff;
  border-radius: 50%;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-modal-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.5rem;
  transition: all 150ms ease;
}

.btn-modal-close:hover {
  background: #f1f5f9;
  color: #334155;
}

.cookie-modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.cookie-options-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.cookie-option-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.85rem;
  padding: 0.9rem 1.1rem;
}

.cookie-option-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}

.badge-always-active {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.cookie-option-desc {
  font-size: 0.77rem;
  color: #64748b;
  line-height: 1.45;
  margin: 0;
}

/* SWITCH SLIDER */
.switch-toggle,
.switch-locked {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
  cursor: pointer;
}

.switch-locked {
  cursor: not-allowed;
  opacity: 0.8;
}

.switch-slider {
  position: absolute;
  inset: 0;
  background-color: #cbd5e1;
  border-radius: 9999px;
  transition: all 200ms ease;
}

.switch-slider::before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: all 200ms ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.switch-active {
  background-color: #2563eb;
}

.switch-active::before {
  transform: translateX(18px);
}

.cookie-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn-footer-reject {
  background: transparent;
  color: #64748b;
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  padding: 0.45rem 1.1rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-footer-reject:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.btn-footer-save {
  background: #2563eb;
  color: #ffffff;
  border: 1px solid transparent;
  border-radius: 9999px;
  padding: 0.45rem 1.3rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  transition: all 150ms ease;
}

.btn-footer-save:hover {
  background: #1d4ed8;
}

/* ANIMAÇÕES */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 300ms ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 200ms ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
