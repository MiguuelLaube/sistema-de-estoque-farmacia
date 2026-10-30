import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import './style.css';
import App from './App.vue';

const app = createApp(App);
const pinia = createPinia();

/**
 * Faixa de erro em DOM puro (funciona mesmo se a árvore do Vue quebrar). Sem stack trace nem dados
 * sensíveis na tela. Exibida no máximo uma vez a cada 10 s para não "piscar" em erros repetidos.
 */
let ultimaFaixaMs = 0;
function mostrarFaixaDeErro(): void {
  const agora = Date.now();
  if (typeof document === 'undefined' || agora - ultimaFaixaMs < 10_000) return;
  ultimaFaixaMs = agora;

  const faixa = document.createElement('div');
  faixa.setAttribute('role', 'alert');
  faixa.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;max-width:92vw;' +
    'display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:9999px;' +
    'background:#fef2f2;border:1.5px solid #fecaca;color:#991b1b;font:600 13px system-ui,sans-serif;' +
    'box-shadow:0 8px 24px rgba(15,23,42,.15)';

  const texto = document.createElement('span');
  texto.textContent = 'Ocorreu um erro inesperado nesta tela.';

  const recarregar = document.createElement('button');
  recarregar.textContent = 'Recarregar';
  recarregar.style.cssText =
    'border:none;border-radius:9999px;padding:5px 12px;background:#dc2626;color:#fff;font:700 12px system-ui;cursor:pointer';
  recarregar.onclick = () => window.location.reload();

  const fechar = document.createElement('button');
  fechar.textContent = '✕';
  fechar.setAttribute('aria-label', 'Fechar aviso');
  fechar.style.cssText = 'border:none;background:transparent;color:#991b1b;font-size:14px;cursor:pointer';
  fechar.onclick = () => faixa.remove();

  faixa.append(texto, recarregar, fechar);
  document.body.appendChild(faixa);
  window.setTimeout(() => faixa.remove(), 15_000);
}

// Erros de renderização/eventos/watchers dentro de componentes Vue
app.config.errorHandler = (err, _instance, info) => {
  console.error('[EncoMed] Erro de interface em', info, '-', err instanceof Error ? err.message : 'desconhecido');
  mostrarFaixaDeErro();
};

// Promises rejeitadas sem catch (ex.: falha de rede em store) e erros globais de script
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[EncoMed] Promise rejeitada sem tratamento:', ev.reason instanceof Error ? ev.reason.message : 'desconhecido');
  mostrarFaixaDeErro();
});

// Falha ao carregar chunk/rota (ex.: deploy novo enquanto o usuário estava com a aba aberta)
router.onError((err) => {
  console.error('[EncoMed] Erro de navegação:', err instanceof Error ? err.message : 'desconhecido');
  mostrarFaixaDeErro();
});

app.use(pinia);
app.use(router);

app.mount('#app');
