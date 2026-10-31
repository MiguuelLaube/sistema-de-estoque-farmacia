<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import LoginModal from '../components/LoginModal.vue';
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
  Copy,
  AlertTriangle,
  Settings,
  ChevronDown,
  ChevronUp,
  CheckCheck,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const showLoginModal = ref(false);
const estaLogado = computed(() => authStore.isAuthenticated);

// Controle da Gaveta do Simulador ("Ambiente de Teste")
const simuladorAberto = ref(true);

function alternarSimulador() {
  simuladorAberto.value = !simuladorAberto.value;
}

function acessarPlataforma() {
  if (estaLogado.value) {
    router.push(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
  } else {
    showLoginModal.value = true;
  }
}

function rolarParaSecao(id: string) {
  if (id === 'simulador-interativo') {
    simuladorAberto.value = true;
  }
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

// ============================================================================
// SIMULADOR INTERATIVO ("CAIXINHA" DE MÓDULOS E STATUS CLICÁVEIS DO ENCOMED)
// ============================================================================
type StatusDemo = 'Aguardando' | 'Pedido Feito' | 'Chegou' | 'Entregue';
type AbaSimulador = 'status' | 'pedidos' | 'xml_ia' | 'relatorios_marca';

interface ItemSimulador {
  id: string;
  paciente: string;
  telefone: string;
  medicamento: string;
  categoria: string;
  valor: string;
  saldo: string;
  status: StatusDemo;
  pago: boolean;
  animando: boolean;
}

const abaSimulador = ref<AbaSimulador>('status');
const filtroModuloBox = ref<'Todos' | StatusDemo>('Todos');

const itensDemo = ref<ItemSimulador[]>([
  {
    id: 'sim-1',
    paciente: 'Cliente',
    telefone: '(11) 98765-4321',
    medicamento: 'OZEMPIC 1MG CANETA INJETÁVEL',
    categoria: 'TERMOLÁBIL / ÉTICO',
    valor: 'R$ 985,00',
    saldo: 'R$ 85,00',
    status: 'Aguardando',
    pago: false,
    animando: false,
  },
  {
    id: 'sim-2',
    paciente: 'Cliente',
    telefone: '(11) 99123-8844',
    medicamento: 'LOSARTANA POTÁSSICA 50MG 30 COMP',
    categoria: 'GENÉRICO / CONTÍNUO',
    valor: 'R$ 24,90',
    saldo: 'R$ 0,00',
    status: 'Pedido Feito',
    pago: true,
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
  titulo: 'Clique em qualquer botão de status da encomenda!',
  subtitulo: 'Experimente mudar de "Aguardando" para "Pedido Feito", "Chegou" ou "Entregue"',
  corTema: 'emerald',
  mensagemWhatsapp:
    'Olá Cliente! Seu pedido de OZEMPIC 1MG já está disponível para retirada na Drogaria via EncoMed. Saldo a acertar: R$ 85,00.',
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
  if (filtroModuloBox.value === 'Todos') {
    return itensDemo.value;
  }
  return itensDemo.value.filter((i) => i.status === filtroModuloBox.value);
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
// SUB-SIMULADOR: CENTRAL DE PEDIDOS (COMPRAS & COTAÇÃO COM URGÊNCIA)
// ============================================================================
interface ItemPedidoDemo {
  id: string;
  medicamento: string;
  categoria: string;
  quantidade: number;
  fornecedor: string;
  urgente: boolean;
  status: 'Aguardando' | 'Pedido Feito' | 'Chegou';
  animando?: boolean;
}

const filtroPedidosBox = ref<'Todos' | 'Urgentes' | 'Aguardando' | 'Pedido Feito' | 'Chegou'>('Todos');
const itensPedidosDemo = ref<ItemPedidoDemo[]>([
  {
    id: 'p-1',
    medicamento: 'OZEMPIC 1MG CANETA INJETÁVEL',
    categoria: 'TERMOLÁBIL / GELADEIRA',
    quantidade: 2,
    fornecedor: 'Panpharma',
    urgente: true,
    status: 'Aguardando',
    animando: false,
  },
  {
    id: 'p-2',
    medicamento: 'LOSARTANA POTÁSSICA 50MG 30 COMP',
    categoria: 'GENÉRICO / USO CONTÍNUO',
    quantidade: 6,
    fornecedor: 'Santa Cruz',
    urgente: false,
    status: 'Pedido Feito',
    animando: false,
  },
]);

const feedbackCopiaPedidos = ref<string | null>(null);

function copiarListaPedidosWhatsApp() {
  const texto = itensPedidosDemo.value
    .map(
      (it) =>
        `• ${it.quantidade}x ${it.medicamento} (${it.categoria})${
          it.urgente ? ' [CORTE URGENTE]' : ''
        } - ${it.fornecedor}`
    )
    .join('\n');
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(`*LISTA DE PEDIDOS / COTAÇÃO - DROGARIA*\n\n${texto}`);
  }
  feedbackCopiaPedidos.value = 'Lista de cotação formatada copiada para o WhatsApp do representante!';
  setTimeout(() => {
    feedbackCopiaPedidos.value = null;
  }, 3500);
}

const contagemPedidosDemo = computed(() => {
  const todos = itensPedidosDemo.value;
  return {
    Todos: todos.length,
    Urgentes: todos.filter((i) => i.urgente).length,
    Aguardando: todos.filter((i) => i.status === 'Aguardando').length,
    'Pedido Feito': todos.filter((i) => i.status === 'Pedido Feito').length,
    Chegou: todos.filter((i) => i.status === 'Chegou').length,
  };
});

const itensFiltradosPedidos = computed(() => {
  let lista = itensPedidosDemo.value;
  if (filtroPedidosBox.value === 'Urgentes') {
    lista = lista.filter((i) => i.urgente);
  } else if (filtroPedidosBox.value !== 'Todos') {
    lista = lista.filter((i) => i.status === filtroPedidosBox.value);
  }
  // Os itens urgentes SEMPRE sobem para o topo da lista de cotação!
  return [...lista].sort((a, b) => Number(b.urgente) - Number(a.urgente));
});

const ultimaReacaoPedidos = ref<EventoReacao>({
  titulo: 'Central de Pedidos e Cotação Integrada',
  subtitulo: 'A demanda dos clientes vira automaticamente lista de compras agrupada',
  corTema: 'blue',
  detalheExtra: 'Clique no botão URGENTE para subir o medicamento para o corte prioritário da distribuidora.',
  horario: 'Agora mesmo',
});
const chaveAnimacaoReacaoPedidos = ref(1);

function alternarUrgenciaPedido(item: ItemPedidoDemo) {
  item.urgente = !item.urgente;
  item.animando = true;
  setTimeout(() => {
    item.animando = false;
  }, 550);
  chaveAnimacaoReacaoPedidos.value++;
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  ultimaReacaoPedidos.value = {
    titulo: item.urgente ? 'URGÊNCIA ATIVADA NO PEDIDO DE COMPRA!' : 'Prioridade de compra normalizada',
    subtitulo: `${item.medicamento} • ${item.quantidade}x caixas para cotar`,
    corTema: item.urgente ? 'red' : 'slate',
    detalheExtra: item.urgente
      ? `Destaque vermelho semântico ativado. O comprador é alertado para fechar este item antes do corte da distribuidora ${item.fornecedor}.`
      : `O item voltou para a esteira padrão de compras da categoria ${item.categoria}.`,
    horario: hora,
  };
}

function clicarStatusPedido(item: ItemPedidoDemo, novoStatus: 'Aguardando' | 'Pedido Feito' | 'Chegou') {
  item.status = novoStatus;
  item.animando = true;
  setTimeout(() => {
    item.animando = false;
  }, 550);
  chaveAnimacaoReacaoPedidos.value++;
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (novoStatus === 'Aguardando') {
    ultimaReacaoPedidos.value = {
      titulo: 'Item em "Aguardando Cotação"',
      subtitulo: `${item.medicamento} na fila de preços com distribuidoras`,
      corTema: 'amber',
      detalheExtra: `Agrupando unidades de clientes e reposição de estoque com a distribuidora ${item.fornecedor}.`,
      horario: hora,
    };
  } else if (novoStatus === 'Pedido Feito') {
    ultimaReacaoPedidos.value = {
      titulo: 'Pedido Feito com a Distribuidora!',
      subtitulo: `Faturado em ${item.fornecedor} • Previsão no próximo roteiro`,
      corTema: 'blue',
      detalheExtra: 'Quando a distribuidora emitir a NF-e, o XML IA identifica o pacote automaticamente.',
      horario: hora,
    };
  } else {
    ultimaReacaoPedidos.value = {
      titulo: 'Medicamento Chegou na Farmácia!',
      subtitulo: `${item.quantidade}x caixas de ${item.medicamento} conferidas`,
      corTema: 'emerald',
      detalheExtra: 'Estoque atualizado e encomendas de balcão vinculadas avisadas imediatamente no WhatsApp!',
      horario: hora,
    };
  }
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
const tipoDocumentoExemplo = ref<'pdf_a4' | 'bobina_80mm'>('pdf_a4');
const mostrarGavetaRelatorio = ref(false);

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
  if (router.currentRoute.value.query.login === 'true' || (typeof window !== 'undefined' && window.location.hash === '#login')) {
    showLoginModal.value = true;
  }

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
  <div class="landing-root" :class="{ 'landing-blurred-bg': showLoginModal }">
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
            alt="Logo EncoMed"
            class="brand-logo-img"
          />
          <div class="brand-text-col">
            <span class="brand-title-main">EncoMed</span>
            <span class="brand-subtitle-meta">Sistema de Encomendas &amp; Gestão Farmacêutica</span>
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
              <span>PLATAFORMA OFICIAL • <strong>ENCOMED</strong></span>
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
            <div class="interactive-window-card" :class="{ 'window-collapsed': !simuladorAberto }">
              <!-- Barra Superior Estilo App Window (Funciona como gaveta) -->
              <div
                class="window-topbar"
                @click="alternarSimulador"
                :title="simuladorAberto ? 'Clique para recolher o ambiente de teste' : 'Clique para abrir o ambiente de teste'"
              >
                <!-- Botões de Janela / Gaveta -->
                <div class="window-dots" role="group" aria-label="Controles da janela">
                  <button
                    type="button"
                    class="w-dot dot-red"
                    @click.stop="alternarSimulador"
                    title="Recolher gaveta"
                    aria-label="Recolher gaveta"
                  ></button>
                  <button
                    type="button"
                    class="w-dot dot-amber"
                    @click.stop="alternarSimulador"
                    title="Minimizar / Recolher gaveta"
                    aria-label="Recolher gaveta"
                  ></button>
                  <button
                    type="button"
                    class="w-dot dot-green"
                    @click.stop="alternarSimulador"
                    title="Expandir / Abrir gaveta"
                    aria-label="Expandir gaveta"
                  ></button>
                </div>

                <!-- Nome Oficial no Topo: Apenas "EncoMed" -->
                <div class="window-brand-center">
                  <img src="/encomed-icon.svg" alt="EncoMed" style="height: 20px; width: 20px; object-fit: contain;" />
                  <span class="window-brand-title">EncoMed</span>
                </div>

                <!-- Botão Gaveta na Direita -->
                <button
                  type="button"
                  @click.stop="alternarSimulador"
                  class="window-drawer-toggle-btn"
                  :title="simuladorAberto ? 'Recolher ambiente de teste' : 'Abrir ambiente de teste'"
                >
                  <span class="pulse-dot" v-if="simuladorAberto"></span>
                  <span>{{ simuladorAberto ? 'Recolher Gaveta' : 'Abrir Ambiente de Teste' }}</span>
                  <ChevronUp v-if="simuladorAberto" :size="14" />
                  <ChevronDown v-else :size="14" />
                </button>
              </div>

              <!-- Corpo do Simulador com Efeito Gaveta Simples e Suave -->
              <Transition name="drawer-slide">
                <div v-show="simuladorAberto" class="simulator-drawer-body">
                  <!-- Seletor de Módulos da Caixinha -->
                  <div class="simulator-mode-bar">
                <button
                  type="button"
                  @click="abaSimulador = 'status'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'status' }"
                >
                  <PackageOpen :size="15" />
                  <span>1. Encomendas de Balcão</span>
                </button>

                <button
                  type="button"
                  @click="abaSimulador = 'pedidos'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'pedidos' }"
                >
                  <ClipboardList :size="15" />
                  <span>2. Pedidos &amp; Cotação</span>
                </button>

                <button
                  type="button"
                  @click="abaSimulador = 'xml_ia'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'xml_ia' }"
                >
                  <Sparkles :size="15" />
                  <span>3. Importar XML com IA</span>
                </button>

                <button
                  type="button"
                  @click="abaSimulador = 'relatorios_marca'"
                  class="sim-mode-btn"
                  :class="{ active: abaSimulador === 'relatorios_marca' }"
                >
                  <FileText :size="15" />
                  <span>4. Relatórios PDF &amp; Marca</span>
                </button>
              </div>

              <!-- MODO 1: ENCOMENDAS DE BALCÃO (STATUS INTERATIVOS + WHATSAPP SEM RAIO DE EMERGÊNCIA) -->
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
                          <h4 class="sim-med-title">
                            {{ item.medicamento }}
                          </h4>
                        </div>

                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                          <button
                            type="button"
                            @click="alternarPagamentoDemo(item)"
                            class="sim-paid-pill"
                            :class="item.pago ? 'is-paid' : 'is-unpaid'"
                            title="Clique para alternar Pago / Pendente no Balcão"
                          >
                            {{ item.pago ? '100% Pago' : `Falta ${item.saldo}` }}
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
                      <span class="reaction-kicker">DISPARO &amp; REAÇÃO EM TEMPO REAL</span>
                      <span class="reaction-time">{{ ultimaReacao.horario }}</span>
                    </div>

                    <h3 class="reaction-title">{{ ultimaReacao.titulo }}</h3>
                    <p class="reaction-sub">{{ ultimaReacao.subtitulo }}</p>

                    <!-- Balão Oficial do WhatsApp quando aplicável -->
                    <div v-if="ultimaReacao.mensagemWhatsapp" class="whatsapp-sim-phone">
                      <div class="wa-sim-top">
                        <img src="/encomed-icon.svg" alt="" style="width: 20px; height: 20px; object-fit: contain;" />
                        <span>WhatsApp API Oficial • Mensagem Automática</span>
                      </div>
                      <div class="wa-sim-bubble">
                        {{ ultimaReacao.mensagemWhatsapp }}
                        <span class="wa-sim-ticks" style="display: inline-flex; align-items: center; gap: 4px;">
                          <CheckCheck :size="13" />
                          <span>Enviado com sucesso</span>
                        </span>
                      </div>
                    </div>

                    <div class="reaction-footer-note">
                      <ShieldCheck :size="16" style="flex-shrink: 0;" />
                      <span>{{ ultimaReacao.detalheExtra }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- MODO 2: CENTRAL DE PEDIDOS (COMPRAS & COTAÇÃO COM URGÊNCIA) -->
              <div v-else-if="abaSimulador === 'pedidos'" class="simulator-body-grid">
                <!-- Coluna Esquerda: Lista de Pedidos de Compra -->
                <div class="sim-orders-column">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                    <div class="sim-filter-pills" role="tablist" aria-label="Filtrar pedidos de compra">
                      <button
                        v-for="mod in (['Todos', 'Urgentes', 'Aguardando', 'Pedido Feito', 'Chegou'] as const)"
                        :key="mod"
                        type="button"
                        @click="filtroPedidosBox = mod"
                        class="sim-module-tab"
                        :class="[
                          { active: filtroPedidosBox === mod },
                          mod === 'Urgentes' ? 'tab-urgent' : '',
                          mod === 'Aguardando' ? 'tab-amber' : '',
                          mod === 'Pedido Feito' ? 'tab-blue' : '',
                          mod === 'Chegou' ? 'tab-emerald' : '',
                        ]"
                      >
                        <span v-if="mod === 'Urgentes'" style="display: inline-flex; align-items: center; gap: 4px;">
                          <Zap :size="12" />
                          <span>Urgentes</span>
                        </span>
                        <span v-else>{{ mod }}</span>
                        <span class="sim-count-bubble">{{ contagemPedidosDemo[mod] }}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      @click="copiarListaPedidosWhatsApp"
                      class="btn-outline-neutral"
                      style="font-size: 0.75rem; padding: 0.35rem 0.85rem;"
                      title="Copiar lista formatada para enviar no WhatsApp da distribuidora"
                    >
                      <Copy :size="13" />
                      <span>Copiar p/ Distribuidora</span>
                    </button>
                  </div>

                  <div v-if="feedbackCopiaPedidos" style="display: flex; align-items: center; gap: 6px; margin-bottom: 0.65rem; padding: 0.5rem 0.85rem; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.78rem; font-weight: 600;">
                    <CheckCircle2 :size="14" />
                    <span>{{ feedbackCopiaPedidos }}</span>
                  </div>

                  <TransitionGroup name="sim-list" tag="div" class="sim-cards-stack">
                    <div
                      v-for="item in itensFiltradosPedidos"
                      :key="item.id"
                      class="sim-order-card"
                      :class="[
                        `border-state-${item.status.toLowerCase().replace(' ', '-')}`,
                        { 'card-urgent-highlight': item.urgente },
                        { 'card-pop-anim': item.animando },
                      ]"
                    >
                      <div class="sim-card-top">
                        <div>
                          <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                            <span class="sim-cat-tag">{{ item.categoria }}</span>
                            <span style="font-size: 0.74rem; color: #64748b; font-weight: 600;">Distribuidora: <strong>{{ item.fornecedor }}</strong></span>
                            <span v-if="item.urgente" class="badge-urgent-pulse">
                              <Zap :size="11" />
                              <span>CORTE URGENTE</span>
                            </span>
                          </div>
                          <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 4px;">
                            <h4 class="sim-med-title" :class="{ 'urgent-red': item.urgente }">
                              {{ item.medicamento }}
                            </h4>
                            <span class="badge badge-qty">{{ item.quantidade }} un.</span>
                          </div>
                        </div>
                      </div>

                      <!-- Botões de Status do Pedido de Compra (Mesmo design da tela de pedidos normal - Segunda Print) -->
                      <div class="sim-pedido-actions-row" role="group" aria-label="Alterar status do pedido de compra">
                        <button
                          type="button"
                          @click="clicarStatusPedido(item, 'Aguardando')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-aguardo': item.status === 'Aguardando' }"
                        >
                          <Clock :size="13" />
                          <span>Aguardo</span>
                        </button>

                        <button
                          type="button"
                          @click="clicarStatusPedido(item, 'Pedido Feito')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-feito': item.status === 'Pedido Feito' }"
                        >
                          <Check :size="13" />
                          <span>Feito</span>
                        </button>

                        <button
                          type="button"
                          @click="clicarStatusPedido(item, 'Chegou')"
                          class="pedido-status-pill sim-clickable-pill"
                          :class="{ 'active-chegou': item.status === 'Chegou' }"
                        >
                          <Package :size="13" />
                          <span>Chegou</span>
                        </button>

                        <!-- Botão Marcar como Emergência / Urgência com design idêntico à tela de pedidos normal -->
                        <button
                          type="button"
                          @click="alternarUrgenciaPedido(item)"
                          class="btn-icon-urgent"
                          :class="{ 'active-urgent': item.urgente }"
                          :title="item.urgente ? 'Remover urgência' : 'Marcar como emergência'"
                          aria-label="Marcar como emergência"
                        >
                          <Zap :size="15" />
                        </button>

                        <!-- Ícone de Opções / Configuração -->
                        <button
                          type="button"
                          class="btn-icon-gear"
                          title="Opções do pedido"
                          aria-label="Opções do pedido"
                        >
                          <Settings :size="15" />
                        </button>
                      </div>
                    </div>
                  </TransitionGroup>
                </div>

                <!-- Coluna Direita: Reação dos Pedidos em Tempo Real -->
                <div class="sim-reaction-column">
                  <div :key="chaveAnimacaoReacaoPedidos" class="reaction-live-card" :class="`theme-${ultimaReacaoPedidos.corTema}`">
                    <div class="reaction-header">
                      <span class="reaction-kicker">CENTRAL DE COMPRAS &amp; COTAÇÃO</span>
                      <span class="reaction-time">{{ ultimaReacaoPedidos.horario }}</span>
                    </div>

                    <h3 class="reaction-title">{{ ultimaReacaoPedidos.titulo }}</h3>
                    <p class="reaction-sub">{{ ultimaReacaoPedidos.subtitulo }}</p>

                    <div class="sim-order-kpi-box">
                      <div class="kpi-mini-col">
                        <span class="kpi-label">Itens na Lista</span>
                        <strong class="kpi-val">{{ contagemPedidosDemo.Todos }} itens</strong>
                      </div>
                      <div class="kpi-mini-col">
                        <span class="kpi-label">Cortes Urgentes</span>
                        <strong class="kpi-val" style="color: #dc2626;">{{ contagemPedidosDemo.Urgentes }} emergenciais</strong>
                      </div>
                      <div class="kpi-mini-col">
                        <span class="kpi-label">Previsão Entrega</span>
                        <strong class="kpi-val" style="color: #059669;">Hoje 16:30</strong>
                      </div>
                    </div>

                    <div class="reaction-footer-note">
                      <AlertTriangle v-if="ultimaReacaoPedidos.corTema === 'red'" :size="16" style="flex-shrink: 0; color: #dc2626;" />
                      <ShieldCheck v-else :size="16" style="flex-shrink: 0;" />
                      <span>{{ ultimaReacaoPedidos.detalheExtra }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- MODO 3: SIMULADOR DE IMPORTAÇÃO DE XML COM IA (FORMATO RECONCILIAÇÃO ELEGANTE) -->
              <div v-else-if="abaSimulador === 'xml_ia'" class="sim-xml-panel">
                <div class="sim-xml-header-clean">
                  <div>
                    <span class="category-header-pill" style="margin-bottom: 8px;">
                      <Sparkles :size="12" />
                      <span>ENCOPHARMA AI • CONFERÊNCIA INTELIGENTE DE NF-E SEFAZ</span>
                    </span>
                    <h3 style="font-size: 1.25rem; font-weight: 800; color: #0f172a; margin: 4px 0 6px;">
                      A IA identifica o que chegou na Nota Fiscal e seleciona sozinha — você só confirma!
                    </h3>
                    <p style="font-size: 0.88rem; color: #64748b; margin: 0; max-width: 720px; line-height: 1.5;">
                      Mesmo quando a distribuidora envia abreviações como <code>LOSART POT 50MG C/30 COMP MEDLEY</code>, a inteligência do EncoMed localiza a encomenda, valida dosagens e deixa pré-marcado para você dar entrada em 1 clique.
                    </p>
                  </div>

                  <button type="button" @click="rodarDemonstracaoXmlIa" class="btn-primary-pill" style="white-space: nowrap;">
                    <Play v-if="xmlSimEtapa !== 'confirmado'" :size="15" />
                    <RotateCcw v-else :size="15" />
                    <span>{{ xmlSimEtapa === 'confirmado' ? 'Repetir Simulação IA' : 'Simular Leitura de XML' }}</span>
                  </button>
                </div>

                <div v-if="xmlSimEtapa === 'escaneando'" class="xml-scanning-box">
                  <div class="scanning-bar"></div>
                  <strong style="color: #0f172a; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 6px;">
                    <Sparkles :size="16" style="color: #2563eb;" />
                    <span>IA decodificando XML SEFAZ #0048921 da Distribuidora Panpharma...</span>
                  </strong>
                  <span style="color: #64748b; font-size: 0.82rem;">Normalizando dosagens (mg/mcg), EAN de barras e localizando encomendas de balcão correspondentes.</span>
                </div>

                <div v-else class="sim-xml-table-wrap">
                  <!-- Cabeçalho de Tabela Formatado -->
                  <div class="sim-xml-table-head">
                    <span style="width: 38px; text-align: center;">Sel.</span>
                    <span style="flex: 2; min-width: 200px;">Item na Nota Fiscal (Distribuidora)</span>
                    <span style="flex: 2; min-width: 200px;">Encomenda Vinculada no Balcão</span>
                    <span style="width: 140px; text-align: center;">Acurácia da IA</span>
                    <span style="width: 130px; text-align: right;">Status / Ação</span>
                  </div>

                  <!-- Linhas da Tabela Formatadas com Alto Contraste -->
                  <div class="sim-xml-table-body">
                    <div
                      v-for="row in xmlSimItens"
                      :key="row.id"
                      class="sim-xml-table-row"
                      :class="{ 'row-active-match': row.selecionado, 'row-ignored': row.confianca === 0 }"
                    >
                      <div style="width: 38px; display: flex; justify-content: center;">
                        <input
                          type="checkbox"
                          v-model="row.selecionado"
                          :disabled="row.confianca === 0 || xmlSimEtapa === 'confirmado'"
                          class="sim-checkbox-round"
                        />
                      </div>

                      <div style="flex: 2; min-width: 200px;">
                        <span class="xml-source-tag">XML DANFE</span>
                        <div class="xml-source-title">{{ row.xmlNome }}</div>
                      </div>

                      <div style="flex: 2; min-width: 200px;">
                        <span class="xml-target-tag">{{ row.confianca > 0 ? 'Balcão Vinculado' : 'Estoque Geral' }}</span>
                        <div class="xml-target-title" :class="{ 'text-muted-row': row.confianca === 0 }">
                          {{ row.pedidoNome }}
                        </div>
                      </div>

                      <div style="width: 140px; display: flex; justify-content: center;">
                        <span v-if="row.confianca > 0" class="badge-ai-confidence">
                          <Sparkles :size="12" />
                          <span>{{ row.confianca }}% Precisão</span>
                        </span>
                        <span v-else class="badge-ai-none">
                          Sem vínculo
                        </span>
                      </div>

                      <div style="width: 130px; display: flex; justify-content: flex-end;">
                        <span
                          class="pedido-status-pill"
                          :class="row.status === 'Chegou' ? 'active-chegou' : row.status === 'Pedido Feito' ? 'active-feito' : 'status-pill-neutral'"
                        >
                          <Package v-if="row.status === 'Chegou'" :size="12" />
                          <CheckCircle v-else-if="row.status === 'Pedido Feito'" :size="12" />
                          <span>{{ row.status }}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Barra de Confirmação Final com Design Limpo -->
                  <div class="sim-xml-confirm-bar-clean">
                    <div v-if="xmlSimEtapa !== 'confirmado'" style="display: flex; align-items: center; gap: 0.65rem;">
                      <ShieldCheck :size="20" style="color: #2563eb; flex-shrink: 0;" />
                      <span style="font-size: 0.88rem; color: #1e3a8a;">
                        <strong>Confirmação Segura:</strong> 2 medicamentos pré-selecionados pela IA aguardam sua autorização para atualizar o status e disparar mensagens automáticas aos clientes.
                      </span>
                    </div>
                    <div v-else style="display: flex; align-items: center; gap: 0.65rem; color: #065f46;">
                      <CheckCircle2 :size="20" style="color: #059669; flex-shrink: 0;" />
                      <span style="font-size: 0.88rem; font-weight: 700;">
                        Sucesso! 2 encomendas atualizadas para "Chegou" e notificações de WhatsApp enviadas aos pacientes!
                      </span>
                    </div>

                    <button
                      v-if="xmlSimEtapa !== 'confirmado'"
                      type="button"
                      @click="confirmarChegadaXmlDemo"
                      class="btn-primary-pill"
                      style="background: #059669; white-space: nowrap;"
                    >
                      <Check :size="16" />
                      <span>Confirmar Mudança para "Chegou"</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- MODO 4: RELATÓRIOS PDF & MARCA + PRÉ-VISUALIZAÇÃO REAL DO DOCUMENTO GERADO -->
              <div v-else class="sim-whitelabel-panel">
                <div class="sim-wl-grid">
                  <div class="sim-wl-card">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.6rem;">
                      <Palette :size="18" :style="{ color: corDemoMarca }" />
                      <h4 style="margin: 0; font-size: 1rem; font-weight: 800;">Identidade Visual Completa</h4>
                    </div>
                    <p style="font-size: 0.84rem; color: #64748b; margin-bottom: 1rem;">
                      Personalize logo, cores primária/secundária, menu claro ou escuro, arredondamento e fontes. Clique numa cor para ver o relatório mudar em tempo real:
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
                      <h4 style="margin: 0; font-size: 1rem; font-weight: 800;">Exportação de Relatórios</h4>
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
                      style="display: flex; align-items: center; gap: 6px; margin-top: 0.85rem; padding: 0.6rem 0.85rem; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.8rem; font-weight: 600;"
                    >
                      <CheckCircle2 :size="14" />
                      <span>{{ feedbackDownloadDemo }}</span>
                    </div>
                  </div>
                </div>

                <!-- BOTÃO DISCRETO DE GAVETA PARA VER/OCULTAR O RELATÓRIO FORMATADO -->
                <div class="sim-report-drawer-trigger-bar">
                  <button
                    type="button"
                    @click="mostrarGavetaRelatorio = !mostrarGavetaRelatorio"
                    class="btn-report-drawer-toggle"
                    :class="{ 'is-open': mostrarGavetaRelatorio }"
                  >
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <FileText :size="16" />
                      <span>{{ mostrarGavetaRelatorio ? 'Recolher Exemplo do Relatório' : 'Visualizar Exemplo do Relatório Formatado' }}</span>
                    </div>
                    <div class="drawer-toggle-badge">
                      <span style="font-size: 0.75rem; font-weight: 600;">{{ mostrarGavetaRelatorio ? 'Ocultar Gaveta' : 'A4 & Bobina 80mm' }}</span>
                      <ChevronUp v-if="mostrarGavetaRelatorio" :size="15" />
                      <ChevronDown v-else :size="15" />
                    </div>
                  </button>
                </div>

                <!-- PRÉ-VISUALIZAÇÃO REALISTA DO DOCUMENTO FORMATADO GERADO PELO SISTEMA (RETRÁTIL NA GAVETA) -->
                <Transition name="drawer-slide">
                  <div v-show="mostrarGavetaRelatorio" class="sim-report-preview-container">
                    <div class="preview-mode-header">
                      <div>
                        <span class="preview-kicker">DOCUMENTO FORMATADO GERADO AUTOMATICAMENTE</span>
                        <h4 style="margin: 2px 0 0; font-size: 1.05rem; font-weight: 800; color: #0f172a;">
                          Veja como seus relatórios e cupons chegam prontos para impressão
                        </h4>
                      </div>

                      <div class="preview-format-tabs" role="tablist">
                        <button
                          type="button"
                          @click="tipoDocumentoExemplo = 'pdf_a4'"
                          class="preview-tab-btn"
                          :class="{ active: tipoDocumentoExemplo === 'pdf_a4' }"
                        >
                          <FileText :size="14" />
                          <span>Folha A4 (PDF Executivo)</span>
                        </button>
                        <button
                          type="button"
                          @click="tipoDocumentoExemplo = 'bobina_80mm'"
                          class="preview-tab-btn"
                          :class="{ active: tipoDocumentoExemplo === 'bobina_80mm' }"
                        >
                          <Printer :size="14" />
                          <span>Cupom Térmico (Bobina 80mm)</span>
                        </button>
                      </div>
                    </div>

                    <!-- DOCUMENTO 1: FOLHA A4 (PDF EXECUTIVO) -->
                    <div v-if="tipoDocumentoExemplo === 'pdf_a4'" class="a4-document-sheet">
                      <div class="a4-brand-topbar" :style="{ background: corDemoMarca }"></div>

                      <div class="a4-sheet-content">
                        <!-- Cabeçalho Oficial -->
                        <div class="a4-header-row">
                          <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <img src="/encomed-icon.svg" alt="" style="width: 36px; height: 36px; object-fit: contain;" />
                            <div>
                              <h2 class="a4-pharmacy-title" :style="{ color: corDemoMarca }">DROGARIA</h2>
                              <p class="a4-pharmacy-meta">CNPJ: 12.345.678/0001-90 • Farmacêutico Resp.: Responsável Técnico (CRF 00.000)</p>
                            </div>
                          </div>

                          <div style="text-align: right;">
                            <span class="a4-report-badge">RELATÓRIO GERENCIAL</span>
                            <div class="a4-report-title">ENCOMENDAS &amp; RECEBÍVEIS</div>
                            <div class="a4-report-date">Emissão: 30/10/2026 • 23:25 • Pág. 1/1</div>
                          </div>
                        </div>

                        <!-- 4 Cards de Resumo Gerencial (KPIs) -->
                        <div class="a4-kpis-grid">
                          <div class="a4-kpi-card">
                            <span class="a4-kpi-sub">Total de Encomendas</span>
                            <strong class="a4-kpi-num">2 pedidos</strong>
                          </div>
                          <div class="a4-kpi-card">
                            <span class="a4-kpi-sub">Faturamento Previsto</span>
                            <strong class="a4-kpi-num" style="color: #059669;">R$ 1.009,90</strong>
                          </div>
                          <div class="a4-kpi-card">
                            <span class="a4-kpi-sub">Sinais Pagos (Recebidos)</span>
                            <strong class="a4-kpi-num" style="color: #2563eb;">R$ 924,90</strong>
                          </div>
                          <div class="a4-kpi-card a4-kpi-highlight">
                            <span class="a4-kpi-sub">Saldo a Receber na Retirada</span>
                            <strong class="a4-kpi-num" style="color: #d97706;">R$ 85,00</strong>
                          </div>
                        </div>

                        <!-- Tabela de Itens Formatada (2 ITENS APENAS) -->
                        <table class="a4-data-table">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Rastreio</th>
                              <th>Paciente / WhatsApp</th>
                              <th>Medicamento Encomendado</th>
                              <th style="text-align: right;">Total</th>
                              <th style="text-align: right;">Sinal</th>
                              <th style="text-align: right;">A Receber</th>
                              <th style="text-align: center;">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>30/10 14:20</td>
                              <td><code class="a4-code">ENC-2026-412</code></td>
                              <td><strong>Cliente</strong><br /><small style="color: #64748b;">(11) 98765-4321</small></td>
                              <td>OZEMPIC 1MG CANETA INJ<br /><small class="sim-cat-tag">TERMOLÁBIL</small></td>
                              <td style="text-align: right; font-weight: 700;">R$ 985,00</td>
                              <td style="text-align: right; color: #059669;">R$ 900,00</td>
                              <td style="text-align: right; font-weight: 800; color: #d97706;">R$ 85,00</td>
                              <td style="text-align: center;"><span class="a4-status-pill status-chegou">Chegou</span></td>
                            </tr>
                            <tr>
                              <td>30/10 11:05</td>
                              <td><code class="a4-code">ENC-2026-408</code></td>
                              <td><strong>Cliente</strong><br /><small style="color: #64748b;">(11) 99123-8844</small></td>
                              <td>LOSARTANA POTÁSSICA 50MG<br /><small class="sim-cat-tag">CONTÍNUO</small></td>
                              <td style="text-align: right; font-weight: 700;">R$ 24,90</td>
                              <td style="text-align: right; color: #059669;">R$ 24,90</td>
                              <td style="text-align: right; color: #64748b;">R$ 0,00</td>
                              <td style="text-align: center;"><span class="a4-status-pill status-feito">Pedido Feito</span></td>
                            </tr>
                          </tbody>
                        </table>

                        <!-- Rodapé da Folha com Selo LGPD e Assinatura Digital -->
                        <div class="a4-footer-row">
                          <div style="display: flex; align-items: center; gap: 0.5rem; color: #475569; font-size: 0.72rem;">
                            <ShieldCheck :size="16" style="color: #059669;" />
                            <span>Documento emitido com conformidade LGPD (Art. 18) e trilha de auditoria digital rastreável.</span>
                          </div>
                          <div style="font-family: monospace; font-size: 0.68rem; color: #94a3b8;">
                            AUTENTICAÇÃO: SHA256-7F8A2B...9C41E0
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- DOCUMENTO 2: BOBINA TÉRMICA 80MM (CUPOM DE BALCÃO) -->
                    <div v-else class="receipt-thermal-wrapper">
                      <div class="receipt-thermal-paper">
                        <div class="receipt-header">
                          <h3 class="receipt-title">DROGARIA</h3>
                          <p class="receipt-meta">Av. Principal, 1000 - Centro</p>
                          <p class="receipt-meta">CNPJ: 12.345.678/0001-90</p>
                          <div class="receipt-divider">================================</div>
                          <strong class="receipt-highlight">COMPROVANTE DE ENCOMENDA</strong>
                          <div class="receipt-meta">Rastreio: <strong>ENC-2026-412</strong></div>
                          <div class="receipt-meta">Data: 30/10/2026 14:20:15</div>
                        </div>

                        <div class="receipt-divider">--------------------------------</div>
                        <div class="receipt-customer">
                          <div>CLIENTE: CLIENTE</div>
                          <div>TEL/WHATSAPP: (11) 98765-4321</div>
                          <div>ATENDENTE: BALCÃO</div>
                        </div>

                        <div class="receipt-divider">--------------------------------</div>
                        <div class="receipt-items">
                          <div style="display: flex; justify-content: space-between;">
                            <span>1x OZEMPIC 1MG CANETA INJ</span>
                            <strong>R$ 985,00</strong>
                          </div>
                          <small style="color: #475569;">* Medicamento Termolábil (Geladeira)</small>
                        </div>

                        <div class="receipt-divider">================================</div>
                        <div class="receipt-totals">
                          <div style="display: flex; justify-content: space-between;">
                            <span>VALOR TOTAL:</span>
                            <span>R$ 985,00</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-weight: bold;">
                            <span>SINAL PAGO (PIX):</span>
                            <span>R$ 900,00</span>
                          </div>
                          <div class="receipt-divider">--------------------------------</div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 800;">
                            <span>SALDO NA RETIRADA:</span>
                            <span>R$ 85,00</span>
                          </div>
                        </div>

                        <div class="receipt-divider">================================</div>
                        <div class="receipt-barcode">
                          ||||| ||||||| ||| |||||| ||||| ||||||
                          <div style="font-size: 0.68rem; letter-spacing: 2px;">ENC-2026-412</div>
                        </div>

                        <div class="receipt-footer">
                          <p>Você receberá um aviso no seu WhatsApp assim que o produto chegar na farmácia!</p>
                          <p>Apresente este cupom no balcão de retirada.</p>
                          <small>EncoMed Sistemas • Gestão Farmacêutica</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>
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
                <span style="font-size: 0.76rem; font-weight: 700; letter-spacing: 0.04em; color: #dbeafe;">ENCOMED • PRONTO PARA OPERAÇÃO</span>
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
              Sistema de Encomendas, Conciliação NF-e por IA e Gestão de Medicamentos
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

  <!-- Janela Flutuante de Login Centralizada (Modal com Fundo Borrado) -->
  <LoginModal v-model="showLoginModal" />
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
  transition: filter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.landing-root.landing-blurred-bg {
  filter: blur(6px) brightness(0.95);
  pointer-events: none;
  user-select: none;
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
  transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.interactive-window-card.window-collapsed {
  box-shadow: 0 4px 18px -2px rgba(15, 23, 42, 0.08);
  border-radius: 16px;
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
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease, border-radius 0.3s ease;
}

.window-topbar:hover {
  background: #1e293b;
}

.interactive-window-card.window-collapsed .window-topbar {
  border-radius: 16px;
}

.window-dots {
  display: flex;
  align-items: center;
  gap: 7px;
}

.w-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.w-dot:hover {
  transform: scale(1.18);
  opacity: 0.88;
}

.dot-red { background: #ef4444; }
.dot-amber { background: #f59e0b; }
.dot-green { background: #10b981; }

.window-brand-center {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.window-brand-title {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 0.95rem;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.window-drawer-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f1f5f9;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.window-drawer-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.35);
  transform: scale(1.03);
}

/* Transição de Gaveta Simples e Limpa */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  max-height: 0 !important;
  opacity: 0;
  transform: translateY(-8px);
}

.drawer-slide-enter-to,
.drawer-slide-leave-from {
  max-height: 3000px;
  opacity: 1;
  transform: translateY(0);
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
   ESTILOS: CENTRAL DE PEDIDOS & COTAÇÃO (COMPRAS)
   ==================================================================== */
.tab-urgent.active {
  background-color: #fef2f2 !important;
  color: #dc2626 !important;
  border-color: #fca5a5 !important;
}

.card-urgent-highlight {
  border-left: 4px solid #dc2626 !important;
  background: #fffafa !important;
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.08);
}

.sim-pedido-actions-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding-top: 0.65rem;
  border-top: 1px dashed #e2e8f0;
  flex-wrap: wrap;
}

.sim-pedido-actions-row .pedido-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 500;
  border: 1.5px solid #cbd5e1;
  background-color: #ffffff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sim-pedido-actions-row .pedido-status-pill:hover {
  background-color: #f8fafc;
  color: #0f172a;
  border-color: #94a3b8;
}

.sim-pedido-actions-row .pedido-status-pill.active-aguardo {
  background-color: #fffbeb !important;
  border-color: #f59e0b !important;
  color: #b45309 !important;
  font-weight: 600;
}

.sim-pedido-actions-row .pedido-status-pill.active-feito {
  background-color: #eff6ff !important;
  border-color: #60a5fa !important;
  color: #1d4ed8 !important;
  font-weight: 600;
}

.sim-pedido-actions-row .pedido-status-pill.active-chegou {
  background-color: #ecfdf5 !important;
  border-color: #34d399 !important;
  color: #047857 !important;
  font-weight: 600;
}

.sim-pedido-actions-row .btn-icon-urgent {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid #cbd5e1;
  background-color: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sim-pedido-actions-row .btn-icon-urgent:hover {
  background-color: #f8fafc;
}

.sim-pedido-actions-row .btn-icon-urgent.active-urgent {
  background-color: #fef2f2 !important;
  border-color: #fca5a5 !important;
  color: #ef4444 !important;
}

.sim-pedido-actions-row .btn-icon-gear {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sim-pedido-actions-row .btn-icon-gear:hover {
  background-color: #f1f5f9;
  color: #334155;
}

.badge-urgent-pulse {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 9999px;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
}

.badge-qty {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
}

.sim-order-kpi-box {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem;
  margin: 0.85rem 0;
}

.kpi-mini-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kpi-label {
  font-size: 0.68rem;
  color: #64748b;
  font-weight: 600;
}

.kpi-val {
  font-size: 0.88rem;
  font-weight: 800;
  color: #0f172a;
}

/* ====================================================================
   ESTILOS: RECONCILIAÇÃO DE XML COM IA (TABELA ELEGANTE DE ALTO CONTRASTE)
   ==================================================================== */
.sim-xml-header-clean {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.sim-xml-table-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
}

.sim-xml-table-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 800;
  color: #475569;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid #edf2f7;
}

.sim-xml-table-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sim-xml-table-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 0.75rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.15s ease;
}

.sim-xml-table-row:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.sim-xml-table-row.row-active-match {
  border-color: #a7f3d0;
  background: #f0fdf4;
}

.sim-xml-table-row.row-ignored {
  background: #fafafa;
  opacity: 0.85;
}

.sim-checkbox-round {
  width: 20px;
  height: 20px;
  accent-color: #059669;
  cursor: pointer;
}

.xml-source-tag {
  font-size: 0.65rem;
  font-weight: 800;
  color: #64748b;
  letter-spacing: 0.03em;
}

.xml-source-title {
  font-size: 0.84rem;
  font-weight: 800;
  color: #0f172a;
  font-family: monospace;
}

.xml-target-tag {
  font-size: 0.65rem;
  font-weight: 800;
  color: #059669;
}

.xml-target-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: #1e293b;
}

.text-muted-row {
  color: #94a3b8 !important;
  font-weight: 500 !important;
}

.badge-ai-confidence {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
}

.badge-ai-none {
  font-size: 0.72rem;
  color: #94a3b8;
  font-style: italic;
}

.status-pill-neutral {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.sim-xml-confirm-bar-clean {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  margin-top: 0.65rem;
  flex-wrap: wrap;
}

/* ====================================================================
   ESTILOS: GAVETA DISCRETA & PRÉ-VISUALIZAÇÃO DE DOCUMENTO (A4 & TÉRMICO)
   ==================================================================== */
.sim-report-drawer-trigger-bar {
  margin-top: 1.5rem;
  display: flex;
  justify-content: center;
  width: 100%;
}

.btn-report-drawer-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  width: 100%;
  max-width: 640px;
  padding: 0.9rem 1.4rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 9999px;
  color: #1e293b;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.22s ease;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
}

.btn-report-drawer-toggle:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.btn-report-drawer-toggle.is-open {
  background: #f1f5f9;
  border-color: #64748b;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
}

.drawer-toggle-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 9999px;
  color: #475569;
  font-size: 0.76rem;
}

.sim-report-preview-container {
  margin-top: 1.25rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.preview-mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #edf2f7;
  flex-wrap: wrap;
}

.preview-kicker {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #2563eb;
  text-transform: uppercase;
}

.preview-format-tabs {
  display: flex;
  gap: 0.5rem;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 9999px;
}

.preview-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 700;
  background: transparent;
  color: #64748b;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-tab-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

/* FOLHA A4 (PDF EXECUTIVO) */
.a4-document-sheet {
  max-width: 820px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  font-family: inherit;
}

.a4-brand-topbar {
  height: 6px;
  width: 100%;
  transition: background 0.2s ease;
}

.a4-sheet-content {
  padding: 1.75rem 2rem;
}

.a4-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 2px solid #0f172a;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.a4-pharmacy-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  transition: color 0.2s ease;
}

.a4-pharmacy-meta {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: #64748b;
  font-weight: 500;
}

.a4-report-badge {
  display: inline-block;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.a4-report-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  margin-top: 2px;
}

.a4-report-date {
  font-size: 0.72rem;
  color: #64748b;
}

.a4-kpis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 680px) {
  .a4-kpis-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.a4-kpi-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.a4-kpi-highlight {
  background: #fffbeb;
  border-color: #fde68a;
}

.a4-kpi-sub {
  font-size: 0.68rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
}

.a4-kpi-num {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}

.a4-data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  margin-bottom: 1.5rem;
}

.a4-data-table th {
  background: #f1f5f9;
  color: #334155;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  padding: 0.65rem 0.5rem;
  border-bottom: 1px solid #cbd5e1;
  text-align: left;
}

.a4-data-table td {
  padding: 0.7rem 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  color: #1e293b;
  vertical-align: middle;
}

.a4-code {
  font-family: monospace;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.72rem;
}

.a4-status-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
}

.status-chegou { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.status-feito { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
.status-entregue { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

.a4-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px dashed #cbd5e1;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* BOBINA TÉRMICA 80MM (CUPOM DE BALCÃO) */
.receipt-thermal-wrapper {
  display: flex;
  justify-content: center;
  padding: 1rem;
  background: #f1f5f9;
  border-radius: 14px;
}

.receipt-thermal-paper {
  width: 320px;
  background: #ffffff;
  padding: 1.5rem 1.25rem;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.76rem;
  color: #1e293b;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.1);
  border: 1px dashed #94a3b8;
  line-height: 1.4;
}

.receipt-header {
  text-align: center;
}

.receipt-title {
  margin: 0;
  font-size: 1rem;
  font-weight: bold;
}

.receipt-meta {
  font-size: 0.72rem;
  color: #475569;
}

.receipt-divider {
  text-align: center;
  color: #64748b;
  margin: 6px 0;
  overflow: hidden;
  white-space: nowrap;
}

.receipt-highlight {
  display: block;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  margin: 3px 0;
}

.receipt-customer,
.receipt-items,
.receipt-totals {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.receipt-barcode {
  text-align: center;
  font-size: 1.25rem;
  font-weight: bold;
  letter-spacing: 3px;
  margin: 6px 0;
  font-family: monospace;
}

.receipt-footer {
  text-align: center;
  font-size: 0.68rem;
  color: #64748b;
  margin-top: 6px;
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
