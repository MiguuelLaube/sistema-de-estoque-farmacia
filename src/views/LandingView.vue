<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  PackageOpen,
  ClipboardList,
  Send,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle,
  CheckCircle2,
  ArrowRight,
  LogIn,
  Zap,
  Building2,
  Lock,
  Clock,
  Package,
  Sparkles,
  Palette,
  Printer,
  Bot,
  MousePointerClick,
  Check,
  Play,
  RotateCcw,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const estaLogado = computed(() => authStore.isAuthenticated);

function acessarPlataforma() {
  if (estaLogado.value) {
    router.push(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
  } else {
    router.push('/login');
  }
}

function rolarParaSecao(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

// ============================================================================
// SIMULADOR INTERATIVO ("CAIXINHA" DE MÓDULOS E STATUS CLICÁVEIS DO ENCOMED)
// ============================================================================
type StatusDemo = 'Aguardando' | 'Pedido Feito' | 'Chegou' | 'Entregue';
type AbaSimulador = 'status' | 'xml_ia' | 'relatorios_marca';

interface ItemSimulador {
  id: string;
  paciente: string;
  telefone: string;
  medicamento: string;
  categoria: string;
  valor: string;
  saldo: string;
  status: StatusDemo;
  urgente: boolean;
  pago: boolean;
  animando: boolean;
}

const abaSimulador = ref<AbaSimulador>('status');
const filtroModuloBox = ref<'Todos' | StatusDemo>('Todos');

const itensDemo = ref<ItemSimulador[]>([
  {
    id: 'sim-1',
    paciente: 'Maria Aparecida Silva',
    telefone: '(11) 98765-4321',
    medicamento: 'OZEMPIC 1MG CANETA INJETÁVEL',
    categoria: 'TERMOLÁBIL / ÉTICO',
    valor: 'R$ 985,00',
    saldo: 'R$ 85,00',
    status: 'Aguardando',
    urgente: true,
    pago: false,
    animando: false,
  },
  {
    id: 'sim-2',
    paciente: 'Carlos Eduardo Mendes',
    telefone: '(11) 99123-8844',
    medicamento: 'LOSARTANA POTÁSSICA 50MG 30 COMP',
    categoria: 'GENÉRICO / CONTÍNUO',
    valor: 'R$ 24,90',
    saldo: 'R$ 0,00',
    status: 'Pedido Feito',
    urgente: false,
    pago: true,
    animando: false,
  },
  {
    id: 'sim-3',
    paciente: 'Fernanda Costa Oliveira',
    telefone: '(11) 97411-2090',
    medicamento: 'VENVANSE 30MG C/ 28 CÁPSULAS',
    categoria: 'CONTROLADO PORT. 344',
    valor: 'R$ 468,00',
    saldo: 'R$ 168,00',
    status: 'Chegou',
    urgente: false,
    pago: false,
    animando: false,
  },
]);

interface EventoReacao {
  titulo: string;
  subtitulo: string;
  corTema: 'amber' | 'blue' | 'emerald' | 'slate' | 'red';
  mensagemWhatsapp?: string;
  detalheExtra: string;
  horario: string;
}

const ultimaReacao = ref<EventoReacao>({
  titulo: 'Clique em qualquer botão de status ao lado!',
  subtitulo: 'Experimente mudar de "Aguardando" para "Pedido Feito", "Chegou" ou "Entregue"',
  corTema: 'emerald',
  mensagemWhatsapp:
    'Olá Fernanda! Seu pedido de VENVANSE 30MG já está disponível para retirada na Farmácia via EncoMed. Saldo a acertar: R$ 168,00.',
  detalheExtra: 'A API do WhatsApp adapta a mensagem automaticamente ao modelo configurado da loja.',
  horario: 'Agora mesmo',
});

const chaveAnimacaoReacao = ref(1);

const contagemModulosDemo = computed(() => {
  const todos = itensDemo.value;
  return {
    Todos: todos.length,
    Aguardando: todos.filter((i) => i.status === 'Aguardando').length,
    'Pedido Feito': todos.filter((i) => i.status === 'Pedido Feito').length,
    Chegou: todos.filter((i) => i.status === 'Chegou').length,
    Entregue: todos.filter((i) => i.status === 'Entregue').length,
  };
});

const itensFiltradosSimulador = computed(() => {
  const base =
    filtroModuloBox.value === 'Todos'
      ? itensDemo.value
      : itensDemo.value.filter((i) => i.status === filtroModuloBox.value);
  return [...base].sort((a, b) => Number(b.urgente) - Number(a.urgente));
});

function clicarStatusDemo(item: ItemSimulador, novoStatus: StatusDemo) {
  item.status = novoStatus;
  if (novoStatus === 'Entregue') {
    item.pago = true;
    item.saldo = 'R$ 0,00';
  }
  item.animando = true;
  setTimeout(() => {
    item.animando = false;
  }, 650);

  const primeiroNome = item.paciente.split(' ')[0];
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  chaveAnimacaoReacao.value++;

  if (novoStatus === 'Aguardando') {
    ultimaReacao.value = {
      titulo: `Módulo "Aguardando" ativado`,
      subtitulo: `${item.medicamento} entrou automaticamente na Lista Consolidada de Compras`,
      corTema: 'amber',
      mensagemWhatsapp: `Olá ${primeiroNome}! Confirmamos seu pedido de ${item.medicamento} no sistema EncoMed. Avisaremos assim que chegar!`,
      detalheExtra: 'Agrupado por categoria farmacêutica sem precisar anotar em caderno.',
      horario: hora,
    };
  } else if (novoStatus === 'Pedido Feito') {
    ultimaReacao.value = {
      titulo: `Módulo "Pedido Feito" sincronizado`,
      subtitulo: `Compra enviada à distribuidora • Aguardando XML da NF-e`,
      corTema: 'blue',
      detalheExtra: `A IA do EncoMed monitora a chegada de "${item.medicamento}" assim que o XML da nota fiscal for importado.`,
      horario: hora,
    };
  } else if (novoStatus === 'Chegou') {
    ultimaReacao.value = {
      titulo: `Módulo "Chegou" • Disparo Automático WhatsApp API!`,
      subtitulo: `Notificação enviada em tempo real para ${item.paciente}`,
      corTema: 'emerald',
      mensagemWhatsapp: `Olá ${primeiroNome}! Seu pedido de ${item.medicamento} já chegou e está disponível para retirada.${
        !item.pago ? ` Saldo na retirada: ${item.saldo}.` : ' Pedido 100% pago!'
      }`,
      detalheExtra: 'Status sincronizado entre Estoque, Balcão e Evolution API com proteção LGPD.',
      horario: hora,
    };
  } else {
    ultimaReacao.value = {
      titulo: `Módulo "Entregue" • Baixa & Cupom Térmico 80mm`,
      subtitulo: `Retirada concluída e registrada na Trilha Imutável de Auditoria`,
      corTema: 'slate',
      mensagemWhatsapp: `Olá ${primeiroNome}! Registramos a retirada do seu pedido na farmácia. Obrigado pela preferência e ótima saúde!`,
      detalheExtra: 'Recibo 80mm gerado e histórico clínico vinculado ao cadastro do paciente.',
      horario: hora,
    };
  }
}

function alternarUrgenciaDemo(item: ItemSimulador) {
  item.urgente = !item.urgente;
  item.animando = true;
  setTimeout(() => {
    item.animando = false;
  }, 550);
  chaveAnimacaoReacao.value++;
  ultimaReacao.value = {
    titulo: item.urgente ? 'Prioridade URGENTE ativada!' : 'Prioridade urgente removida',
    subtitulo: item.medicamento,
    corTema: item.urgente ? 'red' : 'slate',
    detalheExtra: item.urgente
      ? 'O item sobe imediatamente para o topo da tela do comprador com destaque vermelho semântico.'
      : 'O item retorna à ordenação padrão da categoria.',
    horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function alternarPagamentoDemo(item: ItemSimulador) {
  item.pago = !item.pago;
  chaveAnimacaoReacao.value++;
  ultimaReacao.value = {
    titulo: item.pago ? 'Pagamento quitado no balcão' : 'Marcado com saldo a receber',
    subtitulo: `${item.paciente} • ${item.valor}`,
    corTema: item.pago ? 'emerald' : 'amber',
    detalheExtra: item.pago
      ? 'Conciliação financeira atualizada instantaneamente para os relatórios PDF e Excel.'
      : `Saldo pendente (${item.saldo}) incluído automaticamente no Relatório de Valores a Receber.`,
    horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ============================================================================
// SUB-SIMULADOR 2: IA NO XML DA NF-E COM CONFIRMAÇÃO
// ============================================================================
const xmlSimEtapa = ref<'pronto' | 'escaneando' | 'selecionado' | 'confirmado'>('selecionado');
const xmlSimItens = ref([
  {
    id: 'x1',
    xmlNome: 'SEMAGLUTIDA (OZEMPIC) 1MG SOL INJ C/1 CAN',
    pedidoNome: 'OZEMPIC 1MG CANETA INJETÁVEL',
    confianca: 98,
    selecionado: true,
    status: 'Pedido Feito',
  },
  {
    id: 'x2',
    xmlNome: 'LOSART POT 50MG C/30 COMP MEDLEY',
    pedidoNome: 'LOSARTANA POTÁSSICA 50MG 30 COMP',
    confianca: 95,
    selecionado: true,
    status: 'Pedido Feito',
  },
  {
    id: 'x3',
    xmlNome: 'DIPIR MONO 500MG C/10 ENV',
    pedidoNome: 'Sem encomenda pendente no balcão',
    confianca: 0,
    selecionado: false,
    status: 'Ignorado',
  },
]);

function rodarDemonstracaoXmlIa() {
  xmlSimEtapa.value = 'escaneando';
  xmlSimItens.value[0].status = 'Pedido Feito';
  xmlSimItens.value[1].status = 'Pedido Feito';
  xmlSimItens.value[0].selecionado = false;
  xmlSimItens.value[1].selecionado = false;

  setTimeout(() => {
    xmlSimItens.value[0].selecionado = true;
    xmlSimItens.value[1].selecionado = true;
    xmlSimEtapa.value = 'selecionado';
  }, 1100);
}

function confirmarChegadaXmlDemo() {
  xmlSimItens.value.forEach((it) => {
    if (it.selecionado) it.status = 'Chegou';
  });
  xmlSimEtapa.value = 'confirmado';
}

// ============================================================================
// SUB-SIMULADOR 3: WHITE-LABEL & EXPORTAÇÃO PDF / EXCEL
// ============================================================================
const corDemoMarca = ref('#2563eb');
const feedbackDownloadDemo = ref<string | null>(null);

function simularCliqueExportacao(formato: 'PDF' | 'Excel (.xlsx)') {
  feedbackDownloadDemo.value = `Relatório ${formato} gerado com cabeçalho da farmácia e trilha LGPD!`;
  setTimeout(() => {
    feedbackDownloadDemo.value = null;
  }, 3500);
}

// ============================================================================
// SCROLL REVEAL OBSERVER
// ============================================================================
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer?.observe(el));
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <div class="landing-root">
    <!-- NAVBAR FIXA COM LOGO E NOME DO SAAS ENCOMED -->
    <header class="landing-header" role="banner">
      <div class="landing-shell header-inner">
        <a
          href="#topo"
          class="brand-link"
          aria-label="EncoMed - Início"
          @click.prevent="rolarParaSecao('topo')"
        >
          <img
            src="/encomed-icon.svg"
            alt="Logo EncoMed SaaS"
            class="brand-logo-img"
          />
          <div class="brand-text-col">
            <span class="brand-title-main">EncoMed</span>
            <span class="brand-subtitle-meta">SaaS de Encomendas &amp; Gestão Farmacêutica</span>
          </div>
        </a>

        <nav class="header-nav" role="navigation" aria-label="Navegação da apresentação">
          <button @click="rolarParaSecao('simulador-interativo')" class="nav-text-btn">
            Simulador Ao Vivo
          </button>
          <button @click="rolarParaSecao('funcionalidades-saas')" class="nav-text-btn">
            Funcionalidades
          </button>
          <button @click="rolarParaSecao('fluxo-operacao')" class="nav-text-btn">
            Fluxo 360°
          </button>
          <button @click="rolarParaSecao('arquitetura-seguranca')" class="nav-text-btn">
            Segurança &amp; LGPD
          </button>
        </nav>

        <div class="header-action">
          <button
            @click="acessarPlataforma"
            class="btn-primary-pill touch-target"
            id="btn-nav-acessar"
          >
            <LogIn :size="16" aria-hidden="true" />
            <span>{{ estaLogado ? 'Entrar no Painel' : 'Acessar EncoMed' }}</span>
          </button>
        </div>
      </div>
    </header>

    <main id="topo" class="landing-main">
      <!-- ================================================================ -->
      <!-- 1. HERO SECTION COM IDENTIDADE ENCOMED & MICRO-ANIMAÇÕES         -->
      <!-- ================================================================ -->
      <section class="hero-section" aria-labelledby="hero-title">
        <div class="ambient-glow ambient-glow-left" aria-hidden="true"></div>
        <div class="ambient-glow ambient-glow-right" aria-hidden="true"></div>

        <div class="landing-shell">
          <div class="hero-lead-block">
            <div class="hero-brand-pill animate-float-slow">
              <img src="/encomed-icon.svg" alt="" style="height: 20px; width: 20px; object-fit: contain;" />
              <span>PLATAFORMA SAAS OFICIAL • <strong>ENCOMED</strong></span>
            </div>

            <h1 id="hero-title" class="hero-headline">
              Transforme faltas de balcão em
              <span class="hero-gradient-text">vendas fidelizadas</span>
              com IA e WhatsApp automático
            </h1>

            <p class="hero-paragraph">
              O <strong>EncoMed</strong> aposenta de vez o caderninho de encomendas da drogaria. Controle status em tempo real, use <strong>Inteligência Artificial</strong> para identificar medicamentos no XML da distribuidora, avise pacientes pela <strong>API do WhatsApp</strong> e gere relatórios executivos em <strong>PDF e Excel</strong>.
            </p>

            <div class="hero-cta-cluster">
              <button
                @click="acessarPlataforma"
                class="btn-primary-pill touch-target hero-btn-lg"
                id="btn-hero-acessar"
              >
                <span>{{ estaLogado ? 'Abrir Meu Painel EncoMed' : 'Começar Agora no EncoMed' }}</span>
                <ArrowRight :size="18" aria-hidden="true" />
              </button>

              <button
                @click="rolarParaSecao('simulador-interativo')"
                class="btn-outline-emerald touch-target hero-btn-lg"
              >
                <MousePointerClick :size="18" aria-hidden="true" />
                <span>Testar Caixinha Interativa</span>
              </button>
            </div>

            <!-- Indicadores Rápidos -->
            <div class="hero-highlights-strip">
              <div class="highlight-chip">
                <Sparkles :size="15" style="color: #2563eb;" />
                <span>IA no XML da NF-e com Confirmação</span>
              </div>
              <div class="highlight-chip">
                <Bot :size="15" style="color: #059669;" />
                <span>API WhatsApp com Modelos Dinâmicos</span>
              </div>
              <div class="highlight-chip">
                <FileSpreadsheet :size="15" style="color: #d97706;" />
                <span>Exportação Nativa PDF &amp; Excel (.xlsx)</span>
              </div>
              <div class="highlight-chip">
                <Palette :size="15" style="color: #7c3aed;" />
                <span>Identidade Visual White-Label</span>
              </div>
            </div>
          </div>

          <!-- ============================================================== -->
          <!-- 2. "CAIXINHA" INTERATIVA AO VIVO DO SAAS ENCOMED               -->
          <!-- ============================================================== -->
          <div id="simulador-interativo" class="interactive-showcase-wrapper">
            <div class="interactive-window-card">
              <!-- Barra Superior Estilo App Window -->
              <div class="window-topbar">
                <div class="window-dots" aria-hidden="true">
                  <span class="w-dot dot-red"></span>
                  <span class="w-dot dot-amber"></span>
                  <span class="w-dot dot-green"></span>
                </div>

                <div class="window-brand-center">
                  <img src="/encomed-icon.svg" alt="EncoMed" style="height: 20px; width: 20px; object-fit: contain;" />
                  <span><strong>EncoMed SaaS</strong> — Ambiente Interativo de Demonstração</span>
                </div>

                <div class="window-live-pill">
                  <span class="pulse-dot"></span>
                  <span>Clique nos botões abaixo!</span>
                </div>
              </div>

              <!-- Seletor de Módulos da Caixinha -->
              <div class="simulator-mode-bar">
                <button
                  type="button"
                  @click="abaSimulador = 'status'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'status' }"
                >
                  <MousePointerClick :size="15" />
                  <span>1. Módulos de Status &amp; WhatsApp</span>
                </button>

                <button
                  type="button"
                  @click="abaSimulador = 'xml_ia'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'xml_ia' }"
                >
                  <Sparkles :size="15" />
                  <span>2. Importar XML com IA</span>
                </button>

                <button
                  type="button"
                  @click="abaSimulador = 'relatorios_marca'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'relatorios_marca' }"
                >
                  <FileText :size="15" />
                  <span>3. Relatórios PDF/Excel &amp; Marca</span>
                </button>
              </div>

              <!-- MODO 1: STATUS INTERATIVOS ("AGUARDANDO", "PEDIDO FEITO", "CHEGOU", "ENTREGUE") -->
              <div v-if="abaSimulador === 'status'" class="simulator-body-grid">
                <!-- Coluna Esquerda: Lista Interativa com Filtro por Módulo -->
                <div class="sim-orders-column">
                  <div class="sim-filter-pills" role="tablist" aria-label="Filtrar por módulo de status">
                    <button
                      v-for="mod in (['Todos', 'Aguardando', 'Pedido Feito', 'Chegou', 'Entregue'] as const)"
                      :key="mod"
                      type="button"
                      @click="filtroModuloBox = mod"
                      class="sim-module-tab"
                      :class="[
                        { active: filtroModuloBox === mod },
                        mod === 'Aguardando' ? 'tab-amber' : '',
                        mod === 'Pedido Feito' ? 'tab-blue' : '',
                        mod === 'Chegou' ? 'tab-emerald' : '',
                        mod === 'Entregue' ? 'tab-slate' : '',
                      ]"
                    >
                      <span>{{ mod }}</span>
                      <span class="sim-count-bubble">{{ contagemModulosDemo[mod] }}</span>
                    </button>
                  </div>

                  <TransitionGroup name="sim-list" tag="div" class="sim-cards-stack">
                    <div
                      v-for="item in itensFiltradosSimulador"
                      :key="item.id"
                      class="sim-order-card"
                      :class="[
                        `border-state-${item.status.toLowerCase().replace(' ', '-')}`,
                        { 'card-pop-anim': item.animando },
                      ]"
                    >
                      <div class="sim-card-top">
                        <div>
                          <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                            <span class="sim-cat-tag">{{ item.categoria }}</span>
                            <span class="sim-patient">{{ item.paciente }}</span>
                          </div>
                          <h4 class="sim-med-title" :class="{ 'urgent-red': item.urgente }">
                            {{ item.medicamento }}
                          </h4>
                        </div>

                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                          <button
                            type="button"
                            @click="alternarPagamentoDemo(item)"
                            class="sim-paid-pill"
                            :class="item.pago ? 'is-paid' : 'is-unpaid'"
                            title="Clique para alternar Pago / Pendente"
                          >
                            {{ item.pago ? '✓ Pago' : `Falta ${item.saldo}` }}
                          </button>

                          <button
                            type="button"
                            @click="alternarUrgenciaDemo(item)"
                            class="btn-icon-urgent"
                            :class="{ 'active-urgent': item.urgente }"
                            title="Clique para marcar/desmarcar Urgente"
                          >
                            <Zap :size="14" />
                          </button>
                        </div>
                      </div>

                      <!-- Botões Clicáveis que Mudam de Cor Semântica -->
                      <div class="sim-status-buttons-row" role="group" aria-label="Alterar status da encomenda">
                        <button
                          type="button"
                          @click="clicarStatusDemo(item, 'Aguardando')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-aguardo': item.status === 'Aguardando' }"
                        >
                          <Clock :size="13" />
                          <span>Aguardando</span>
                        </button>

                        <button
                          type="button"
                          @click="clicarStatusDemo(item, 'Pedido Feito')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-feito': item.status === 'Pedido Feito' }"
                        >
                          <CheckCircle :size="13" />
                          <span>Pedido Feito</span>
                        </button>

                        <button
                          type="button"
                          @click="clicarStatusDemo(item, 'Chegou')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-chegou': item.status === 'Chegou' }"
                        >
                          <Package :size="13" />
                          <span>Chegou</span>
                        </button>

                        <button
                          type="button"
                          @click="clicarStatusDemo(item, 'Entregue')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-entregue-sim': item.status === 'Entregue' }"
                        >
                          <CheckCircle2 :size="13" />
                          <span>Entregue</span>
                        </button>
                      </div>
                    </div>
                  </TransitionGroup>
                </div>

                <!-- Coluna Direita: Reação Automática do EncoMed em Tempo Real -->
                <div class="sim-reaction-column">
                  <div :key="chaveAnimacaoReacao" class="reaction-live-card" :class="`theme-${ultimaReacao.corTema}`">
                    <div class="reaction-header">
                      <span class="reaction-kicker">REAÇÃO EM TEMPO REAL DO ENCOMED</span>
                      <span class="reaction-time">{{ ultimaReacao.horario }}</span>
                    </div>

                    <h3 class="reaction-title">{{ ultimaReacao.titulo }}</h3>
                    <p class="reaction-sub">{{ ultimaReacao.subtitulo }}</p>

                    <!-- Balão Oficial do WhatsApp quando aplicável -->
                    <div v-if="ultimaReacao.mensagemWhatsapp" class="whatsapp-sim-phone">
                      <div class="wa-sim-top">
                        <img src="/encomed-icon.svg" alt="" style="width: 20px; height: 20px; object-fit: contain;" />
                        <span>WhatsApp API Oficial • Modelo Dinâmico</span>
                      </div>
                      <div class="wa-sim-bubble">
                        {{ ultimaReacao.mensagemWhatsapp }}
                        <span class="wa-sim-ticks">✓✓ Enviado pela API</span>
                      </div>
                    </div>

                    <div class="reaction-footer-note">
                      <ShieldCheck :size="16" style="flex-shrink: 0;" />
                      <span>{{ ultimaReacao.detalheExtra }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- MODO 2: SIMULADOR DE IMPORTAÇÃO DE XML COM IA + CONFIRMAÇÃO -->
              <div v-else-if="abaSimulador === 'xml_ia'" class="sim-xml-panel">
                <div class="sim-xml-header">
                  <div>
                    <span class="category-header-pill" style="margin-bottom: 6px;">
                      <Sparkles :size="12" />
                      <span>ENCOPHARMA AI • LEITOR DE NF-E</span>
                    </span>
                    <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 4px 0;">
                      A IA identifica o que chegou na Nota Fiscal e seleciona sozinha — você só confirma!
                    </h3>
                    <p style="font-size: 0.85rem; color: #64748b; margin: 0;">
                      Mesmo quando a distribuidora envia nomes abreviados como <code>LOSART POT 50MG</code>, a IA reconhece o pedido, valida a concentração e pede sua confirmação antes de mudar para <strong>"Chegou"</strong>.
                    </p>
                  </div>

                  <button type="button" @click="rodarDemonstracaoXmlIa" class="btn-outline-neutral">
                    <Play v-if="xmlSimEtapa !== 'confirmado'" :size="15" />
                    <RotateCcw v-else :size="15" />
                    <span>{{ xmlSimEtapa === 'confirmado' ? 'Repetir Simulação IA' : 'Simular Leitura de XML' }}</span>
                  </button>
                </div>

                <div v-if="xmlSimEtapa === 'escaneando'" class="xml-scanning-box">
                  <div class="scanning-bar"></div>
                  <strong>🤖 IA analisando XML SEFAZ #0048921...</strong>
                  <span>Expandindo abreviações farmacêuticas e validando dosagens (mg/mcg)</span>
                </div>

                <div v-else class="sim-xml-list">
                  <div
                    v-for="row in xmlSimItens"
                    :key="row.id"
                    class="sim-xml-row"
                    :class="{ 'row-selected': row.selecionado }"
                  >
                    <input
                      type="checkbox"
                      v-model="row.selecionado"
                      :disabled="row.confianca === 0 || xmlSimEtapa === 'confirmado'"
                      style="width: 18px; height: 18px; accent-color: #059669;"
                    />
                    <div style="flex: 1; min-width: 180px;">
                      <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">DESCRIÇÃO NO XML DA DISTRIBUIDORA</div>
                      <div style="font-weight: 700; font-size: 0.86rem; color: #0f172a;">{{ row.xmlNome }}</div>
                    </div>
                    <div style="flex: 1; min-width: 180px;">
                      <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">ENCOMENDA VINCULADA</div>
                      <div style="font-weight: 700; font-size: 0.86rem; color: #1e293b;">{{ row.pedidoNome }}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <span v-if="row.confianca > 0" class="badge badge-pedido-feito">
                        ✨ IA {{ row.confianca }}%
                      </span>
                      <span
                        class="pedido-status-pill"
                        :class="row.status === 'Chegou' ? 'active-chegou' : row.status === 'Pedido Feito' ? 'active-feito' : ''"
                      >
                        {{ row.status }}
                      </span>
                    </div>
                  </div>

                  <div class="sim-xml-confirm-bar">
                    <div v-if="xmlSimEtapa !== 'confirmado'" style="font-size: 0.84rem; color: #1e3a8a;">
                      🛡️ <strong>Confirmação Obrigatória:</strong> 2 medicamentos pré-selecionados pela IA aguardam sua autorização para virar <em>"Chegou"</em>.
                    </div>
                    <div v-else style="font-size: 0.86rem; color: #065f46; font-weight: 700;">
                      ✅ Confirmado! Os itens mudaram para "Chegou" e os avisos do WhatsApp foram disparados!
                    </div>

                    <button
                      v-if="xmlSimEtapa !== 'confirmado'"
                      type="button"
                      @click="confirmarChegadaXmlDemo"
                      class="btn-primary-pill"
                      style="background: #059669;"
                    >
                      <Check :size="16" />
                      <span>Confirmar Mudança para "Chegou"</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- MODO 3: WHITE-LABEL & EXPORTAÇÃO PDF / EXCEL -->
              <div v-else class="sim-whitelabel-panel">
                <div class="sim-wl-grid">
                  <div class="sim-wl-card">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.6rem;">
                      <Palette :size="18" :style="{ color: corDemoMarca }" />
                      <h4 style="margin: 0; font-size: 1rem; font-weight: 800;">Identidade Visual Completa</h4>
                    </div>
                    <p style="font-size: 0.84rem; color: #64748b; margin-bottom: 1rem;">
                      Personalize logo, cores primária/secundária, menu claro ou escuro, arredondamento, densidade e fontes. Clique numa cor para testar:
                    </p>
                    <div style="display: flex; gap: 0.6rem; margin-bottom: 1rem; flex-wrap: wrap;">
                      <button
                        v-for="cor in ['#2563eb', '#059669', '#0284c7', '#dc2626', '#7c3aed']"
                        :key="cor"
                        type="button"
                        @click="corDemoMarca = cor"
                        :style="{
                          background: cor,
                          transform: corDemoMarca === cor ? 'scale(1.16)' : 'scale(1)',
                          boxShadow: corDemoMarca === cor ? `0 0 0 3px ${cor}40` : 'none',
                        }"
                        style="width: 34px; height: 34px; border-radius: 9999px; border: 2px solid #fff; cursor: pointer; transition: all 0.15s ease;"
                        :aria-label="`Testar cor ${cor}`"
                      ></button>
                    </div>
                    <div
                      style="padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid #e2e8f0; background: #ffffff; display: flex; justify-content: space-between; align-items: center;"
                    >
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="/encomed-icon.svg" alt="EncoMed" style="height: 24px; width: 24px; object-fit: contain;" />
                        <strong style="font-size: 0.88rem;">Sua Farmácia no EncoMed</strong>
                      </div>
                      <span
                        :style="{ background: corDemoMarca }"
                        style="color: #fff; padding: 5px 12px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; transition: background 0.2s ease;"
                      >
                        + Nova Encomenda
                      </span>
                    </div>
                  </div>

                  <div class="sim-wl-card">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.6rem;">
                      <FileSpreadsheet :size="18" style="color: #059669;" />
                      <h4 style="margin: 0; font-size: 1rem; font-weight: 800;">Relatórios em PDF &amp; Excel (.xlsx)</h4>
                    </div>
                    <p style="font-size: 0.84rem; color: #64748b; margin-bottom: 1rem;">
                      Exporte a carteira de saldos a receber, curva ABC dos medicamentos mais procurados e trilha de auditoria LGPD em 1 clique:
                    </p>
                    <div style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
                      <button type="button" @click="simularCliqueExportacao('PDF')" class="btn-primary-pill">
                        <FileText :size="15" />
                        <span>Gerar Relatório PDF</span>
                      </button>
                      <button type="button" @click="simularCliqueExportacao('Excel (.xlsx)')" class="btn-outline-emerald">
                        <FileSpreadsheet :size="15" />
                        <span>Exportar Excel (.xlsx)</span>
                      </button>
                    </div>
                    <div
                      v-if="feedbackDownloadDemo"
                      style="margin-top: 0.85rem; padding: 0.6rem 0.85rem; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.8rem; font-weight: 600;"
                    >
                      ✅ {{ feedbackDownloadDemo }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ================================================================ -->
      <!-- 3. TODAS AS FUNCIONALIDADES DO SAAS ENCOMED (6 MÓDULOS COMPLETOS) -->
      <!-- ================================================================ -->
      <section id="funcionalidades-saas" class="features-section reveal-on-scroll" aria-labelledby="features-title">
        <div class="landing-shell">
          <div class="section-heading-center">
            <span class="section-tag-kicker">ECOSSISTEMA COMPLETO ENCOMED</span>
            <h2 id="features-title" class="section-title-clean">
              Tudo o que sua drogaria precisa do balcão ao financeiro
            </h2>
            <p class="section-desc-clean">
              Cada módulo do EncoMed foi desenhado especificamente para a velocidade do balcão farmacêutico, sem telas confusas ou cadastros burocráticos.
            </p>
          </div>

          <div class="features-six-grid">
            <!-- Módulo 1 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #eff6ff; color: #2563eb;">
                <PackageOpen :size="22" />
              </div>
              <h3 class="mod-title">Encomendas &amp; Sinal Financeiro</h3>
              <p class="mod-desc">
                Cadastre pedidos com múltiplos itens, controle sinais pagos (PIX, cartão, dinheiro), saldo restante na retirada e histórico de remédios já comprados pelo paciente.
              </p>
              <div class="mod-pill-tags">
                <span>4 Status Semânticos</span>
                <span>Controle de Sinal</span>
              </div>
            </article>

            <!-- Módulo 2 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #ecfdf5; color: #059669;">
                <Send :size="22" />
              </div>
              <h3 class="mod-title">Robô WhatsApp API por Modelos</h3>
              <p class="mod-desc">
                Pareamento via QR Code seguro no servidor. A API adapta-se automaticamente aos seus modelos de <strong>Chegada</strong>, <strong>Confirmação de Pedido</strong>, <strong>Cobrança</strong> e <strong>Entrega</strong>.
              </p>
              <div class="mod-pill-tags">
                <span>Evolution API Proxy</span>
                <span>Sigilo LGPD Art. 11</span>
              </div>
            </article>

            <!-- Módulo 3 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #f5f3ff; color: #7c3aed;">
                <Sparkles :size="22" />
              </div>
              <h3 class="mod-title">Importação XML NF-e com IA</h3>
              <p class="mod-desc">
                A IA lê o XML da nota fiscal da distribuidora, decifra nomes abreviados, cruza concentrações (mg/mcg), pré-seleciona o que chegou e pede sua confirmação antes da baixa.
              </p>
              <div class="mod-pill-tags">
                <span>Auto-Seleção IA</span>
                <span>Trava de Dosagem</span>
              </div>
            </article>

            <!-- Módulo 4 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #fffbeb; color: #d97706;">
                <FileSpreadsheet :size="22" />
              </div>
              <h3 class="mod-title">Relatórios em PDF &amp; Excel (.xlsx)</h3>
              <p class="mod-desc">
                Gere documentos PDF prontos para diretoria e planilhas nativas Microsoft Excel com carteira de valores a receber por cliente, curva de demanda e auditoria.
              </p>
              <div class="mod-pill-tags">
                <span>PDF Executivo</span>
                <span>Planilha .XLSX</span>
              </div>
            </article>

            <!-- Módulo 5 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #ecfeff; color: #0284c7;">
                <Palette :size="22" />
              </div>
              <h3 class="mod-title">Estúdio White-Label Completo</h3>
              <p class="mod-desc">
                Deixe o sistema com a cara da sua rede: envie seu logotipo, escolha paletas prontas ou cores próprias, tema escuro/claro do menu, tipografia e cupom térmico 80mm.
              </p>
              <div class="mod-pill-tags">
                <span>Preview em Tempo Real</span>
                <span>Bobina 80mm</span>
              </div>
            </article>

            <!-- Módulo 6 -->
            <article class="feature-mod-card">
              <div class="mod-icon-wrap" style="background: #fef2f2; color: #dc2626;">
                <Printer :size="22" />
              </div>
              <h3 class="mod-title">Compras Agrupadas &amp; Urgências</h3>
              <p class="mod-desc">
                Consolidação automática por Fórmulas, Éticos, Genéricos e Perfumaria. Destaque itens urgentes com 1 clique para o comprador priorizar na cotação diária.
              </p>
              <div class="mod-pill-tags">
                <span>Filtro Inteligente</span>
                <span>Alerta de Urgência</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- ================================================================ -->
      <!-- 4. FLUXO OPERACIONAL 360° (ETAPAS 01 A 04)                       -->
      <!-- ================================================================ -->
      <section id="fluxo-operacao" class="workflow-section reveal-on-scroll" aria-labelledby="workflow-title">
        <div class="landing-shell">
          <div class="section-heading-center">
            <span class="section-tag-kicker">ROTEIRO OPERACIONAL ENCOMED</span>
            <h2 id="workflow-title" class="section-title-clean">
              Do pedido no balcão à retirada fidelizada em 4 passos
            </h2>
            <p class="section-desc-clean">
              Fluxo contínuo pensado para zerar esquecimentos entre balconistas, compradores e caixa.
            </p>
          </div>

          <div class="timeline-four-cols">
            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">01</span>
              <h4 class="step-heading">Registro Rápido no Balcão</h4>
              <p class="step-text">
                O balconista cadastra o medicamento desejado, eventual sinal pago e WhatsApp do paciente em menos de 15 segundos, já emitindo o comprovante 80mm.
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">02</span>
              <h4 class="step-heading">Lista de Compras Automática</h4>
              <p class="step-text">
                O pedido cai automaticamente no painel de Compras agrupado por categoria, com destaque imediato para itens marcados como Urgentes.
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">03</span>
              <h4 class="step-heading">Conferência XML via IA</h4>
              <p class="step-text">
                Ao receber a mercadoria, basta soltar o XML da NF-e: a IA identifica e marca os remédios que chegaram, pedindo sua confirmação final para atualizar o estoque.
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">04</span>
              <h4 class="step-heading">WhatsApp &amp; Baixa Segura</h4>
              <p class="step-text">
                A API envia o modelo personalizado avisando o paciente (com opção de ocultar o nome do remédio pela LGPD) até a entrega final auditada.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ================================================================ -->
      <!-- 5. ARQUITETURA TÉCNICA, MULTI-TENANT & LGPD                      -->
      <!-- ================================================================ -->
      <section id="arquitetura-seguranca" class="tech-section reveal-on-scroll" aria-labelledby="tech-title">
        <div class="landing-shell">
          <div class="section-heading-center">
            <span class="section-tag-kicker">INFRAESTRUTURA ENTERPRISE &amp; PRIVACIDADE</span>
            <h2 id="tech-title" class="section-title-clean">
              Segurança de dados clínicos em nível hospitalar
            </h2>
            <p class="section-desc-clean">
              Arquitetura multi-tenant com isolamento rigoroso por unidade e conformidade nativa com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
            </p>
          </div>

          <div class="pillars-four-grid">
            <div class="pillar-box">
              <div class="pillar-icon-box bg-emerald-tint">
                <Lock :size="22" class="text-emerald" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Proxy Server-Side Isolado</h3>
              <p class="pillar-box-p">
                Chaves da API de WhatsApp e integrações de IA rodam exclusivamente em funções serverless autenticadas, sem expor credenciais no navegador.
              </p>
            </div>

            <div class="pillar-box">
              <div class="pillar-icon-box bg-blue-tint">
                <Building2 :size="22" class="text-blue" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Multi-Tenant com RLS Ativo</h3>
              <p class="pillar-box-p">
                Cada farmácia ou filial opera em seu próprio espaço criptografado no PostgreSQL com políticas Row Level Security por <code>tenant_id</code>.
              </p>
            </div>

            <div class="pillar-box">
              <div class="pillar-icon-box bg-purple-tint">
                <ShieldCheck :size="22" class="text-purple" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Sigilo Farmacêutico (Art. 11)</h3>
              <p class="pillar-box-p">
                Mascaramento de CPF, portabilidade/anonimização (Art. 18) e modo de sigilo em notificações para proteger tratamentos sensíveis do paciente.
              </p>
            </div>

            <div class="pillar-box">
              <div class="pillar-icon-box bg-slate-tint">
                <ClipboardList :size="22" class="text-slate" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Alçadas &amp; Auditoria Imutável</h3>
              <p class="pillar-box-p">
                Perfis distintos para Administrador/RT, Comprador e Balconista, com registro de quem criou, recebeu pagamento, exportou relatórios ou entregou cada item.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ================================================================ -->
      <!-- 6. BANNER CTA FINAL COM MARCA ENCOMED                            -->
      <!-- ================================================================ -->
      <section class="banner-access-section" aria-label="Acesso ao sistema EncoMed">
        <div class="landing-shell">
          <div class="access-banner-card">
            <div class="access-text-group">
              <div style="display: inline-flex; align-items: center; gap: 0.6rem; background: rgba(255,255,255,0.12); padding: 5px 12px; border-radius: 9999px; margin-bottom: 0.85rem;">
                <img src="/encomed-icon.svg" alt="EncoMed" style="height: 20px; width: 20px; object-fit: contain;" />
                <span style="font-size: 0.76rem; font-weight: 700; letter-spacing: 0.04em; color: #dbeafe;">ENCOMED SAAS • PRONTO PARA OPERAÇÃO</span>
              </div>
              <h2 class="access-h2">
                Eleve o padrão de atendimento e controle de encomendas da sua farmácia
              </h2>
              <p class="access-sub">
                Acesse agora com suas credenciais corporativas e gerencie encomendas, compras via XML com IA, WhatsApp e relatórios em um único lugar.
              </p>
            </div>
            <div class="access-btn-group">
              <button
                @click="acessarPlataforma"
                class="btn-primary-pill touch-target btn-access-large"
                id="btn-banner-acessar"
              >
                <LogIn :size="18" aria-hidden="true" />
                <span>{{ estaLogado ? 'Ir para o Painel EncoMed' : 'Acessar Plataforma EncoMed' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- FOOTER OFICIAL DO SAAS ENCOMED -->
    <footer class="landing-footer" role="contentinfo">
      <div class="landing-shell footer-layout">
        <div class="footer-brand-col">
          <img
            src="/encomed-logo.svg"
            alt="Logo EncoMed"
            style="height: 38px; width: auto; object-fit: contain; background: transparent;"
          />
          <div>
            <span class="footer-company-name">EncoMed</span>
            <span class="footer-tagline">
              Sistema SaaS de Encomendas, Conciliação NF-e por IA e Gestão de Medicamentos
            </span>
          </div>
        </div>

        <div class="footer-security-col">
          <span class="security-indicator">
            <Lock :size="13" aria-hidden="true" />
            <span>Criptografia TLS • Isolamento Multi-Tenant RLS • Conformidade LGPD</span>
          </span>
          <button
            @click="acessarPlataforma"
            class="footer-operator-link touch-target"
          >
            Portal do Farmacêutico &amp; Equipe →
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing-root {
  min-height: 100vh;
  background-color: #f8fafc;
  color: #0f172a;
  font-family: var(--font-sans, 'Inter', -apple-system, sans-serif);
  line-height: 1.5;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

.landing-shell {
  max-width: 1220px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.touch-target {
  min-height: 44px;
}

/* HEADER */
.landing-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 74px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
}

.brand-logo-img {
  height: 44px;
  width: auto;
  object-fit: contain;
  border-radius: 8px;
  transition: transform 0.25s ease;
}

.brand-link:hover .brand-logo-img {
  transform: scale(1.04);
}

.brand-text-col {
  display: flex;
  flex-direction: column;
}

.brand-title-main {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.22rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.brand-subtitle-meta {
  font-size: 0.73rem;
  color: #64748b;
  font-weight: 600;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

@media (max-width: 940px) {
  .header-nav {
    display: none;
  }
}

.nav-text-btn {
  background: transparent;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  padding: 0.5rem 0.25rem;
  transition: color 0.15s ease;
}

.nav-text-btn:hover {
  color: #2563eb;
}

/* HERO SECTION */
.hero-section {
  position: relative;
  padding: 3.5rem 0 4rem;
}

.ambient-glow {
  position: absolute;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

.ambient-glow-left {
  top: -120px;
  left: -140px;
  background: radial-gradient(circle, #bfdbfe 0%, transparent 70%);
}

.ambient-glow-right {
  top: 60px;
  right: -140px;
  background: radial-gradient(circle, #a7f3d0 0%, transparent 70%);
}

.hero-lead-block {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 900px;
  margin: 0 auto 2.75rem;
}

.hero-brand-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  background: #ffffff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
  margin-bottom: 1.25rem;
}

.hero-headline {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: clamp(2rem, 4.4vw, 3.15rem);
  font-weight: 800;
  color: #0f172a;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: 1.15rem;
}

.hero-gradient-text {
  background: linear-gradient(135deg, #1d4ed8 0%, #059669 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-paragraph {
  font-size: clamp(1rem, 1.8vw, 1.12rem);
  color: #475569;
  line-height: 1.65;
  max-width: 790px;
  margin: 0 auto 1.75rem;
}

.hero-cta-cluster {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
  margin-bottom: 1.75rem;
}

.hero-btn-lg {
  padding: 0.75rem 1.65rem !important;
  font-size: 0.95rem !important;
}

.hero-highlights-strip {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.highlight-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.9rem;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
}

/* ====================================================================
   CAIXINHA INTERATIVA DO SAAS ENCOMED
   ==================================================================== */
.interactive-showcase-wrapper {
  position: relative;
  z-index: 1;
}

.interactive-window-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 24px;
  box-shadow: 0 24px 55px -12px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.window-topbar {
  background: #0f172a;
  color: #f8fafc;
  padding: 0.8rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.window-dots {
  display: flex;
  gap: 6px;
}

.w-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.dot-red { background: #ef4444; }
.dot-amber { background: #f59e0b; }
.dot-green { background: #10b981; }

.window-brand-center {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.83rem;
  color: #e2e8f0;
}

.window-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #6ee7b7;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: pulseGlow 1.6s infinite;
}

.simulator-mode-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.sim-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 1.1rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  font-size: 0.83rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.sim-mode-btn:hover {
  border-color: #94a3b8;
  color: #0f172a;
}

.sim-mode-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.simulator-body-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #f8fafc;
}

@media (max-width: 960px) {
  .simulator-body-grid {
    grid-template-columns: 1fr;
  }
}

.sim-filter-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.sim-module-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.8rem;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.sim-module-tab.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.sim-module-tab.tab-amber.active {
  background: #d97706;
  border-color: #d97706;
}
.sim-module-tab.tab-blue.active {
  background: #2563eb;
  border-color: #2563eb;
}
.sim-module-tab.tab-emerald.active {
  background: #059669;
  border-color: #059669;
}

.sim-count-bubble {
  background: rgba(148, 163, 184, 0.22);
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 0.7rem;
}

.sim-module-tab.active .sim-count-bubble {
  background: rgba(255, 255, 255, 0.25);
}

.sim-cards-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sim-order-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left-width: 4px;
  border-radius: 16px;
  padding: 1rem 1.1rem;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.sim-order-card:hover {
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.border-state-aguardando { border-left-color: #d97706; }
.border-state-pedido-feito { border-left-color: #2563eb; }
.border-state-chegou { border-left-color: #059669; }
.border-state-entregue { border-left-color: #475569; }

.card-pop-anim {
  animation: statusCardPulse 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.sim-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.sim-cat-tag {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

.sim-patient {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.sim-med-title {
  margin: 4px 0 0;
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
}

.sim-med-title.urgent-red {
  color: #dc2626;
}

.sim-paid-pill {
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s ease;
}

.sim-paid-pill.is-paid {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
}

.sim-paid-pill.is-unpaid {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}

.sim-status-buttons-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  padding-top: 0.65rem;
  border-top: 1px dashed #e2e8f0;
}

@media (max-width: 560px) {
  .sim-status-buttons-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.sim-clickable-pill {
  justify-content: center;
  cursor: pointer !important;
  user-select: none;
  transition: transform 0.14s ease, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease !important;
}

.sim-clickable-pill:active {
  transform: scale(0.94);
}

.active-entregue-sim {
  background-color: #0f172a !important;
  color: #ffffff !important;
  border-color: #0f172a !important;
}

/* PAINEL DE REAÇÃO AO VIVO */
.sim-reaction-column {
  display: flex;
  flex-direction: column;
}

.reaction-live-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.35rem;
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  animation: slideFadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.reaction-live-card.theme-amber { border-top: 4px solid #d97706; }
.reaction-live-card.theme-blue { border-top: 4px solid #2563eb; }
.reaction-live-card.theme-emerald { border-top: 4px solid #059669; }
.reaction-live-card.theme-slate { border-top: 4px solid #334155; }
.reaction-live-card.theme-red { border-top: 4px solid #dc2626; }

.reaction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.reaction-kicker {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #2563eb;
}

.reaction-time {
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 600;
}

.reaction-title {
  font-size: 1.08rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.3rem;
}

.reaction-sub {
  font-size: 0.84rem;
  color: #475569;
  margin: 0 0 1rem;
}

.whatsapp-sim-phone {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  margin-bottom: 1rem;
}

.wa-sim-top {
  background: #075e54;
  color: #ffffff;
  padding: 0.5rem 0.8rem;
  font-size: 0.74rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.wa-sim-bubble {
  background: #efeae2;
  padding: 0.85rem;
  font-size: 0.81rem;
  color: #111b21;
  line-height: 1.45;
}

.wa-sim-ticks {
  display: block;
  text-align: right;
  font-size: 0.68rem;
  font-weight: 700;
  color: #059669;
  margin-top: 6px;
}

.reaction-footer-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 500;
}

/* SUB-SIMULADORES XML & WHITE-LABEL */
.sim-xml-panel,
.sim-whitelabel-panel {
  padding: 1.5rem;
  background: #f8fafc;
}

.sim-xml-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.xml-scanning-box {
  background: #ffffff;
  border: 1px solid #bfdbfe;
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  position: relative;
  overflow: hidden;
}

.scanning-bar {
  height: 4px;
  width: 45%;
  background: linear-gradient(90deg, #2563eb, #10b981);
  border-radius: 9999px;
  margin: 0 auto 0.5rem;
  animation: scanSlide 1s ease-in-out infinite alternate;
}

.sim-xml-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.sim-xml-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  flex-wrap: wrap;
}

.sim-xml-row.row-selected {
  border-color: #6ee7b7;
  background: #f0fdf4;
}

.sim-xml-confirm-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1.1rem;
  border-radius: 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.sim-wl-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}

@media (max-width: 820px) {
  .sim-wl-grid {
    grid-template-columns: 1fr;
  }
}

.sim-wl-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1.35rem;
}

/* ====================================================================
   SEÇÃO DE 6 FUNCIONALIDADES DO SAAS
   ==================================================================== */
.features-section {
  padding: 4.5rem 0;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}

.section-heading-center {
  text-align: center;
  max-width: 720px;
  margin: 0 auto 3rem;
}

.section-tag-kicker {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 800;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
}

.section-title-clean {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 800;
  color: #0f172a;
  line-height: 1.22;
  letter-spacing: -0.02em;
  margin-bottom: 0.65rem;
}

.section-desc-clean {
  font-size: 0.98rem;
  color: #475569;
  line-height: 1.6;
}

.features-six-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

@media (max-width: 960px) {
  .features-six-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .features-six-grid {
    grid-template-columns: 1fr;
  }
}

.feature-mod-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1.65rem;
  display: flex;
  flex-direction: column;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.feature-mod-card:hover {
  transform: translateY(-4px);
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 14px 28px -8px rgba(15, 23, 42, 0.08);
}

.mod-icon-wrap {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.mod-title {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.08rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem;
}

.mod-desc {
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.55;
  flex: 1;
  margin: 0 0 1rem;
}

.mod-pill-tags {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.mod-pill-tags span {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 9999px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
}

/* ====================================================================
   WORKFLOW & TECH PILLARS
   ==================================================================== */
.workflow-section {
  padding: 4.5rem 0;
  background: #f8fafc;
}

.timeline-four-cols,
.pillars-four-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
}

@media (max-width: 960px) {
  .timeline-four-cols,
  .pillars-four-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .timeline-four-cols,
  .pillars-four-grid {
    grid-template-columns: 1fr;
  }
}

.step-card-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1.65rem;
  transition: transform 0.2s ease;
}

.step-card-item:hover {
  transform: translateY(-3px);
}

.step-badge-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  background: #eff6ff;
  color: #2563eb;
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 0.84rem;
  font-weight: 800;
  margin-bottom: 0.9rem;
  border: 1px solid #bfdbfe;
}

.step-heading {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.45rem;
}

.step-text {
  font-size: 0.86rem;
  color: #475569;
  line-height: 1.55;
  margin: 0;
}

.tech-section {
  padding: 4.5rem 0;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.pillar-box {
  padding: 1.5rem;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.pillar-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.bg-emerald-tint { background-color: #ecfdf5; }
.text-emerald { color: #059669; }
.bg-blue-tint { background-color: #eff6ff; }
.text-blue { color: #2563eb; }
.bg-purple-tint { background-color: #f5f3ff; }
.text-purple { color: #7c3aed; }
.bg-slate-tint { background-color: #e2e8f0; }
.text-slate { color: #334155; }

.pillar-box-h3 {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.45rem;
}

.pillar-box-p {
  font-size: 0.86rem;
  color: #475569;
  line-height: 1.55;
  margin: 0;
}

/* BANNER CTA */
.banner-access-section {
  padding: 3.5rem 0 4.5rem;
}

.access-banner-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  border-radius: 24px;
  padding: 2.75rem 3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  color: #ffffff;
  box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.35);
}

@media (max-width: 820px) {
  .access-banner-card {
    flex-direction: column;
    text-align: center;
    padding: 2.25rem 1.5rem;
  }
}

.access-h2 {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.55rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 0.45rem;
}

.access-sub {
  font-size: 0.94rem;
  color: #cbd5e1;
  max-width: 600px;
  margin: 0;
}

.btn-access-large {
  padding: 0.8rem 1.85rem !important;
  font-size: 0.95rem !important;
  white-space: nowrap;
}

/* FOOTER */
.landing-footer {
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  padding: 2rem 0;
}

.footer-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.footer-brand-col {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.footer-company-name {
  display: block;
  font-size: 0.98rem;
  font-weight: 800;
  color: #0f172a;
}

.footer-tagline {
  display: block;
  font-size: 0.78rem;
  color: #64748b;
}

.footer-security-col {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.security-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #475569;
  font-weight: 600;
}

.footer-operator-link {
  background: transparent;
  border: none;
  font-size: 0.84rem;
  font-weight: 700;
  color: #2563eb;
  cursor: pointer;
}

.footer-operator-link:hover {
  text-decoration: underline;
}

/* ANIMAÇÕES */
@keyframes pulseGlow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.25); }
}

@keyframes statusCardPulse {
  0% { transform: scale(1); }
  35% { transform: scale(1.018); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14); }
  100% { transform: scale(1); }
}

@keyframes slideFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scanSlide {
  from { transform: translateX(-35%); }
  to { transform: translateX(35%); }
}

.animate-float-slow {
  animation: floatSlow 4.5s ease-in-out infinite;
}

@keyframes floatSlow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.sim-list-move,
.sim-list-enter-active,
.sim-list-leave-active {
  transition: all 0.3s ease;
}
.sim-list-enter-from,
.sim-list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.reveal-on-scroll {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.55s ease, transform 0.55s ease;
}

.reveal-on-scroll.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .animate-float-slow,
  .pulse-dot,
  .card-pop-anim,
  .reaction-live-card,
  .scanning-bar {
    animation: none !important;
  }
  .reveal-on-scroll {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
</style>
