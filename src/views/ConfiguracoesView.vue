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
} from 'lucide-vue-next';
import {
  consultarStatusWhatsAppProxy,
  obterQrCodeWhatsAppProxy,
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
    const stateRes = await consultarStatusWhatsAppProxy();
    if (stateRes.conectado || stateRes.estado === 'open') {
      statusInstancia.value = 'open';
      qrcodeBase64.value = null;
      return;
    }

    statusInstancia.value = (stateRes.estado as any) || 'close';
    if (!stateRes.sucesso && stateRes.mensagem) {
      mensagemStatusProxy.value = stateRes.mensagem;
    }

    const qrRes = await obterQrCodeWhatsAppProxy();
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

// ============================================================================
// 3. DEMAIS ABAS (CUPOM 80MM, FUNCIONÁRIOS, CLASSIFICAÇÕES, POLÍTICAS)
// ============================================================================
const formHeaderTitle = ref(authStore.currentConfig.header_title || 'DROGARIA AEROPORTO');
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

    formHeaderTitle.value = cfg.header_title || 'DROGARIA AEROPORTO';
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
  });
  salvando.value = false;
  exibirFeedback(
    res.sucesso ? 'sucesso' : 'erro',
    res.sucesso ? 'Modelos de mensagem e automações da API salvos com sucesso!' : res.mensagem || 'Erro ao salvar.'
  );
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
  await authStore.adicionarFuncionario(novoFuncionarioNome.value, novoFuncionarioCargo.value);
  novoFuncionarioNome.value = '';
  novoFuncionarioCargo.value = '';
  exibirFeedback('sucesso', 'Funcionário cadastrado com sucesso.');
}

async function removerFuncionario(id: string, nome: string) {
  if (confirm(`Deseja realmente remover o funcionário "${nome}"?`)) {
    await authStore.removerFuncionario(id);
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

function adicionarClassificacao() {
  if (!novaClassificacaoNome.value.trim()) return;
  comprasStore.adicionarClassificacao(novaClassificacaoNome.value);
  novaClassificacaoNome.value = '';
  exibirFeedback('sucesso', 'Classificação adicionada com sucesso.');
}

function removerClassificacao(id: string) {
  comprasStore.removerClassificacao(id);
  exibirFeedback('sucesso', 'Classificação removida.');
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
                placeholder="Ex: Drogaria Aeroporto / EncoMed"
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
          <div style="margin-top: 1rem; padding: 1rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <label class="form-label" style="margin-bottom: 0.6rem;">Logotipo da Unidade / SaaS</label>

            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
              <div
                style="width: 72px; height: 72px; background: #ffffff; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 6px; flex-shrink: 0;"
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
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input
                  v-model="formCorPrimaria"
                  @input="aplicarPreviewTempoReal"
                  type="color"
                  style="width: 44px; height: 38px; border: 1px solid #cbd5e1; cursor: pointer; border-radius: 8px; padding: 2px; background: #fff;"
                />
                <input
                  v-model="formCorPrimaria"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input"
                  style="font-family: monospace; font-size: 0.85rem;"
                />
              </div>
            </div>

            <div>
              <label class="form-label">Cor Secundária (Menu & PDF)</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input
                  v-model="formCorSecundaria"
                  @input="aplicarPreviewTempoReal"
                  type="color"
                  style="width: 44px; height: 38px; border: 1px solid #cbd5e1; cursor: pointer; border-radius: 8px; padding: 2px; background: #fff;"
                />
                <input
                  v-model="formCorSecundaria"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input"
                  style="font-family: monospace; font-size: 0.85rem;"
                />
              </div>
            </div>

            <div>
              <label class="form-label">Cor de Destaque (Detalhes)</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input
                  v-model="formCorDestaque"
                  @input="aplicarPreviewTempoReal"
                  type="color"
                  style="width: 44px; height: 38px; border: 1px solid #cbd5e1; cursor: pointer; border-radius: 8px; padding: 2px; background: #fff;"
                />
                <input
                  v-model="formCorDestaque"
                  @change="aplicarPreviewTempoReal"
                  type="text"
                  class="form-input"
                  style="font-family: monospace; font-size: 0.85rem;"
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
                  <option value="jakarta">Plus Jakarta Sans (Geométrica SaaS)</option>
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
                <span>Exibir assinatura discreta <strong>"Tecnologia EncoMed SaaS"</strong> no rodapé do menu</span>
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
        <div class="card" style="padding: 1.25rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.92rem;">
              <Eye :size="16" style="color: var(--color-primary);" />
              <span>Pré-visualização em Tempo Real</span>
            </div>
            <span class="badge badge-chegou" style="font-size: 0.7rem;">Ao Vivo</span>
          </div>

          <!-- Mini App Shell Preview -->
          <div
            style="display: grid; grid-template-columns: 128px 1fr; min-height: 330px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);"
            :style="{ borderRadius: previewRadiusPx }"
          >
            <!-- Mini Sidebar -->
            <div
              :style="{ background: previewSidebarBg, color: previewSidebarText }"
              style="padding: 0.85rem 0.65rem; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid rgba(148, 163, 184, 0.2);"
            >
              <div>
                <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 0.9rem;">
                  <img
                    :src="formLogoUrl || '/encomed-logo.png'"
                    alt="Mini Logo"
                    :style="{
                      height: formFormatoLogo === 'retangular' ? '26px' : '32px',
                      width: formFormatoLogo === 'retangular' ? 'auto' : '32px',
                      borderRadius: formFormatoLogo === 'circular' ? '9999px' : '6px',
                      background: formEstiloSidebar !== 'claro' ? '#ffffff' : 'transparent',
                      padding: formEstiloSidebar !== 'claro' ? '2px 4px' : '0',
                    }"
                    style="object-fit: contain; align-self: flex-start;"
                  />
                  <div style="font-weight: 800; font-size: 0.76rem; line-height: 1.15; margin-top: 2px;">
                    {{ formNomeSistema || 'EncoMed' }}
                  </div>
                  <div style="font-size: 0.62rem; opacity: 0.72;">
                    {{ formSloganSistema || 'Encomendas & Estoque' }}
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <div
                    :style="{
                      background: formEstiloSidebar === 'claro' ? `${formCorPrimaria}18` : 'rgba(255,255,255,0.16)',
                      color: formEstiloSidebar === 'claro' ? formCorPrimaria : '#ffffff',
                    }"
                    style="padding: 5px 8px; border-radius: 6px; font-size: 0.68rem; font-weight: 700;"
                  >
                    ● Painel Geral
                  </div>
                  <div style="padding: 5px 8px; font-size: 0.68rem; opacity: 0.75;">Encomendas</div>
                  <div style="padding: 5px 8px; font-size: 0.68rem; opacity: 0.75;">Pedidos & XML</div>
                  <div style="padding: 5px 8px; font-size: 0.68rem; opacity: 0.75;">Relatórios PDF</div>
                </div>
              </div>

              <div v-if="formExibirSeloEncomed" style="font-size: 0.56rem; opacity: 0.65; padding-top: 8px; border-top: 1px solid rgba(148,163,184,0.2);">
                Tecnologia EncoMed SaaS
              </div>
            </div>

            <!-- Mini Content Area -->
            <div style="background: #f8fafc; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <div>
                  <div style="font-weight: 800; font-size: 0.88rem; color: #0f172a;">
                    {{ formSaudacaoPainel || 'Bem-vindo' }}
                  </div>
                  <div style="font-size: 0.66rem; color: #64748b;">
                    Unidade {{ formNomeSistema || 'EncoMed' }}
                  </div>
                </div>
                <span
                  :style="{ background: formCorPrimaria }"
                  style="color: #fff; font-size: 0.65rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px;"
                >
                  + Nova Encomenda
                </span>
              </div>

              <!-- Sample Card -->
              <div
                style="background: #ffffff; border: 1px solid #e2e8f0; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;"
                :style="{ borderRadius: previewRadiusPx }"
              >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span
                    :style="{ background: `${formCorDestaque}18`, color: formCorDestaque, border: `1px solid ${formCorDestaque}40` }"
                    style="font-size: 0.62rem; font-weight: 700; padding: 2px 7px; border-radius: 9999px;"
                  >
                    FÓRMULA / ÉTICO
                  </span>
                  <span style="font-size: 0.68rem; font-weight: 700;" :style="{ color: formCorPrimaria }">
                    R$ 189,90
                  </span>
                </div>
                <div style="font-size: 0.74rem; font-weight: 700; color: #0f172a;">
                  OZEMPIC 1MG CANETA INJETÁVEL
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  <span style="font-size: 0.62rem; padding: 2px 6px; border-radius: 6px; background: #fffbeb; color: #d97706; border: 1px solid #fde68a; font-weight: 600;">
                    Aguardando
                  </span>
                  <span style="font-size: 0.62rem; padding: 2px 6px; border-radius: 6px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 600;">
                    Pedido Feito
                  </span>
                  <span style="font-size: 0.62rem; padding: 2px 6px; border-radius: 6px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-weight: 700;">
                    ✓ Chegou
                  </span>
                </div>
              </div>

              <div style="font-size: 0.7rem; color: #64748b; line-height: 1.4;">
                As cores semânticas de status (Âmbar, Azul e Esmeralda) permanecem protegidas para segurança operacional no balcão.
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
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; padding: 0.75rem; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px;">
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
              style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer; padding-top: 0.6rem; border-top: 1px dashed #cbd5e1;"
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

        <!-- PAINEL DE CONEXÃO EVOLUTION API / QR CODE -->
        <div v-if="authStore.isAdmin" class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <Bot :size="22" style="color: var(--color-primary);" />
              <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Conexão do Servidor WhatsApp (Proxy Seguro)</h4>
            </div>
            <span
              class="badge"
              :class="statusInstancia === 'open' ? 'badge-chegou' : 'badge-aguardando'"
            >
              {{ statusInstancia === 'open' ? '🟢 Instância Conectada' : '🟡 Aguardando Pareamento' }}
            </span>
          </div>

          <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 0.81rem; margin-bottom: 1rem; line-height: 1.45;">
            <Lock :size="17" style="flex-shrink: 0; margin-top: 2px; color: #2563eb;" />
            <div>
              <strong>Arquitetura Zero-Trust:</strong> A API em <code>/api/whatsapp</code> valida sua sessão JWT, busca o modelo configurado da sua unidade no Supabase e dispara pela Evolution API sem expor chaves no navegador.
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
                <span v-else>🔄 Verificar / Gerar QR Code</span>
              </button>
            </div>

            <div v-if="statusInstancia === 'open'" style="padding: 0.95rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; color: #065f46; font-size: 0.86rem; text-align: center;">
              🎉 <strong>WhatsApp da farmácia conectado e operacional!</strong> Todos os modelos acima já estão sincronizados com a API.
            </div>

            <div v-else style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1rem; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0;">
              <div v-if="qrcodeBase64" style="background: white; padding: 12px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">
                <img :src="qrcodeBase64" alt="QR Code WhatsApp" style="width: 220px; height: 220px; display: block;" />
              </div>
              <div v-else style="padding: 1rem; color: var(--text-muted); font-size: 0.84rem; text-align: center;">
                <Loader2 v-if="carregandoQr" class="animate-spin" :size="24" style="margin: 0 auto 0.5rem;" />
                <div>{{ mensagemStatusProxy || 'Clique em "Verificar / Gerar QR Code" para parear o WhatsApp da loja.' }}</div>
              </div>
              <p style="font-size: 0.78rem; color: #64748b; text-align: center; margin: 0; max-width: 420px;">
                No celular da farmácia: abra o <strong>WhatsApp</strong> &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong>.
              </p>
            </div>

            <!-- Disparo de Teste Escolhendo o Modelo -->
            <div style="margin-top: 1.15rem; padding-top: 1rem; border-top: 1px dashed #cbd5e1;">
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
          <div style="border-radius: 16px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);">
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
              placeholder="DROGARIA AEROPORTO"
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
            <div style="font-weight: bold; font-size: 1.05em;">{{ formHeaderTitle || 'DROGARIA AEROPORTO' }}</div>
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
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.preset-card-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.preset-card-btn.active {
  border-color: var(--color-primary, #2563eb);
  background: hsla(var(--primary), 0.05);
  box-shadow: 0 0 0 2px hsla(var(--primary), 0.14);
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
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.option-chip-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.option-chip-btn.active {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: #ffffff;
}

.var-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
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
  border-color: var(--color-primary, #2563eb);
  background: #eff6ff;
}

@media (max-width: 680px) {
  .whatsapp-test-row {
    grid-template-columns: 1fr !important;
  }
}
</style>
