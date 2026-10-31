<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useComprasStore } from '../stores/compras';
import type { VisualOpcoesTenant } from '../types';
import {
  Palette,
  MessageSquare,
  Users,
  ShieldCheck,
  CheckCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Printer,
  UserCheck,
  Bot,
  Send,
  Loader2,
  Package,
  DollarSign,
  Lock,
  Upload,
  RotateCcw,
  Sparkles,
  Eye,
  Clock,
  Layout,
  Type,
  Image as ImageIcon,
  Unlink,
  Server,
  ChevronDown,
  ChevronUp,
  Cookie as CookieIcon,
  Settings2,
  LayoutDashboard,
  PackageOpen,
  ClipboardList,
  Check,
} from 'lucide-vue-next';
import {
  consultarStatusWhatsAppProxy,
  obterQrCodeWhatsAppProxy,
  desconectarWhatsAppProxy,
  consultarCredenciaisWhatsappStatus,
  salvarCredenciaisWhatsappProxy,
  enviarModeloWhatsAppProxy,
  renderizarModeloWhatsApp,
  MODELOS_PADRAO_WHATSAPP,
  type TipoModeloWhatsApp,
} from '../services/evolutionApi';

const authStore = useAuthStore();
const comprasStore = useComprasStore();

const activeConfigTab = ref<'visual' | 'whatsapp' | 'cupom' | 'classificacoes' | 'funcionarios' | 'usuarios' | 'retencao'>('visual');
const salvando = ref(false);
const feedbackMensagem = ref<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

function exibirFeedback(tipo: 'sucesso' | 'erro', texto: string) {
  feedbackMensagem.value = { tipo, texto };
  setTimeout(() => {
    if (feedbackMensagem.value?.texto === texto) {
      feedbackMensagem.value = null;
    }
  }, 4500);
}

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

// ============================================================================
// 1. IDENTIDADE VISUAL COMPLETA (Cores, Logo, Sidebar, Bordas, Densidade, Fonte)
// ============================================================================
const formNomeSistema = ref(authStore.currentConfig.nome_sistema || 'EncoMed');
const formSloganSistema = ref(authStore.currentConfig.slogan_sistema || 'Encomendas & Estoque');
const formSaudacaoPainel = ref(authStore.currentConfig.saudacao_painel || 'Bem-vindo');
const formLogoUrl = ref(authStore.currentConfig.logo_url || '/encomed-logo.png');
const formCorPrimaria = ref(authStore.currentConfig.cor_primaria || '#2563eb');
const formCorSecundaria = ref(authStore.currentConfig.cor_secundaria || '#1e40af');

const opcoesIniciais = authStore.currentConfig.visual_opcoes || {};
const formCorDestaque = ref(opcoesIniciais.cor_destaque || '#0ea5e9');
const formEstiloSidebar = ref<'claro' | 'escuro' | 'marca'>(opcoesIniciais.estilo_sidebar || 'claro');
const formFormatoLogo = ref<'retangular' | 'quadrado' | 'circular'>(opcoesIniciais.formato_logo || 'retangular');
const formEstiloBordas = ref<'padrao' | 'arredondado' | 'compacto'>(opcoesIniciais.estilo_bordas || 'padrao');
const formDensidade = ref<'confortavel' | 'compacto' | 'amplo'>(opcoesIniciais.densidade_interface || 'confortavel');
const formFonte = ref<'jakarta' | 'inter' | 'system'>(opcoesIniciais.fonte_interface || 'jakarta');
const formExibirSeloEncomed = ref(opcoesIniciais.exibir_selo_encomed !== false);
const formAnimacoesAtivas = ref(opcoesIniciais.animacoes_ativas !== false);

const logoInputFile = ref<HTMLInputElement | null>(null);

interface TemaPreset {
  id: string;
  nome: string;
  descricao: string;
  primaria: string;
  secundaria: string;
  destaque: string;
  sidebar: 'claro' | 'escuro' | 'marca';
}

const temasPresets: TemaPreset[] = [
  {
    id: 'encomed-oficial',
    nome: 'EncoMed Oficial',
    descricao: 'Azul Cobalto clínico e fundo limpo',
    primaria: '#2563eb',
    secundaria: '#1e40af',
    destaque: '#0ea5e9',
    sidebar: 'claro',
  },
  {
    id: 'clinica-esmeralda',
    nome: 'Clínica Esmeralda',
    descricao: 'Verde farmacêutico acolhedor',
    primaria: '#059669',
    secundaria: '#065f46',
    destaque: '#10b981',
    sidebar: 'claro',
  },
  {
    id: 'saude-ciano',
    nome: 'Saúde Ciano Dark',
    descricao: 'Ciano hospitalar com menu noturno',
    primaria: '#0284c7',
    secundaria: '#0c4a6e',
    destaque: '#06b6d4',
    sidebar: 'escuro',
  },
  {
    id: 'drogaria-rubi',
    nome: 'Drogaria Rubi',
    descricao: 'Vermelho tradicional de varejo farma',
    primaria: '#dc2626',
    secundaria: '#991b1b',
    destaque: '#f97316',
    sidebar: 'claro',
  },
  {
    id: 'formulas-violeta',
    nome: 'Fórmulas & Manipulação',
    descricao: 'Violeta moderno para magistral',
    primaria: '#7c3aed',
    secundaria: '#4c1d95',
    destaque: '#a855f7',
    sidebar: 'escuro',
  },
  {
    id: 'noite-marca',
    nome: 'Institucional Marca',
    descricao: 'Menu tingido na cor da rede',
    primaria: '#1d4ed8',
    secundaria: '#1e3a8a',
    destaque: '#38bdf8',
    sidebar: 'marca',
  },
];

function aplicarPresetVisual(preset: TemaPreset) {
  formCorPrimaria.value = preset.primaria;
  formCorSecundaria.value = preset.secundaria;
  formCorDestaque.value = preset.destaque;
  formEstiloSidebar.value = preset.sidebar;
  aplicarPreviewTempoReal();
}

function montarVisualOpcoesForm(): VisualOpcoesTenant {
  return {
    estilo_sidebar: formEstiloSidebar.value,
    formato_logo: formFormatoLogo.value,
    estilo_bordas: formEstiloBordas.value,
    densidade_interface: formDensidade.value,
    fonte_interface: formFonte.value,
    cor_destaque: formCorDestaque.value,
    exibir_selo_encomed: formExibirSeloEncomed.value,
    animacoes_ativas: formAnimacoesAtivas.value,
  };
}

function aplicarPreviewTempoReal() {
  authStore.applyTheme({
    ...authStore.currentConfig,
    nome_sistema: formNomeSistema.value,
    slogan_sistema: formSloganSistema.value,
    saudacao_painel: formSaudacaoPainel.value,
    logo_url: formLogoUrl.value,
    cor_primaria: formCorPrimaria.value,
    cor_secundaria: formCorSecundaria.value,
    visual_opcoes: montarVisualOpcoesForm(),
  });
}

onUnmounted(() => {
  // Se o usuário sair de Configurações sem salvar ou descartar, restaura o tema real persistido
  authStore.applyTheme();
});

function restaurarPadraoEncomed() {
  formNomeSistema.value = 'EncoMed';
  formSloganSistema.value = 'Encomendas & Estoque';
  formSaudacaoPainel.value = 'Bem-vindo';
  formLogoUrl.value = '/encomed-logo.png';
  formCorPrimaria.value = '#2563eb';
  formCorSecundaria.value = '#1e40af';
  formCorDestaque.value = '#0ea5e9';
  formEstiloSidebar.value = 'claro';
  formFormatoLogo.value = 'retangular';
  formEstiloBordas.value = 'padrao';
  formDensidade.value = 'confortavel';
  formFonte.value = 'jakarta';
  formExibirSeloEncomed.value = true;
  formAnimacoesAtivas.value = true;
  aplicarPreviewTempoReal();
  exibirFeedback('sucesso', 'Padrão visual EncoMed aplicado na pré-visualização. Clique em Salvar para gravar.');
}

function selecionarArquivoLogo() {
  logoInputFile.value?.click();
}

function processarUploadLogo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    exibirFeedback('erro', 'Selecione um arquivo de imagem válido (PNG, JPG, SVG ou WebP).');
    input.value = '';
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    exibirFeedback('erro', 'A imagem deve ter no máximo 4 MB.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    const img = new Image();
    img.onload = () => {
      // Redimensiona no navegador para manter leve no banco (< 80KB)
      const maxDim = 260;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        formLogoUrl.value = canvas.toDataURL('image/png', 0.9);
      } else {
        formLogoUrl.value = dataUrl;
      }
      exibirFeedback('sucesso', 'Logotipo carregado! Clique em "Salvar Identidade Visual" para persistir.');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

const previewSidebarBg = computed(() => {
  if (formEstiloSidebar.value === 'escuro') return '#0f172a';
  if (formEstiloSidebar.value === 'marca') return formCorSecundaria.value || '#1e3a8a';
  return '#ffffff';
});

const previewSidebarText = computed(() => {
  return formEstiloSidebar.value === 'claro' ? '#0f172a' : '#f8fafc';
});

const previewRadiusPx = computed(() => {
  if (formEstiloBordas.value === 'arredondado') return '18px';
  if (formEstiloBordas.value === 'compacto') return '6px';
  return '12px';
});

const previewNomeEmpresa = computed(() => {
  const nome = authStore.currentTenant?.nome_empresa || formNomeSistema.value || 'EncoMed';
  return nome.replace(/\s+SaaS/gi, '').trim();
});

// ============================================================================
// 2. MENSAGENS WHATSAPP & ROBÔ API (Adequação Completa aos Modelos)
// ============================================================================
const formMsgWhatsapp = ref(authStore.currentConfig.mensagem_whatsapp || MODELOS_PADRAO_WHATSAPP.chegada);
const formMsgWhatsappPedido = ref(
  authStore.currentConfig.mensagem_whatsapp_pedido || MODELOS_PADRAO_WHATSAPP.pedido
);
const formMsgWhatsappCobranca = ref(
  authStore.currentConfig.mensagem_whatsapp_cobranca || MODELOS_PADRAO_WHATSAPP.cobranca
);
const formMsgWhatsappEntregue = ref(
  authStore.currentConfig.mensagem_whatsapp_entregue || MODELOS_PADRAO_WHATSAPP.entregue
);
const formEvolutionAtivo = ref(authStore.currentConfig.evolution_api_ativo !== false);
const formAutoWhatsappPedido = ref(Boolean(authStore.currentConfig.auto_whatsapp_pedido));
const formAutoWhatsappEntregue = ref(Boolean(authStore.currentConfig.auto_whatsapp_entregue));
const formOcultarMedicamentosNotificacao = ref(Boolean(authStore.currentConfig.ocultar_medicamentos_notificacao));

const modeloAtivoFoco = ref<Exclude<TipoModeloWhatsApp, 'personalizado'>>('chegada');
const modeloTesteSelecionado = ref<Exclude<TipoModeloWhatsApp, 'personalizado'>>('chegada');

const testandoConexao = ref(false);
const testeResultado = ref<{ sucesso: boolean; mensagem: string; textoEnviado?: string } | null>(null);
const numeroTeste = ref('');
const qrcodeBase64 = ref<string | null>(null);
const statusInstancia = ref<'connecting' | 'open' | 'close' | 'desconhecido'>('connecting');
const mensagemStatusProxy = ref<string>('');
const carregandoQr = ref(false);

// Isolamento Multi-Tenant de WhatsApp por Drogaria / Empresa
const instanciaExclusivaWhatsApp = ref<string>('');
const numeroConectadoWhatsApp = ref<string | null>(null);
const perfilConectadoWhatsApp = ref<string | null>(null);
const servidorDedicadoAtivo = ref<boolean>(false);
const desconectandoWhatsApp = ref<boolean>(false);
const showConfigAvancadaWhatsapp = ref<boolean>(false);

const formWhatsappApiUrl = ref('');
// A chave NUNCA é lida de volta do servidor: o campo só envia valor novo (vazio = manter a atual)
const formWhatsappApiKey = ref('');
const whatsappChaveConfigurada = ref(false);
const formWhatsappInstanceName = ref(authStore.currentConfig.whatsapp_instance_name || '');

async function carregarCredenciaisWhatsapp() {
  if (!authStore.isAdmin) return;
  const status = await consultarCredenciaisWhatsappStatus(authStore.activeTenantId);
  if (status) {
    formWhatsappApiUrl.value = status.apiUrl;
    whatsappChaveConfigurada.value = status.chaveConfigurada;
    formWhatsappApiKey.value = '';
  }
}

const variaveisDisponiveis = [
  { tag: '{cliente}', desc: 'Primeiro nome' },
  { tag: '{nome_completo}', desc: 'Nome completo' },
  { tag: '{medicamento}', desc: 'Itens do pedido' },
  { tag: '{saldo}', desc: 'Saldo a pagar' },
  { tag: '{total}', desc: 'Valor total' },
  { tag: '{pago}', desc: 'Valor pago' },
  { tag: '{codigo}', desc: 'Cód. rastreio' },
  { tag: '{loja}', desc: 'Nome da farmácia' },
  { tag: '{data}', desc: 'Data atual' },
];

function inserirVariavelNoModelo(tag: string) {
  if (modeloAtivoFoco.value === 'chegada') {
    formMsgWhatsapp.value = `${formMsgWhatsapp.value.trim()} ${tag}`;
  } else if (modeloAtivoFoco.value === 'pedido') {
    formMsgWhatsappPedido.value = `${formMsgWhatsappPedido.value.trim()} ${tag}`;
  } else if (modeloAtivoFoco.value === 'cobranca') {
    formMsgWhatsappCobranca.value = `${formMsgWhatsappCobranca.value.trim()} ${tag}`;
  } else if (modeloAtivoFoco.value === 'entregue') {
    formMsgWhatsappEntregue.value = `${formMsgWhatsappEntregue.value.trim()} ${tag}`;
  }
}

function restaurarModelosWhatsappPadrao() {
  formMsgWhatsapp.value = MODELOS_PADRAO_WHATSAPP.chegada;
  formMsgWhatsappPedido.value = MODELOS_PADRAO_WHATSAPP.pedido;
  formMsgWhatsappCobranca.value = MODELOS_PADRAO_WHATSAPP.cobranca;
  formMsgWhatsappEntregue.value = MODELOS_PADRAO_WHATSAPP.entregue;
  exibirFeedback('sucesso', 'Modelos padrão restaurados nos campos! Clique em Salvar para confirmar.');
}

function obterTemplateFormPorModelo(mod: Exclude<TipoModeloWhatsApp, 'personalizado'>): string {
  if (mod === 'chegada') return formMsgWhatsapp.value;
  if (mod === 'pedido') return formMsgWhatsappPedido.value;
  if (mod === 'cobranca') return formMsgWhatsappCobranca.value;
  return formMsgWhatsappEntregue.value;
}

const previewMensagemWhatsapp = computed(() => {
  const tpl = obterTemplateFormPorModelo(modeloAtivoFoco.value);
  return renderizarModeloWhatsApp(
    modeloAtivoFoco.value,
    {
      nome_sistema: formNomeSistema.value,
      header_title: formHeaderTitle.value,
      ocultar_medicamentos_notificacao: formOcultarMedicamentosNotificacao.value,
    },
    {
      cliente: 'Maria Aparecida',
      nomeCompleto: 'Maria Aparecida da Silva',
      medicamento: '1x OZEMPIC 1MG CANETA',
      saldo: 85.5,
      valorTotal: 985.5,
      valorPago: 900.0,
      codigoRastreio: 'ENC-2026-412',
      loja: formHeaderTitle.value || formNomeSistema.value || 'Drogaria',
    },
    tpl
  );
});

async function carregarQrCode() {
  carregandoQr.value = true;
  mensagemStatusProxy.value = '';
  try {
    const stateRes = await consultarStatusWhatsAppProxy(authStore.activeTenantId);
    instanciaExclusivaWhatsApp.value = stateRes.instancia || '';
    numeroConectadoWhatsApp.value = stateRes.numeroConectado || null;
    perfilConectadoWhatsApp.value = stateRes.perfilConectado || null;
    servidorDedicadoAtivo.value = Boolean(stateRes.servidorDedicado);

    if (stateRes.conectado || stateRes.estado === 'open') {
      statusInstancia.value = 'open';
      qrcodeBase64.value = null;
      return;
    }

    statusInstancia.value = (stateRes.estado as any) || 'close';
    if (!stateRes.sucesso && stateRes.mensagem) {
      mensagemStatusProxy.value = stateRes.mensagem;
    }

    const qrRes = await obterQrCodeWhatsAppProxy(authStore.activeTenantId);
    instanciaExclusivaWhatsApp.value = qrRes.instancia || instanciaExclusivaWhatsApp.value;
    if (qrRes.conectado) {
      statusInstancia.value = 'open';
      qrcodeBase64.value = null;
    } else if (qrRes.base64) {
      qrcodeBase64.value = qrRes.base64;
    } else if (qrRes.mensagem) {
      mensagemStatusProxy.value = qrRes.mensagem;
    }
  } catch {
    mensagemStatusProxy.value = 'Não foi possível consultar o serviço de WhatsApp no momento.';
  } finally {
    carregandoQr.value = false;
  }
}

async function desconectarContaWhatsApp() {
  const nomeLoja = authStore.currentConfig.header_title || authStore.currentTenant.nome_empresa || 'esta farmácia';
  if (
    !confirm(
      `Deseja realmente desconectar a conta de WhatsApp vinculada à "${nomeLoja}"?\n\nEsta operação desconecta apenas a conta desta drogaria, mantendo as demais empresas 100% isoladas.`
    )
  ) {
    return;
  }

  desconectandoWhatsApp.value = true;
  try {
    const res = await desconectarWhatsAppProxy(authStore.activeTenantId);
    if (res.sucesso) {
      statusInstancia.value = 'close';
      numeroConectadoWhatsApp.value = null;
      perfilConectadoWhatsApp.value = null;
      qrcodeBase64.value = null;
      exibirFeedback('sucesso', res.mensagem || 'WhatsApp desconectado com sucesso.');
      await carregarQrCode();
    } else {
      exibirFeedback('erro', res.mensagem || 'Falha ao desconectar conta de WhatsApp.');
    }
  } finally {
    desconectandoWhatsApp.value = false;
  }
}

// ============================================================================
// 3. DEMAIS ABAS (CUPOM 80MM, FUNCIONÁRIOS, CLASSIFICAÇÕES, POLÍTICAS)
// ============================================================================
const formHeaderTitle = ref(authStore.currentConfig.header_title || 'DROGARIA');
const formHeaderSubtitle = ref(authStore.currentConfig.header_subtitle || 'Sistema de Encomendas');
const formFooterText = ref(authStore.currentConfig.footer_text || 'Obrigado pela preferencia!');
const formShowPhone = ref(authStore.currentConfig.show_phone !== false);
const formShowPayment = ref(authStore.currentConfig.show_payment !== false);
const formShowStatus = ref(authStore.currentConfig.show_status !== false);
const formFontSize = ref(authStore.currentConfig.font_size || 14);

const novoFuncionarioNome = ref('');
const novoFuncionarioCargo = ref('');
const novaClassificacaoNome = ref('');

const formBloquearEntregaComSaldo = ref(authStore.currentConfig.bloquear_entrega_com_saldo);
const formDiasRetencao = ref(authStore.currentConfig.dias_retencao_arquivamento);

watch(
  () => [authStore.activeTenantId, authStore.currentConfig] as const,
  ([, cfg]) => {
    formNomeSistema.value = cfg.nome_sistema || 'EncoMed';
    formSloganSistema.value = cfg.slogan_sistema || 'Encomendas & Estoque';
    formSaudacaoPainel.value = cfg.saudacao_painel || 'Bem-vindo';
    formLogoUrl.value = cfg.logo_url || '/encomed-logo.png';
    formCorPrimaria.value = cfg.cor_primaria || '#2563eb';
    formCorSecundaria.value = cfg.cor_secundaria || '#1e40af';

    const vo = cfg.visual_opcoes || {};
    formCorDestaque.value = vo.cor_destaque || '#0ea5e9';
    formEstiloSidebar.value = vo.estilo_sidebar || 'claro';
    formFormatoLogo.value = vo.formato_logo || 'retangular';
    formEstiloBordas.value = vo.estilo_bordas || 'padrao';
    formDensidade.value = vo.densidade_interface || 'confortavel';
    formFonte.value = vo.fonte_interface || 'jakarta';
    formExibirSeloEncomed.value = vo.exibir_selo_encomed !== false;
    formAnimacoesAtivas.value = vo.animacoes_ativas !== false;

    formMsgWhatsapp.value = cfg.mensagem_whatsapp || MODELOS_PADRAO_WHATSAPP.chegada;
    formMsgWhatsappPedido.value = cfg.mensagem_whatsapp_pedido || MODELOS_PADRAO_WHATSAPP.pedido;
    formMsgWhatsappCobranca.value = cfg.mensagem_whatsapp_cobranca || MODELOS_PADRAO_WHATSAPP.cobranca;
    formMsgWhatsappEntregue.value = cfg.mensagem_whatsapp_entregue || MODELOS_PADRAO_WHATSAPP.entregue;
    formAutoWhatsappPedido.value = Boolean(cfg.auto_whatsapp_pedido);
    formAutoWhatsappEntregue.value = Boolean(cfg.auto_whatsapp_entregue);

    formHeaderTitle.value = cfg.header_title || 'DROGARIA';
    formHeaderSubtitle.value = cfg.header_subtitle || 'Sistema de Encomendas';
    formFooterText.value = cfg.footer_text || 'Obrigado pela preferencia!';
    formShowPhone.value = cfg.show_phone !== false;
    formShowPayment.value = cfg.show_payment !== false;
    formShowStatus.value = cfg.show_status !== false;
    formFontSize.value = cfg.font_size || 14;
    formBloquearEntregaComSaldo.value = cfg.bloquear_entrega_com_saldo;
    formDiasRetencao.value = cfg.dias_retencao_arquivamento;
    formOcultarMedicamentosNotificacao.value = Boolean(cfg.ocultar_medicamentos_notificacao);
    formEvolutionAtivo.value = cfg.evolution_api_ativo !== false;
    formWhatsappInstanceName.value = cfg.whatsapp_instance_name || '';
  }
);

async function salvarIdentidadeVisual() {
  if (!formNomeSistema.value.trim()) {
    exibirFeedback('erro', 'Informe um nome válido para exibição do sistema.');
    return;
  }
  salvando.value = true;
  const res = await authStore.salvarConfigTenant({
    nome_sistema: formNomeSistema.value.trim(),
    slogan_sistema: formSloganSistema.value.trim() || 'Encomendas & Estoque',
    saudacao_painel: formSaudacaoPainel.value.trim() || 'Bem-vindo',
    logo_url: formLogoUrl.value.trim() || '/encomed-logo.png',
    cor_primaria: formCorPrimaria.value,
    cor_secundaria: formCorSecundaria.value,
    visual_opcoes: montarVisualOpcoesForm(),
  });
  salvando.value = false;
  exibirFeedback(
    res.sucesso ? 'sucesso' : 'erro',
    res.sucesso ? 'Identidade visual completa salva e aplicada em toda a loja!' : res.mensagem || 'Erro ao salvar.'
  );
}

async function salvarWhatsapp() {
  salvando.value = true;
  const res = await authStore.salvarConfigTenant({
    mensagem_whatsapp: formMsgWhatsapp.value,
    mensagem_whatsapp_pedido: formMsgWhatsappPedido.value,
    mensagem_whatsapp_cobranca: formMsgWhatsappCobranca.value,
    mensagem_whatsapp_entregue: formMsgWhatsappEntregue.value,
    auto_whatsapp_pedido: formAutoWhatsappPedido.value,
    auto_whatsapp_entregue: formAutoWhatsappEntregue.value,
    ocultar_medicamentos_notificacao: formOcultarMedicamentosNotificacao.value,
    evolution_api_ativo: formEvolutionAtivo.value,
    whatsapp_instance_name: formWhatsappInstanceName.value.trim() || undefined,
  });

  // Credenciais de servidor próprio seguem por RPC blindada (somente Admin; nunca ficam legíveis no navegador)
  let credenciaisOk = true;
  let credenciaisMsg = '';
  if (res.sucesso && authStore.isAdmin && showConfigAvancadaWhatsapp.value) {
    const novaChave = formWhatsappApiKey.value.trim();
    const credRes = await salvarCredenciaisWhatsappProxy(
      authStore.activeTenantId,
      formWhatsappApiUrl.value.trim(),
      novaChave ? novaChave : undefined
    );
    credenciaisOk = credRes.sucesso;
    credenciaisMsg = credRes.mensagem;
    if (credRes.sucesso) {
      formWhatsappApiKey.value = '';
      await carregarCredenciaisWhatsapp();
    }
  }
  salvando.value = false;

  if (res.sucesso && !credenciaisOk) {
    exibirFeedback('erro', credenciaisMsg || 'Modelos salvos, mas as credenciais do servidor próprio foram rejeitadas.');
    return;
  }
  exibirFeedback(
    res.sucesso ? 'sucesso' : 'erro',
    res.sucesso ? 'Modelos de mensagem e automações da API salvos com sucesso!' : res.mensagem || 'Erro ao salvar.'
  );
  if (res.sucesso) {
    carregarQrCode();
  }
}

async function testarEvolutionApi() {
  if (!numeroTeste.value.trim()) {
    exibirFeedback('erro', 'Informe um número de telefone com DDD para receber o teste (ex: 11999998888).');
    return;
  }
  testandoConexao.value = true;
  testeResultado.value = null;

  try {
    const templateEscolhido = obterTemplateFormPorModelo(modeloTesteSelecionado.value);
    const res = await enviarModeloWhatsAppProxy({
      ativo: true,
      numeroDestino: numeroTeste.value,
      modelo: modeloTesteSelecionado.value,
      templateCustomizado: templateEscolhido,
      ocultarMedicamentosOverride: formOcultarMedicamentosNotificacao.value,
      variaveis: {
        cliente: 'Cliente Teste',
        nomeCompleto: 'Cliente Teste EncoMed',
        medicamento: '1x DIPIRONA MONOIDRATADA 1G',
        saldo: 24.9,
        valorTotal: 54.9,
        valorPago: 30.0,
        codigoRastreio: 'ENC-TESTE-01',
        loja: formHeaderTitle.value || formNomeSistema.value || 'Farmácia',
      },
    });
    testeResultado.value = res;
  } catch {
    testeResultado.value = {
      sucesso: false,
      mensagem: 'Não foi possível concluir o teste de envio no momento.',
    };
  } finally {
    testandoConexao.value = false;
  }
}

async function salvarModeloCupom() {
  const tamanhoSeguro = Math.min(20, Math.max(10, Number(formFontSize.value) || 14));
  formFontSize.value = tamanhoSeguro;
  salvando.value = true;
  const res = await authStore.salvarConfigTenant({
    header_title: formHeaderTitle.value.trim() || 'DROGARIA',
    header_subtitle: formHeaderSubtitle.value.trim(),
    footer_text: formFooterText.value.trim(),
    show_phone: formShowPhone.value,
    show_payment: formShowPayment.value,
    show_status: formShowStatus.value,
    font_size: tamanhoSeguro,
  });
  salvando.value = false;
  exibirFeedback(
    res.sucesso ? 'sucesso' : 'erro',
    res.sucesso ? 'Modelo de impressão térmica (80mm) salvo com sucesso!' : res.mensagem || 'Erro ao salvar.'
  );
}

async function adicionarFuncionario() {
  if (!novoFuncionarioNome.value.trim()) {
    exibirFeedback('erro', 'O nome do funcionário é obrigatório.');
    return;
  }
  const criado = await authStore.adicionarFuncionario(novoFuncionarioNome.value, novoFuncionarioCargo.value);
  if (!criado) {
    exibirFeedback('erro', authStore.erroOperacao || 'Não foi possível cadastrar o funcionário.');
    return;
  }
  novoFuncionarioNome.value = '';
  novoFuncionarioCargo.value = '';
  exibirFeedback('sucesso', 'Funcionário cadastrado com sucesso.');
}

async function removerFuncionario(id: string, nome: string) {
  if (confirm(`Deseja realmente remover o funcionário "${nome}"?`)) {
    authStore.erroOperacao = null;
    await authStore.removerFuncionario(id);
    if (authStore.erroOperacao) {
      exibirFeedback('erro', authStore.erroOperacao);
      return;
    }
    exibirFeedback('sucesso', 'Funcionário removido.');
  }
}

async function salvarPoliticas() {
  const diasSeguros = Math.min(3650, Math.max(7, Number(formDiasRetencao.value) || 90));
  formDiasRetencao.value = diasSeguros;
  salvando.value = true;
  const res = await authStore.salvarConfigTenant({
    bloquear_entrega_com_saldo: formBloquearEntregaComSaldo.value,
    dias_retencao_arquivamento: diasSeguros,
  });
  salvando.value = false;
  exibirFeedback(
    res.sucesso ? 'sucesso' : 'erro',
    res.sucesso ? 'Políticas de retenção e governança atualizadas!' : res.mensagem || 'Erro ao salvar.'
  );
}

function abrirGerenciadorCookiesModal() {
  if (typeof window !== 'undefined' && typeof (window as any).abrirGerenciadorCookies === 'function') {
    (window as any).abrirGerenciadorCookies();
  }
}

async function adicionarClassificacao() {
  if (!novaClassificacaoNome.value.trim()) return;
  const res = await comprasStore.adicionarClassificacao(novaClassificacaoNome.value);
  if (res) {
    novaClassificacaoNome.value = '';
    exibirFeedback('sucesso', 'Classificação adicionada com sucesso.');
  } else {
    exibirFeedback('erro', comprasStore.erroOperacao || 'Não foi possível cadastrar a classificação.');
  }
}

async function removerClassificacao(id: string) {
  const ok = await comprasStore.removerClassificacao(id);
  if (ok) {
    exibirFeedback('sucesso', 'Classificação removida.');
  } else {
    exibirFeedback('erro', comprasStore.erroOperacao || 'Falha ao remover classificação.');
  }
}
</script>

<template>
  <div class="configuracoes-page" style="max-width: 1240px; padding-bottom: 3rem;">
    <div style="margin-bottom: 1.5rem;">
      <h2 style="font-size: 1.55rem; font-weight: 800; font-family: var(--font-heading);">Configurações da Loja</h2>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        Estúdio de identidade visual White-Label, modelos inteligentes da API WhatsApp, bobina térmica e governança LGPD
      </p>
    </div>

    <!-- Banner de Feedback -->
    <div
      v-if="feedbackMensagem"
      :style="{
        marginBottom: '1.25rem',
        padding: '0.75rem 1.15rem',
        borderRadius: '9999px',
        fontSize: '0.86rem',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: feedbackMensagem.tipo === 'sucesso' ? '#ecfdf5' : '#fef2f2',
        color: feedbackMensagem.tipo === 'sucesso' ? '#065f46' : '#991b1b',
        border: `1px solid ${feedbackMensagem.tipo === 'sucesso' ? '#a7f3d0' : '#fecaca'}`,
      }"
    >
      <span>{{ feedbackMensagem.tipo === 'sucesso' ? '✅' : '⚠️' }}</span>
      <span>{{ feedbackMensagem.texto }}</span>
    </div>

    <!-- Configuration Tabs -->
    <div class="sub-tabs-container" style="margin-bottom: 1.5rem; flex-wrap: wrap;">
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
        <span>Mensagens WhatsApp & API</span>
      </button>

      <button
        v-if="authStore.isAdmin"
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
        v-if="authStore.isAdmin"
        @click="activeConfigTab = 'retencao'"
        class="sub-tab-btn"
        :class="{ active: activeConfigTab === 'retencao' }"
        style="display: inline-flex; align-items: center; gap: 6px;"
      >
        <ShieldCheck :size="16" />
        <span>Privacidade & Alçadas</span>
      </button>
    </div>

    <!-- ================================================================== -->
    <!-- TAB 1: ESTÚDIO COMPLETO DE IDENTIDADE VISUAL                       -->
    <!-- ================================================================== -->
    <div v-if="activeConfigTab === 'visual'" class="visual-studio-grid">
      <!-- Coluna Esquerda: Controles Completos -->
      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        <!-- Bloco 1: Temas Rápidos Curados -->
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <Sparkles :size="18" style="color: var(--color-primary);" />
              <h3 style="font-size: 1.05rem; margin: 0;">Paletas Rápidas Prontas</h3>
            </div>
            <button
              type="button"
              @click="restaurarPadraoEncomed"
              class="btn-outline-neutral"
              style="padding: 0.3rem 0.85rem; font-size: 0.78rem;"
            >
              <RotateCcw :size="13" />
              <span>Restaurar Padrão EncoMed</span>
            </button>
          </div>

          <div class="presets-grid">
            <button
              v-for="preset in temasPresets"
              :key="preset.id"
              type="button"
              @click="aplicarPresetVisual(preset)"
              class="preset-card-btn"
              :class="{ active: formCorPrimaria.toLowerCase() === preset.primaria.toLowerCase() && formEstiloSidebar === preset.sidebar }"
            >
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px;">
                <span :style="{ background: preset.primaria }" class="color-dot"></span>
                <span :style="{ background: preset.secundaria }" class="color-dot"></span>
                <span :style="{ background: preset.destaque }" class="color-dot"></span>
                <strong style="font-size: 0.82rem; color: #0f172a;">{{ preset.nome }}</strong>
              </div>
              <span style="font-size: 0.73rem; color: #64748b; text-align: left;">{{ preset.descricao }}</span>
            </button>
          </div>
        </div>

        <!-- Bloco 2: Marca, Nome, Slogan e Logotipo -->
        <div class="card">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <ImageIcon :size="18" style="color: var(--color-primary);" />
            <h3 style="font-size: 1.05rem; margin: 0;">Marca, Textos & Logotipo</h3>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Nome de Exibição do Sistema *</label>
              <input
                v-model="formNomeSistema"
                @input="aplicarPreviewTempoReal"
                type="text"
                class="form-input"
                id="input-config-nome-sistema"
                placeholder="Ex: Minha Drogaria / EncoMed"
              />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Slogan / Subtítulo do Menu</label>
              <input
                v-model="formSloganSistema"
                @input="aplicarPreviewTempoReal"
                type="text"
                class="form-input"
                placeholder="Ex: Encomendas & Estoque"
              />
            </div>
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Saudação Principal do Dashboard</label>
            <input
              v-model="formSaudacaoPainel"
              type="text"
              class="form-input"
              placeholder="Ex: Bem-vindo à Central de Encomendas"
            />
          </div>

          <!-- Logotipo Upload & URL -->
          <div style="margin-top: 1rem; padding: 1rem; border-radius: 12px; background: #f8fafc; border: 1px solid var(--border-card);">
            <label class="form-label" style="margin-bottom: 0.6rem;">Logotipo da Unidade / Drogaria</label>

            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
              <div
                style="width: 72px; height: 72px; background: #ffffff; border: 1px solid var(--border-card); display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 6px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);"
                :style="{
                  borderRadius: formFormatoLogo === 'circular' ? '9999px' : formFormatoLogo === 'quadrado' ? '14px' : '10px',
                }"
              >
                <img
                  :src="formLogoUrl || '/encomed-logo.png'"
                  alt="Logo Preview"
                  style="max-width: 100%; max-height: 100%; object-fit: contain;"
                />
              </div>

              <div style="flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.5rem;">
                <input
                  ref="logoInputFile"
                  type="file"
                  accept="image/*"
                  style="display: none;"
                  @change="processarUploadLogo"
                />
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                  <button type="button" @click="selecionarArquivoLogo" class="btn-outline-neutral" style="padding: 0.35rem 0.9rem; font-size: 0.8rem;">
                    <Upload :size="14" />
                    <span>Enviar Imagem</span>
                  </button>
                  <button
                    type="button"
                    @click="formLogoUrl = '/encomed-logo.png'"
                    class="btn-outline-emerald"
                    style="padding: 0.35rem 0.9rem; font-size: 0.8rem;"
                  >
                    <span>Usar Logo EncoMed</span>
                  </button>
                </div>

                <input
                  v-model="formLogoUrl"
                  type="text"
                  class="form-input"
                  style="font-size: 0.8rem; padding: 0.45rem 0.7rem;"
                  placeholder="Ou cole a URL da imagem (ex: /encomed-logo.png)"
                />
              </div>
            </div>

            <!-- Formato da Moldura do Logo -->
            <div style="margin-top: 0.85rem;">
              <span style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 0.4rem;">
                Formato de Exibição da Logo no Menu:
              </span>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button
                  v-for="fmt in ([
                    { val: 'retangular', label: 'Horizontal Ampla' },
                    { val: 'quadrado', label: 'Ícone Quadrado' },
                    { val: 'circular', label: 'Emblema Circular' },
                  ] as const)"
                  :key="fmt.val"
                  type="button"
                  @click="formFormatoLogo = fmt.val"
                  class="option-chip-btn"
                  :class="{ active: formFormatoLogo === fmt.val }"
                >
                  {{ fmt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Bloco 3: Cores Customizadas -->
        <div class="card">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <Palette :size="18" style="color: var(--color-primary);" />
            <h3 style="font-size: 1.05rem; margin: 0;">Cores Personalizadas da Marca</h3>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem;">
            <div>
              <label class="form-label">Cor Primária (Botões & Abas)</label>
              <div class="color-picker-box">
                <div class="color-swatch-trigger" :style="{ backgroundColor: formCorPrimaria }">
                  <input
                    v-model="formCorPrimaria"
                    @input="aplicarPreviewTempoReal"
                    type="color"
                    class="color-native-overlay"
                  />
                </div>
                <input
                  v-model="formCorPrimaria"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input color-hex-field"
                  placeholder="#2563eb"
                />
              </div>
            </div>

            <div>
              <label class="form-label">Cor Secundária (Menu & PDF)</label>
              <div class="color-picker-box">
                <div class="color-swatch-trigger" :style="{ backgroundColor: formCorSecundaria }">
                  <input
                    v-model="formCorSecundaria"
                    @input="aplicarPreviewTempoReal"
                    type="color"
                    class="color-native-overlay"
                  />
                </div>
                <input
                  v-model="formCorSecundaria"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input color-hex-field"
                  placeholder="#1e3a8a"
                />
              </div>
            </div>

            <div>
              <label class="form-label">Cor de Destaque (Detalhes)</label>
              <div class="color-picker-box">
                <div class="color-swatch-trigger" :style="{ backgroundColor: formCorDestaque }">
                  <input
                    v-model="formCorDestaque"
                    @input="aplicarPreviewTempoReal"
                    type="color"
                    class="color-native-overlay"
                  />
                </div>
                <input
                  v-model="formCorDestaque"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input color-hex-field"
                  placeholder="#38bdf8"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Bloco 4: Estilo de Menu, Bordas, Densidade & Tipografia -->
        <div class="card">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <Layout :size="18" style="color: var(--color-primary);" />
            <h3 style="font-size: 1.05rem; margin: 0;">Acabamento, Menu Lateral & Tipografia</h3>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1.1rem;">
            <!-- Estilo da Barra Lateral -->
            <div>
              <label class="form-label">Tema do Menu Lateral (Sidebar)</label>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button
                  v-for="sb in ([
                    { val: 'claro', label: '☀️ Claro Clínico' },
                    { val: 'escuro', label: '🌙 Escuro Noturno' },
                    { val: 'marca', label: '🎨 Cor Secundária da Marca' },
                  ] as const)"
                  :key="sb.val"
                  type="button"
                  @click="formEstiloSidebar = sb.val; aplicarPreviewTempoReal()"
                  class="option-chip-btn"
                  :class="{ active: formEstiloSidebar === sb.val }"
                >
                  {{ sb.label }}
                </button>
              </div>
            </div>

            <!-- Estilo de Bordas -->
            <div>
              <label class="form-label">Arredondamento de Cartões & Campos</label>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button
                  v-for="bd in ([
                    { val: 'padrao', label: 'Padrão Farmácia (12px)' },
                    { val: 'arredondado', label: 'Suave Moderno (18px)' },
                    { val: 'compacto', label: 'Reto Executivo (6px)' },
                  ] as const)"
                  :key="bd.val"
                  type="button"
                  @click="formEstiloBordas = bd.val; aplicarPreviewTempoReal()"
                  class="option-chip-btn"
                  :class="{ active: formEstiloBordas === bd.val }"
                >
                  {{ bd.label }}
                </button>
              </div>
            </div>

            <!-- Densidade e Fonte -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
              <div>
                <label class="form-label">Densidade de Espaçamento</label>
                <select v-model="formDensidade" @change="aplicarPreviewTempoReal" class="form-select">
                  <option value="compacto">Compacta (Mais itens na tela)</option>
                  <option value="confortavel">Confortável (Padrão)</option>
                  <option value="amplo">Ampla (Leitura relaxada)</option>
                </select>
              </div>

              <div>
                <label class="form-label" style="display: flex; align-items: center; gap: 5px;">
                  <Type :size="14" />
                  <span>Tipografia Principal</span>
                </label>
                <select v-model="formFonte" @change="aplicarPreviewTempoReal" class="form-select">
                  <option value="jakarta">Plus Jakarta Sans (Moderna & Elegante)</option>
                  <option value="inter">Inter (Alta Legibilidade Clínica)</option>
                  <option value="system">Fonte Nativa do Sistema (Ultra Rápida)</option>
                </select>
              </div>
            </div>

            <!-- Toggles Extras -->
            <div style="display: flex; flex-direction: column; gap: 0.65rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9;">
              <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.88rem; font-weight: 500;">
                <input
                  type="checkbox"
                  v-model="formExibirSeloEncomed"
                  style="width: 16px; height: 16px; accent-color: var(--color-primary);"
                />
                <span>Exibir assinatura discreta <strong>"EncoMed"</strong> no rodapé do menu</span>
              </label>

              <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.88rem; font-weight: 500;">
                <input
                  type="checkbox"
                  v-model="formAnimacoesAtivas"
                  @change="aplicarPreviewTempoReal"
                  style="width: 16px; height: 16px; accent-color: var(--color-primary);"
                />
                <span>Ativar micro-animações e efeitos suaves ao alternar status e cartões</span>
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
            <button @click="salvarIdentidadeVisual" :disabled="salvando" class="btn-primary-pill" id="btn-salvar-identidade">
              <CheckCircle :size="16" />
              <span>{{ salvando ? 'Salvando...' : 'Salvar Identidade Visual' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Coluna Direita: Pré-Visualização Interativa ao Vivo -->
      <div style="position: sticky; top: 1.25rem; align-self: start;">
        <div class="card" style="padding: 1.25rem; border: 1px solid var(--border-card); box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.95rem; color: var(--text-main);">
              <Eye :size="18" style="color: var(--color-primary);" />
              <span>Pré-visualização em Tempo Real</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: #10b981;"></span>
              <span class="badge badge-chegou" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">Ao Vivo</span>
            </div>
          </div>

          <!-- Browser Mockup Shell -->
          <div
            style="border: 1px solid var(--border-card); overflow: hidden; background: #ffffff; box-shadow: 0 10px 28px -6px rgba(15, 23, 42, 0.08);"
            :style="{ borderRadius: previewRadiusPx }"
          >
            <!-- Browser Header Bar (macOS style window chrome) -->
            <div style="background: #f8fafc; border-bottom: 1px solid var(--border-card); padding: 0.5rem 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <!-- 3 Mac Window Dots -->
              <div style="display: flex; align-items: center; gap: 5px;">
                <span style="width: 9px; height: 9px; border-radius: 9999px; background: #ef4444; display: inline-block;"></span>
                <span style="width: 9px; height: 9px; border-radius: 9999px; background: #f59e0b; display: inline-block;"></span>
                <span style="width: 9px; height: 9px; border-radius: 9999px; background: #10b981; display: inline-block;"></span>
              </div>
              <!-- URL Bar -->
              <div style="background: #ffffff; border: 1px solid var(--border-card); border-radius: 9999px; padding: 2px 10px; font-size: 0.65rem; color: #64748b; display: flex; align-items: center; gap: 5px; max-width: 190px; width: 100%; justify-content: center;">
                <Lock :size="10" style="color: #059669;" />
                <span style="font-family: monospace; font-size: 0.62rem; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">app.encomed.com.br</span>
              </div>
              <div style="font-size: 0.62rem; color: #94a3b8; font-weight: 600;">v2.0</div>
            </div>

            <!-- Mini App Shell Layout (Sidebar + Content) -->
            <div style="display: grid; grid-template-columns: 140px 1fr; min-height: 380px;">
              
              <!-- Mini Sidebar -->
              <div
                :style="{ background: previewSidebarBg, color: previewSidebarText }"
                style="padding: 0.85rem 0.65rem; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid rgba(148, 163, 184, 0.2);"
              >
                <div>
                  <!-- Sidebar Header: Nome da Empresa com destaque elegante, sem logo em cima -->
                  <div style="padding-bottom: 0.75rem; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
                    <div style="font-weight: 800; font-size: 0.82rem; line-height: 1.2; word-break: break-word;">
                      {{ previewNomeEmpresa }}
                    </div>
                    <div style="font-size: 0.6rem; opacity: 0.72; margin-top: 2px; line-height: 1.2;">
                      {{ formSloganSistema || 'Gestão de Encomendas' }}
                    </div>
                  </div>

                  <!-- Nav Items with Icons -->
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <div
                      :style="{
                        background: formEstiloSidebar === 'claro' ? `${formCorPrimaria}15` : 'rgba(255,255,255,0.16)',
                        color: formEstiloSidebar === 'claro' ? formCorPrimaria : '#ffffff',
                        borderLeft: `3px solid ${formCorPrimaria}`,
                      }"
                      style="padding: 5px 7px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; gap: 6px;"
                    >
                      <LayoutDashboard :size="13" />
                      <span>Início</span>
                    </div>

                    <div style="padding: 5px 7px; font-size: 0.68rem; opacity: 0.75; display: flex; align-items: center; gap: 6px;">
                      <Users :size="13" />
                      <span>Clientes</span>
                    </div>

                    <div style="padding: 5px 7px; font-size: 0.68rem; opacity: 0.75; display: flex; align-items: center; justify-content: space-between;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <PackageOpen :size="13" />
                        <span>Encomendas</span>
                      </div>
                      <span
                        :style="{ background: formCorPrimaria, color: '#fff' }"
                        style="font-size: 0.58rem; font-weight: 700; padding: 1px 5px; border-radius: 9999px;"
                      >
                        3
                      </span>
                    </div>

                    <div style="padding: 5px 7px; font-size: 0.68rem; opacity: 0.75; display: flex; align-items: center; gap: 6px;">
                      <ClipboardList :size="13" />
                      <span>Pedidos</span>
                    </div>
                  </div>
                </div>

                <!-- Botão Nova Encomenda & Logo EncoMed abaixo -->
                <div style="display: flex; flex-direction: column; gap: 0.55rem; padding-top: 0.6rem;">
                  <!-- Botão Pílula Nova Encomenda -->
                  <button
                    type="button"
                    :style="{ background: formCorPrimaria }"
                    style="color: #ffffff; border: none; border-radius: 9999px; padding: 5px 8px; font-size: 0.66rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: default; box-shadow: 0 2px 6px -1px rgba(0,0,0,0.15);"
                  >
                    <Plus :size="12" />
                    <span>Nova Encomenda</span>
                  </button>

                  <!-- Logo EncoMed oficial APENAS abaixo do botão -->
                  <div
                    v-if="formExibirSeloEncomed"
                    style="padding-top: 0.45rem; border-top: 1px solid rgba(148, 163, 184, 0.2); display: flex; align-items: center; justify-content: center; gap: 4px;"
                  >
                    <img src="/encomed-icon.svg" alt="EncoMed" style="height: 13px; width: 13px; object-fit: contain;" />
                    <span style="font-size: 0.68rem; font-weight: 800; letter-spacing: -0.01em;">
                      <span :style="{ color: formEstiloSidebar === 'claro' ? '#0f172a' : '#ffffff' }">Enco</span><span :style="{ color: formCorPrimaria }">Med</span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Mini Dashboard Content Area -->
              <div style="background: #f8fafc; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem;">
                
                <!-- Mini Header: Title + Search & User -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 800; font-size: 0.84rem; color: #0f172a; line-height: 1.2;">
                      {{ formSaudacaoPainel || 'Painel de Balcão' }}
                    </div>
                    <div style="font-size: 0.62rem; color: #64748b;">
                      Visão operacional em tempo real
                    </div>
                  </div>

                  <!-- Mini User Profile Pill -->
                  <div style="display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid var(--border-card); border-radius: 9999px; padding: 2px 6px;">
                    <div
                      :style="{ background: `${formCorPrimaria}20`, color: formCorPrimaria }"
                      style="width: 18px; height: 18px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; font-size: 0.62rem; font-weight: 800;"
                    >
                      F
                    </div>
                    <span style="font-size: 0.62rem; font-weight: 600; color: #334155;">Farmacêutico</span>
                  </div>
                </div>

                <!-- Mini KPI Cards Strip -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem;">
                  <div
                    style="background: #ffffff; border: 1px solid var(--border-card); padding: 0.45rem 0.6rem; display: flex; flex-direction: column; gap: 2px;"
                    :style="{ borderRadius: previewRadiusPx }"
                  >
                    <span style="font-size: 0.58rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Ativas Hoje</span>
                    <div style="display: flex; align-items: baseline; gap: 4px;">
                      <span style="font-size: 0.95rem; font-weight: 800;" :style="{ color: formCorPrimaria }">14</span>
                      <span style="font-size: 0.58rem; color: #059669; font-weight: 600;">● 3 urgentes</span>
                    </div>
                  </div>

                  <div
                    style="background: #ffffff; border: 1px solid var(--border-card); padding: 0.45rem 0.6rem; display: flex; flex-direction: column; gap: 2px;"
                    :style="{ borderRadius: previewRadiusPx }"
                  >
                    <span style="font-size: 0.58rem; color: #64748b; font-weight: 600; text-transform: uppercase;">A Receber</span>
                    <div style="display: flex; align-items: baseline; gap: 4px;">
                      <span style="font-size: 0.95rem; font-weight: 800; color: #059669;">R$ 840</span>
                      <span style="font-size: 0.58rem; color: #64748b;">em saldo</span>
                    </div>
                  </div>
                </div>

                <!-- Realistic Order Card (Preview of Balcão) -->
                <div
                  style="background: #ffffff; border: 1px solid var(--border-card); padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.45rem; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);"
                  :style="{ borderRadius: previewRadiusPx }"
                >
                  <!-- Card Header: Category + Client & Price -->
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                    <div>
                      <span
                        :style="{ background: `${formCorDestaque}18`, color: formCorDestaque, border: `1px solid ${formCorDestaque}40` }"
                        style="font-size: 0.58rem; font-weight: 700; padding: 1px 6px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.03em;"
                      >
                        Termolábil / Ético
                      </span>
                      <div style="font-size: 0.66rem; font-weight: 600; color: #475569; margin-top: 3px;">
                        Maria Aparecida Silva • <span style="color: #64748b; font-weight: 500;">(12) 99744-3863</span>
                      </div>
                    </div>

                    <div style="text-align: right;">
                      <div style="font-size: 0.76rem; font-weight: 800;" :style="{ color: formCorPrimaria }">
                        R$ 189,90
                      </div>
                      <span style="font-size: 0.58rem; color: #059669; font-weight: 700;">
                        Sinal R$ 50,00
                      </span>
                    </div>
                  </div>

                  <!-- Medicine Name -->
                  <div style="font-size: 0.74rem; font-weight: 800; color: #0f172a; line-height: 1.25;">
                    OZEMPIC 1MG CANETA INJETÁVEL
                  </div>

                  <!-- Status Workflow Pipeline (Interactive Pills) -->
                  <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                    <span style="font-size: 0.58rem; padding: 2px 7px; border-radius: 9999px; background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; font-weight: 600;">
                      Aguardando
                    </span>
                    <span style="font-size: 0.58rem; padding: 2px 7px; border-radius: 9999px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 700;">
                      Pedido Feito
                    </span>
                    <span style="font-size: 0.58rem; padding: 2px 7px; border-radius: 9999px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">
                      <Check :size="10" /> Chegou
                    </span>
                  </div>
                </div>

                <!-- Footer hint -->
                <div style="font-size: 0.62rem; color: #64748b; line-height: 1.35; padding: 0.4rem 0.55rem; background: #f1f5f9; border-radius: 6px; border-left: 2px solid var(--color-primary);">
                  Os botões semânticos de status (Âmbar, Azul e Esmeralda) operam em tempo real de acordo com as diretrizes do balcão.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- TAB 2: WHATSAPP API & MODELOS DINÂMICOS                            -->
    <!-- ================================================================== -->
    <div v-if="activeConfigTab === 'whatsapp'" class="whatsapp-studio-grid">
      <!-- Coluna Esquerda: Modelos e Robô -->
      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.65rem;">
            <h3 style="font-size: 1.12rem; margin: 0;">Modelos de Mensagens Integrados à API</h3>
            <button
              type="button"
              @click="restaurarModelosWhatsappPadrao"
              class="btn-outline-neutral"
              style="padding: 0.3rem 0.85rem; font-size: 0.76rem;"
            >
              <RotateCcw :size="13" />
              <span>Restaurar Textos Padrão</span>
            </button>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 1rem;">
            A API do WhatsApp carrega automaticamente estes modelos do banco de dados da sua loja e preenche os dados reais do pedido antes de disparar. Clique em uma variável abaixo para inseri-la no modelo selecionado:
          </p>

          <!-- Chips de Variáveis Clicáveis -->
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; padding: 0.75rem; background: #f8fafc; border: 1px solid var(--border-card); border-radius: 12px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #475569; width: 100%; margin-bottom: 2px;">
              Inserir variável no modelo em edição ({{ modeloAtivoFoco.toUpperCase() }}):
            </span>
            <button
              v-for="v in variaveisDisponiveis"
              :key="v.tag"
              type="button"
              @click="inserirVariavelNoModelo(v.tag)"
              class="var-tag-chip"
              :title="`Inserir ${v.tag} (${v.desc})`"
            >
              <code>{{ v.tag }}</code>
              <span>{{ v.desc }}</span>
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1.15rem;">
            <!-- Modelo 1: Chegada -->
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <Package :size="15" style="color: #059669;" />
                <span>1. Aviso de Chegada (Quando o medicamento chega na farmácia)</span>
              </label>
              <textarea
                v-model="formMsgWhatsapp"
                @focus="modeloAtivoFoco = 'chegada'"
                rows="3"
                class="form-textarea"
                id="textarea-whatsapp-template-chegada"
                placeholder="Texto quando o medicamento chega na loja..."
              ></textarea>
            </div>

            <!-- Modelo 2: Pedido Realizado -->
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <Clock :size="15" style="color: #2563eb;" />
                <span>2. Confirmação de Pedido Realizado (Cadastro da encomenda)</span>
              </label>
              <textarea
                v-model="formMsgWhatsappPedido"
                @focus="modeloAtivoFoco = 'pedido'"
                rows="3"
                class="form-textarea"
                id="textarea-whatsapp-template-pedido"
                placeholder="Texto quando uma nova encomenda é cadastrada..."
              ></textarea>
            </div>

            <!-- Modelo 3: Cobrança / Saldo -->
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <DollarSign :size="15" style="color: #d97706;" />
                <span>3. Lembrete de Retirada & Saldo a Acertar</span>
              </label>
              <textarea
                v-model="formMsgWhatsappCobranca"
                @focus="modeloAtivoFoco = 'cobranca'"
                rows="3"
                class="form-textarea"
                id="textarea-whatsapp-template-cobranca"
                placeholder="Texto para lembrar o cliente com saldo pendente..."
              ></textarea>
            </div>

            <!-- Modelo 4: Entregue -->
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <CheckCircle2 :size="15" style="color: #0f766e;" />
                <span>4. Comprovante de Retirada / Pós-Atendimento (Status Entregue)</span>
              </label>
              <textarea
                v-model="formMsgWhatsappEntregue"
                @focus="modeloAtivoFoco = 'entregue'"
                rows="2"
                class="form-textarea"
                id="textarea-whatsapp-template-entregue"
                placeholder="Texto de agradecimento quando o cliente retira o medicamento..."
              ></textarea>
            </div>
          </div>

          <!-- Automações por Etapa + Sigilo Médico LGPD -->
          <div style="margin-top: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a;">
              Gatilhos Automáticos & Conformidade LGPD
            </div>

            <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.86rem;">
              <input
                v-model="formEvolutionAtivo"
                type="checkbox"
                style="width: 17px; height: 17px; accent-color: #10b981;"
                id="checkbox-evolution-ativo"
              />
              <span><strong>Disparo automático de Chegada:</strong> avisar no WhatsApp assim que todos os itens mudarem para <em>"Chegou"</em></span>
            </label>

            <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.86rem;">
              <input
                v-model="formAutoWhatsappPedido"
                type="checkbox"
                style="width: 17px; height: 17px; accent-color: #2563eb;"
              />
              <span><strong>Disparo automático no Cadastro:</strong> enviar o Modelo 2 assim que uma nova encomenda for registrada</span>
            </label>

            <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.86rem;">
              <input
                v-model="formAutoWhatsappEntregue"
                type="checkbox"
                style="width: 17px; height: 17px; accent-color: #0f766e;"
              />
              <span><strong>Comprovante automático na Entrega:</strong> enviar o Modelo 4 quando a encomenda for marcada como <em>"Entregue"</em></span>
            </label>

            <label
              v-if="authStore.isAdmin"
              style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer; padding-top: 0.6rem; border-top: 1px dashed var(--border-card);"
            >
              <input
                v-model="formOcultarMedicamentosNotificacao"
                type="checkbox"
                style="width: 17px; height: 17px; margin-top: 2px; accent-color: var(--color-primary);"
                id="checkbox-ocultar-medicamentos-lgpd"
              />
              <div>
                <div style="font-size: 0.88rem; font-weight: 700; color: #0f172a;">
                  🛡️ Sigilo Farmacêutico nas Notificações (LGPD Art. 11)
                </div>
                <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                  Oculta automaticamente o nome comercial do medicamento em todos os modelos da API, substituindo por <em>"sua encomenda"</em> na tela de bloqueio do paciente.
                </div>
              </div>
            </label>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 1.25rem;">
            <button @click="salvarWhatsapp" :disabled="salvando" class="btn-primary-pill" id="btn-salvar-whatsapp">
              <CheckCircle :size="16" />
              <span>{{ salvando ? 'Salvando...' : 'Salvar Modelos & Regras da API' }}</span>
            </button>
          </div>
        </div>

        <!-- PAINEL DE CONEXÃO EVOLUTION API / QR CODE COM ISOLAMENTO POR EMPRESA -->
        <div v-if="authStore.isAdmin" class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <Bot :size="22" style="color: var(--color-primary);" />
              <div>
                <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Conexão WhatsApp Exclusiva desta Farmácia</h4>
                <div style="font-size: 0.76rem; color: var(--text-muted);">
                  Instância isolada: <code>{{ instanciaExclusivaWhatsApp || ('encomed_' + authStore.currentTenant.slug) }}</code>
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span
                class="badge"
                :class="statusInstancia === 'open' ? 'badge-chegou' : 'badge-aguardando'"
              >
                {{ statusInstancia === 'open' ? '🟢 Conectado a esta Drogaria' : '🟡 Desconectado / Aguardando' }}
              </span>
            </div>
          </div>

          <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 0.81rem; margin-bottom: 1rem; line-height: 1.45;">
            <Lock :size="17" style="flex-shrink: 0; margin-top: 2px; color: #2563eb;" />
            <div>
              <strong>Isolamento Multi-Tenant Garantido:</strong> Cada empresa possui uma instância exclusiva. O número cadastrado nesta loja é 100% independente e nunca é compartilhado com as demais farmácias da rede.
            </div>
          </div>

          <div style="padding: 1.15rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
              <span style="font-size: 0.88rem; font-weight: 700; color: #1e293b;">
                Pareamento via QR Code Oficial
              </span>
              <button
                type="button"
                @click="carregarQrCode"
                :disabled="carregandoQr"
                class="btn-outline-neutral"
                style="padding: 5px 14px; font-size: 0.78rem;"
              >
                <Loader2 v-if="carregandoQr" class="animate-spin" :size="14" />
                <span v-else>🔄 Sincronizar Estado</span>
              </button>
            </div>

            <!-- Cenário 1: Instância Conectada -->
            <div v-if="statusInstancia === 'open'" style="padding: 1.1rem; background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; color: #065f46;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                  <div style="font-size: 0.95rem; font-weight: 800;">
                    🎉 WhatsApp desta Farmácia Conectado & Operacional!
                  </div>
                  <div style="font-size: 0.82rem; margin-top: 4px; color: #047857;">
                    <span v-if="numeroConectadoWhatsApp">📱 <strong>Número Conectado:</strong> {{ numeroConectadoWhatsApp }}</span>
                    <span v-if="perfilConectadoWhatsApp"> • 👤 <strong>Perfil:</strong> {{ perfilConectadoWhatsApp }}</span>
                  </div>
                  <div style="font-size: 0.76rem; color: #059669; margin-top: 2px;">
                    Instância ativa: <code>{{ instanciaExclusivaWhatsApp || ('encomed_' + authStore.currentTenant.slug) }}</code>
                  </div>
                </div>

                <button
                  type="button"
                  @click="desconectarContaWhatsApp"
                  :disabled="desconectandoWhatsApp"
                  class="btn-outline-neutral"
                  style="color: #dc2626 !important; border-color: #fca5a5; background: #ffffff; padding: 6px 14px; font-size: 0.8rem; font-weight: 700;"
                  title="Desconectar apenas esta conta de WhatsApp para parear outro aparelho"
                >
                  <Loader2 v-if="desconectandoWhatsApp" class="animate-spin" :size="14" />
                  <Unlink v-else :size="14" />
                  <span>{{ desconectandoWhatsApp ? 'Desconectando...' : 'Desconectar / Trocar Aparelho' }}</span>
                </button>
              </div>
            </div>

            <!-- Cenário 2: Instância Desconectada / Aguardando QR Code -->
            <div v-else style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1.25rem; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div v-if="qrcodeBase64" style="background: white; padding: 12px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.08); text-align: center;">
                <img :src="qrcodeBase64" alt="QR Code WhatsApp" style="width: 230px; height: 230px; display: block; margin: 0 auto;" />
                <div style="font-size: 0.74rem; font-weight: 700; color: #2563eb; margin-top: 8px;">
                  Instância: {{ instanciaExclusivaWhatsApp || ('encomed_' + authStore.currentTenant.slug) }}
                </div>
              </div>
              <div v-else style="padding: 1.25rem; color: var(--text-muted); font-size: 0.84rem; text-align: center;">
                <Loader2 v-if="carregandoQr" class="animate-spin" :size="26" style="margin: 0 auto 0.5rem; color: var(--color-primary);" />
                <div>{{ mensagemStatusProxy || 'Clique em "Gerar QR Code Exclusivo" para parear o WhatsApp desta farmácia.' }}</div>
              </div>
              <p style="font-size: 0.78rem; color: #64748b; text-align: center; margin: 0; max-width: 440px;">
                No celular da loja: abra o <strong>WhatsApp</strong> &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong> e aponte para o código.
              </p>
            </div>

            <!-- Disparo de Teste Escolhendo o Modelo -->
            <div style="margin-top: 1.15rem; padding-top: 1rem; border-top: 1px dashed var(--border-card);">
              <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">
                Testar Disparo Real pela API (Adequado ao Modelo Escolhido)
              </label>

              <div style="display: grid; grid-template-columns: 185px 1fr auto; gap: 0.5rem; align-items: center;" class="whatsapp-test-row">
                <select v-model="modeloTesteSelecionado" class="form-select" style="font-size: 0.82rem;">
                  <option value="chegada">Modelo 1: Chegada</option>
                  <option value="pedido">Modelo 2: Pedido</option>
                  <option value="cobranca">Modelo 3: Cobrança</option>
                  <option value="entregue">Modelo 4: Entregue</option>
                </select>

                <input
                  v-model="numeroTeste"
                  type="text"
                  class="form-input"
                  id="input-teste-whatsapp"
                  placeholder="DDD + Número (ex: 11999998888)"
                />

                <button
                  type="button"
                  @click="testarEvolutionApi"
                  :disabled="testandoConexao"
                  class="btn-outline-emerald"
                  id="btn-testar-evolution"
                  style="white-space: nowrap;"
                >
                  <Loader2 v-if="testandoConexao" class="animate-spin" :size="15" />
                  <Send v-else :size="15" />
                  <span>{{ testandoConexao ? 'Enviando...' : 'Testar Modelo' }}</span>
                </button>
              </div>

              <div
                v-if="testeResultado"
                :style="{
                  marginTop: '0.75rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  background: testeResultado.sucesso ? '#ecfdf5' : '#fef2f2',
                  color: testeResultado.sucesso ? '#065f46' : '#991b1b',
                  border: `1px solid ${testeResultado.sucesso ? '#a7f3d0' : '#fecaca'}`,
                }"
              >
                <div>{{ testeResultado.sucesso ? '✅' : '❌' }} <strong>{{ testeResultado.mensagem }}</strong></div>
                <div v-if="testeResultado.textoEnviado" style="margin-top: 6px; font-size: 0.77rem; opacity: 0.9; white-space: pre-line; background: rgba(255,255,255,0.65); padding: 6px 8px; border-radius: 6px;">
                  {{ testeResultado.textoEnviado }}
                </div>
              </div>
            </div>

            <!-- Seção Expansível: Configurações Avançadas de Servidor Próprio (Opcional) -->
            <div style="margin-top: 1.15rem; padding-top: 1rem; border-top: 1px dashed var(--border-card);">
              <button
                type="button"
                @click="showConfigAvancadaWhatsapp = !showConfigAvancadaWhatsapp; if (showConfigAvancadaWhatsapp) carregarCredenciaisWhatsapp();"
                style="display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 0; cursor: pointer; text-align: left;"
              >
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: #475569;">
                  <Server :size="15" />
                  <span>Servidor Próprio de Evolution API (Avançado / Opcional)</span>
                </div>
                <ChevronUp v-if="showConfigAvancadaWhatsapp" :size="16" style="color: #64748b;" />
                <ChevronDown v-else :size="16" style="color: #64748b;" />
              </button>

              <div v-if="showConfigAvancadaWhatsapp" style="margin-top: 0.85rem; display: flex; flex-direction: column; gap: 0.75rem; background: #ffffff; padding: 1rem; border-radius: 10px; border: 1px solid var(--border-card);">
                <p style="font-size: 0.76rem; color: #64748b; margin: 0; line-height: 1.4;">
                  Por padrão, sua farmácia já utiliza a infraestrutura isolada do EncoMed (instância: <code>{{ instanciaExclusivaWhatsApp || ('encomed_' + authStore.currentTenant.slug) }}</code>). Se sua empresa possui seu próprio servidor Evolution API hospedado na nuvem, preencha os dados abaixo:
                </p>

                <div class="form-group" style="margin: 0;">
                  <label class="form-label" style="font-size: 0.78rem;">URL do Servidor Evolution API Dedicado (https)</label>
                  <input
                    v-model="formWhatsappApiUrl"
                    type="text"
                    placeholder="Ex: https://whatsapp.suafarmacia.com.br"
                    class="form-input"
                    style="font-size: 0.8rem;"
                  />
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                  <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Nome da Instância Exclusiva</label>
                    <input
                      v-model="formWhatsappInstanceName"
                      type="text"
                      :placeholder="'encomed_' + authStore.currentTenant.slug"
                      class="form-input"
                      style="font-family: monospace; font-size: 0.8rem;"
                    />
                  </div>

                  <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Chave de API (Global / Instance API Key)</label>
                    <input
                      v-model="formWhatsappApiKey"
                      type="password"
                      autocomplete="new-password"
                      :placeholder="whatsappChaveConfigurada ? '•••••• configurada (deixe vazio para manter)' : 'Cole a chave do seu servidor'"
                      class="form-input"
                      style="font-size: 0.8rem;"
                    />
                    <small v-if="whatsappChaveConfigurada" style="color: #059669; font-size: 0.72rem;">
                      🔒 Chave armazenada com segurança — por proteção ela nunca é exibida novamente.
                    </small>
                  </div>
                </div>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
              <button @click="salvarWhatsapp" :disabled="salvando" class="btn-primary-pill" id="btn-salvar-evolution">
                <CheckCircle :size="16" />
                <span>Salvar Configuração do Robô</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Coluna Direita: Simulador de Celular WhatsApp ao Vivo -->
      <div style="position: sticky; top: 1.25rem; align-self: start;">
        <div class="card" style="padding: 1.25rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <span style="font-weight: 700; font-size: 0.92rem; color: #0f172a;">Simulador de Mensagem no Celular</span>
            <span class="badge badge-chegou" style="font-size: 0.68rem;">Preview API</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 10px; margin-bottom: 0.9rem;">
            <button
              v-for="m in ([
                { id: 'chegada', label: 'Chegada' },
                { id: 'pedido', label: 'Pedido' },
                { id: 'cobranca', label: 'Cobrança' },
                { id: 'entregue', label: 'Entregue' },
              ] as const)"
              :key="m.id"
              type="button"
              @click="modeloAtivoFoco = m.id; modeloTesteSelecionado = m.id"
              :style="{
                background: modeloAtivoFoco === m.id ? '#ffffff' : 'transparent',
                color: modeloAtivoFoco === m.id ? '#0f172a' : '#64748b',
                fontWeight: modeloAtivoFoco === m.id ? 700 : 500,
              }"
              style="border: none; border-radius: 7px; padding: 6px 4px; font-size: 0.72rem; cursor: pointer;"
            >
              {{ m.label }}
            </button>
          </div>

          <!-- Mockup WhatsApp Header + Chat -->
          <div style="border-radius: 16px; overflow: hidden; border: 1px solid var(--border-card); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);">
            <div style="background: #075e54; color: #ffffff; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.65rem;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 3px;">
                <img :src="formLogoUrl || '/encomed-logo.png'" alt="Avatar" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
              </div>
              <div>
                <div style="font-size: 0.84rem; font-weight: 700; line-height: 1.2;">
                  {{ formHeaderTitle || formNomeSistema || 'EncoMed Farmácia' }}
                </div>
                <div style="font-size: 0.68rem; opacity: 0.85;">Conta comercial oficial • online</div>
              </div>
            </div>

            <div style="background: #efeae2; padding: 1.1rem 0.9rem; min-height: 210px; display: flex; flex-direction: column; justify-content: flex-end;">
              <div
                style="background: #d9fdd3; color: #111b21; padding: 0.75rem 0.85rem; border-radius: 12px 12px 2px 12px; font-size: 0.83rem; line-height: 1.45; box-shadow: 0 1px 2px rgba(0,0,0,0.12); white-space: pre-line;"
              >
                {{ previewMensagemWhatsapp }}
                <div style="text-align: right; font-size: 0.66rem; color: #667781; margin-top: 4px;">
                  14:32 ✓✓
                </div>
              </div>
            </div>
          </div>

          <p style="font-size: 0.74rem; color: #64748b; margin-top: 0.75rem; line-height: 1.4;">
            Exemplo simulado com <strong>Maria Aparecida</strong>, item <em>1x OZEMPIC 1MG CANETA</em> e saldo <em>R$ 85,50</em>.
          </p>
        </div>
      </div>
    </div>

    <!-- TAB: MODELO DE IMPRESSÃO / PRINT TEMPLATE (80mm) -->
    <div v-if="activeConfigTab === 'cupom'" class="card" style="max-width: 900px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Modelo de Impressão de Cupom Térmico (80mm)</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        Configurações do leiaute e cabeçalho/rodapé emitidos nas impressoras de bobina térmica de 80mm.
      </p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; align-items: start;">
        <div>
          <div class="form-group">
            <label class="form-label">Título do Cabeçalho (Empresa/Farmácia)</label>
            <input
              v-model="formHeaderTitle"
              type="text"
              class="form-input"
              id="input-header-title"
              placeholder="DROGARIA"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Subtítulo do Cabeçalho</label>
            <input
              v-model="formHeaderSubtitle"
              type="text"
              class="form-input"
              id="input-header-subtitle"
              placeholder="Sistema de Encomendas"
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
            <button @click="salvarModeloCupom" :disabled="salvando" class="btn-primary-pill" id="btn-salvar-cupom">
              <CheckCircle :size="16" />
              <span>Salvar Modelo de Impressão</span>
            </button>
          </div>
        </div>

        <!-- Preview ao Vivo da Bobina de 80mm -->
        <div
          style="background: #ffffff; color: #000000; border: 1px solid #cbd5e1; border-radius: 6px; padding: 1.25rem 1rem; font-family: monospace; line-height: 1.35; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"
          :style="{ fontSize: `${formFontSize}px` }"
        >
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; font-size: 1.05em;">{{ formHeaderTitle || 'DROGARIA' }}</div>
            <div style="font-size: 0.9em;">{{ formHeaderSubtitle || 'Sistema de Encomendas' }}</div>
            <div style="font-size: 0.85em; margin-top: 4px;">RECIBO: #A1B2C3</div>
            <div style="font-size: 0.8em; color: #475569;">{{ new Date().toLocaleDateString('pt-BR') }} 14:30</div>
          </div>

          <div style="margin-bottom: 8px; font-size: 0.9em;">
            <div>CLIENTE: CLIENTE EXEMPLO</div>
            <div v-if="formShowPhone">TEL: (11) 90000-0000</div>
          </div>

          <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span>1x ITEM EXEMPLO A</span>
              <span>R$ 120,00</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>1x ITEM EXEMPLO B</span>
              <span>R$ 14,50</span>
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>TOTAL:</span>
              <span>R$ 134,50</span>
            </div>
            <div v-if="formShowPayment" style="display: flex; justify-content: space-between; font-size: 0.9em; color: #475569;">
              <span>VALOR PAGO:</span>
              <span>R$ 100,00</span>
            </div>
            <div v-if="formShowPayment" style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;">
              <span>SALDO A COBRAR:</span>
              <span>R$ 34,50</span>
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

    <!-- TAB: CATEGORIAS / CLASSIFICAÇÕES -->
    <div v-if="activeConfigTab === 'classificacoes'" class="card" style="max-width: 650px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Classificações de Medicamentos & Produtos</h3>

      <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
        <input
          v-model="novaClassificacaoNome"
          type="text"
          placeholder="Nova categoria (ex: DERMOCOSMÉTICOS, DIABETES...)"
          class="form-input"
          @keyup.enter="adicionarClassificacao"
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

    <!-- TAB: FUNCIONÁRIOS / BALCONISTAS -->
    <div v-if="activeConfigTab === 'funcionarios'" class="card" style="max-width: 750px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Funcionários / Balconistas da Loja</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Cadastro dos colaboradores responsáveis pelas encomendas, baixas e cupons emitidos.
      </p>

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

    <!-- TAB: USUÁRIOS & PERFIS -->
    <div v-if="activeConfigTab === 'usuarios'" class="card" style="max-width: 750px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Usuários Cadastrados na Loja</h3>

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
            <tr v-if="authStore.tenantUsers.length === 0">
              <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                Nenhum usuário operacional listado nesta unidade.
              </td>
            </tr>
            <tr v-for="u in authStore.tenantUsers" :key="u.id">
              <td style="font-weight: 600;">{{ u.nome }}</td>
              <td>{{ u.email }}</td>
              <td>
                <span class="badge" style="background: var(--bg-body); text-transform: uppercase;">
                  {{ u.perfil.replace('_', ' ') }}
                </span>
              </td>
              <td style="text-align: center;">
                <span class="badge" :class="u.ativo ? 'badge-chegou' : 'badge-cancelada'">
                  {{ u.ativo ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB: RETENÇÃO & ALÇADAS -->
    <div v-if="activeConfigTab === 'retencao'" class="card" style="max-width: 650px;">
      <h3 style="font-size: 1.15rem; margin-bottom: 1.25rem;">Parâmetros de Governança & Retenção</h3>

      <div class="form-group">
        <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
          <input type="checkbox" v-model="formBloquearEntregaComSaldo" style="margin-top: 4px;" />
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">Restringir entrega com saldo devedor apenas ao Administrador</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              Se marcado, operadores do balcão não poderão concluir a entrega se houver saldo restante a pagar pelo cliente.
            </div>
          </div>
        </label>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label class="form-label">Prazo para arquivamento automático de pedidos entregues (dias)</label>
        <input
          v-model.number="formDiasRetencao"
          type="number"
          min="7"
          max="3650"
          class="form-input"
          style="max-width: 140px;"
        />
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
          Padrão recomendado: 90 dias após a data de entrega física.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button @click="salvarPoliticas" :disabled="salvando" class="btn-primary-pill" id="btn-salvar-politicas">
          <CheckCircle :size="16" />
          <span>Salvar Políticas</span>
        </button>
      </div>

      <!-- Seção LGPD: Gerenciamento de Cookies e Consentimento -->
      <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color, #e2e8f0);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="font-weight: 600; font-size: 0.95rem; color: #0f172a; display: flex; align-items: center; gap: 0.4rem;">
              <CookieIcon :size="16" style="color: #d97706;" />
              <span>Cookies &amp; Consentimento LGPD</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              Gerencie a autorização de cookies de sessão corporativa, segurança e preferências locais desta estação.
            </div>
          </div>
          <button
            type="button"
            @click="abrirGerenciadorCookiesModal"
            class="btn-outline-neutral"
            style="border-radius: 9999px; padding: 0.4rem 1rem; font-size: 0.82rem; font-weight: 600;"
          >
            <Settings2 :size="14" />
            <span>Gerenciar Cookies</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visual-studio-grid,
.whatsapp-studio-grid {
  display: grid;
  grid-template-columns: 1.45fr 1fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 980px) {
  .visual-studio-grid,
  .whatsapp-studio-grid {
    grid-template-columns: 1fr;
  }
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
  gap: 0.65rem;
}

.preset-card-btn {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--border-card);
  background: #ffffff;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.preset-card-btn:hover {
  border-color: var(--color-primary-border);
  background: #f8fafc;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px var(--color-primary-alpha);
}

.preset-card-btn.active {
  border: 1.5px solid var(--color-primary, #2563eb);
  background: var(--color-primary-subtle, rgba(37, 99, 235, 0.05));
  box-shadow: 0 0 0 2px var(--color-primary-border, rgba(37, 99, 235, 0.18));
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  display: inline-block;
  border: 1px solid rgba(15, 23, 42, 0.12);
}

.option-chip-btn {
  padding: 0.42rem 0.9rem;
  border-radius: 9999px;
  border: 1px solid var(--border-card);
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.option-chip-btn:hover {
  border-color: var(--color-primary-border);
  background: #f8fafc;
}

.option-chip-btn.active {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: #ffffff;
  box-shadow: 0 2px 8px var(--color-primary-alpha);
}

.var-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid var(--border-card);
  background: #ffffff;
  color: #334155;
  font-size: 0.74rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.var-tag-chip code {
  font-weight: 700;
  color: var(--color-primary, #2563eb);
}

.var-tag-chip:hover {
  border-color: var(--color-primary-border);
  background: var(--color-primary-subtle, #eff6ff);
}

.color-picker-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 4px;
  background: #ffffff;
  border: 1px solid var(--border-card);
  border-radius: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.color-picker-box:focus-within {
  border-color: var(--color-primary, #2563eb);
  box-shadow: 0 0 0 3px var(--color-primary-alpha);
}

.color-swatch-trigger {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.color-native-overlay {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 54px;
  height: 54px;
  opacity: 0;
  cursor: pointer;
}

.color-hex-field {
  border: none !important;
  background: transparent !important;
  padding: 0 6px !important;
  height: 34px !important;
  font-family: monospace;
  font-size: 0.86rem;
  font-weight: 700;
  color: #0f172a;
  box-shadow: none !important;
}

@media (max-width: 680px) {
  .whatsapp-test-row {
    grid-template-columns: 1fr !important;
  }
}
</style>
