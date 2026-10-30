import { supabase } from './supabase';
import type { ConfigTenant } from '../types';

export type TipoModeloWhatsApp = 'chegada' | 'pedido' | 'cobranca' | 'entregue' | 'personalizado';

export interface VariaveisModeloWhatsApp {
  cliente?: string;
  nomeCompleto?: string;
  medicamento?: string;
  itens?: string;
  saldo?: number;
  valorTotal?: number;
  valorPago?: number;
  codigoRastreio?: string;
  loja?: string;
}

export interface DisparoWhatsAppResultado {
  sucesso: boolean;
  mensagem: string;
  conectado?: boolean;
  estado?: string;
  instancia?: string;
  numeroConectado?: string;
  perfilConectado?: string;
  servidorDedicado?: boolean;
  base64?: string;
  textoEnviado?: string;
  modeloUtilizado?: TipoModeloWhatsApp;
}

export const MODELOS_PADRAO_WHATSAPP: Record<Exclude<TipoModeloWhatsApp, 'personalizado'>, string> = {
  chegada:
    'Olá {cliente}! Seu pedido de {medicamento} já está disponível para retirada na {loja}. Aguardamos sua visita!',
  pedido:
    'Olá {cliente}! Confirmamos seu pedido de {medicamento} ({codigo}) na {loja}. Em breve avisaremos assim que chegar.',
  cobranca:
    'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível na {loja}. Saldo a acertar: {saldo}.',
  entregue:
    'Olá {cliente}! Registramos a retirada do seu pedido de {medicamento} na {loja}. Obrigado pela preferência e ótima saúde!',
};

/**
 * Normaliza número para formato internacional aceito pelo WhatsApp (DDI 55 + DDD + Telefone)
 */
export function normalizarNumeroWhatsApp(telefone: string): string {
  const limpo = (telefone || '').replace(/\D/g, '');
  if (!limpo) return '';
  if (!limpo.startsWith('55') && (limpo.length === 10 || limpo.length === 11)) {
    return `55${limpo}`;
  }
  return limpo;
}

function formatarMoedaBr(val?: number): string {
  const seguro = Math.max(0, Number(val) || 0);
  return `R$ ${seguro.toFixed(2).replace('.', ',')}`;
}

/**
 * Renderiza qualquer modelo de mensagem do WhatsApp substituindo todas as variáveis e respeitando LGPD (Art. 11)
 */
export function renderizarModeloWhatsApp(
  modelo: TipoModeloWhatsApp,
  config: Partial<ConfigTenant> | undefined,
  variaveis: VariaveisModeloWhatsApp,
  templateOverride?: string
): string {
  const ocultar = Boolean(config?.ocultar_medicamentos_notificacao);
  const nomeCompleto = (variaveis.nomeCompleto || variaveis.cliente || 'Cliente').trim();
  const primeiroNome = nomeCompleto.split(/\s+/)[0] || 'Cliente';
  const descBruta = (variaveis.medicamento || variaveis.itens || 'seu medicamento').trim();
  const medicamento = ocultar ? 'sua encomenda' : descBruta;
  const loja = (variaveis.loja || config?.header_title || config?.nome_sistema || 'nossa farmácia').trim();
  const codigo = (variaveis.codigoRastreio || 'PEDIDO').trim();
  const saldoNum = Math.max(0, Number(variaveis.saldo) || 0);
  const saldoStr = formatarMoedaBr(saldoNum);
  const totalStr = formatarMoedaBr(variaveis.valorTotal);
  const pagoStr = formatarMoedaBr(variaveis.valorPago);
  const dataHoje = new Date().toLocaleDateString('pt-BR');

  let base = '';
  if (templateOverride && templateOverride.trim()) {
    base = templateOverride.trim();
  } else if (modelo === 'chegada') {
    base = config?.mensagem_whatsapp || MODELOS_PADRAO_WHATSAPP.chegada;
  } else if (modelo === 'pedido') {
    base = config?.mensagem_whatsapp_pedido || MODELOS_PADRAO_WHATSAPP.pedido;
  } else if (modelo === 'cobranca') {
    base = config?.mensagem_whatsapp_cobranca || MODELOS_PADRAO_WHATSAPP.cobranca;
  } else if (modelo === 'entregue') {
    base = config?.mensagem_whatsapp_entregue || MODELOS_PADRAO_WHATSAPP.entregue;
  } else {
    base = config?.mensagem_whatsapp || MODELOS_PADRAO_WHATSAPP.chegada;
  }

  const continhaTagSaldo = /\{saldo\}/i.test(base);

  let msg = base
    .replace(/\{cliente\}/gi, primeiroNome)
    .replace(/\{nome_completo\}/gi, nomeCompleto)
    .replace(/\{medicamento\}/gi, medicamento)
    .replace(/\{itens\}/gi, medicamento)
    .replace(/\{saldo\}/gi, saldoStr)
    .replace(/\{total\}/gi, totalStr)
    .replace(/\{pago\}/gi, pagoStr)
    .replace(/\{codigo\}/gi, codigo)
    .replace(/\{loja\}/gi, loja)
    .replace(/\{farmacia\}/gi, loja)
    .replace(/\{data\}/gi, dataHoje);

  if ((modelo === 'chegada' || modelo === 'cobranca') && !continhaTagSaldo && saldoNum > 0) {
    msg += `\n*Saldo a acertar na retirada:* ${saldoStr}`;
  }

  return msg.trim();
}

/**
 * Compatibilidade direta com chamadas legadas de formatarMensagemNotificacao
 */
export function formatarMensagemNotificacao(
  template: string,
  clienteNome: string,
  itensDescricao: string,
  saldoPendente: number = 0,
  ocultarMedicamentos: boolean = false,
  lojaNome?: string,
  codigoRastreio?: string
): string {
  return renderizarModeloWhatsApp(
    'chegada',
    { ocultar_medicamentos_notificacao: ocultarMedicamentos, header_title: lojaNome },
    {
      cliente: clienteNome,
      nomeCompleto: clienteNome,
      medicamento: itensDescricao,
      saldo: saldoPendente,
      loja: lojaNome,
      codigoRastreio,
    },
    template
  );
}

/**
 * Gera link oficial wa.me já preenchido com o modelo de mensagem configurado no sistema
 */
export function gerarLinkWaMeComModelo(
  telefone: string,
  modelo: TipoModeloWhatsApp,
  config: Partial<ConfigTenant> | undefined,
  variaveis: VariaveisModeloWhatsApp
): string {
  const num = normalizarNumeroWhatsApp(telefone);
  if (!num) return '';
  const texto = renderizarModeloWhatsApp(modelo, config, variaveis);
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

async function obterHeadersAutenticados(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Consulta o status da instância WhatsApp via Proxy Backend (sem expor URL/API Key no navegador)
 */
export async function consultarStatusWhatsAppProxy(tenantId?: string): Promise<DisparoWhatsAppResultado> {
  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, conectado: false, mensagem: 'Sessão não autenticada.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'status', tenantId }),
    });
    const data = await response.json().catch(() => null);
    return {
      sucesso: Boolean(data?.sucesso),
      conectado: Boolean(data?.conectado),
      estado: data?.estado || 'desconhecido',
      instancia: data?.instancia,
      numeroConectado: data?.numeroConectado,
      perfilConectado: data?.perfilConectado,
      servidorDedicado: Boolean(data?.servidorDedicado),
      mensagem: data?.mensagem || (data?.conectado ? 'Conectado' : 'Desconectado'),
    };
  } catch {
    return {
      sucesso: false,
      conectado: false,
      mensagem: 'Não foi possível verificar o status do serviço de WhatsApp.',
    };
  }
}

/**
 * Solicita QR Code de pareamento via Proxy Backend (restrito a Administradores)
 */
export async function obterQrCodeWhatsAppProxy(tenantId?: string): Promise<DisparoWhatsAppResultado> {
  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, mensagem: 'Sessão não autenticada.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'qrcode', tenantId }),
    });
    const data = await response.json().catch(() => null);
    return {
      sucesso: Boolean(data?.sucesso),
      conectado: Boolean(data?.conectado),
      instancia: data?.instancia,
      base64: data?.base64 || undefined,
      mensagem: data?.mensagem || 'Solicitação processada.',
    };
  } catch {
    return {
      sucesso: false,
      mensagem: 'Não foi possível obter o QR Code no momento.',
    };
  }
}

/**
 * Consulta (sem nunca receber a chave) se a empresa possui servidor WhatsApp próprio configurado.
 */
export async function consultarCredenciaisWhatsappStatus(
  tenantId: string
): Promise<{ apiUrl: string; chaveConfigurada: boolean } | null> {
  try {
    const { data, error } = await supabase.rpc('status_whatsapp_credenciais', { p_tenant_id: tenantId });
    if (error || !data) return null;
    return { apiUrl: String(data.api_url || ''), chaveConfigurada: Boolean(data.chave_configurada) };
  } catch {
    return null;
  }
}

/**
 * Grava URL/Chave do servidor próprio via RPC blindada. `apiKey` undefined mantém a chave atual.
 */
export async function salvarCredenciaisWhatsappProxy(
  tenantId: string,
  apiUrl: string,
  apiKey?: string
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    const { error } = await supabase.rpc('salvar_whatsapp_credenciais', {
      p_tenant_id: tenantId,
      p_api_url: apiUrl,
      p_api_key: apiKey === undefined ? null : apiKey,
    });
    if (error) {
      return { sucesso: false, mensagem: error.message || 'Não foi possível salvar as credenciais.' };
    }
    return { sucesso: true, mensagem: 'Credenciais do servidor próprio salvas com segurança.' };
  } catch {
    return { sucesso: false, mensagem: 'Falha de conexão ao salvar as credenciais.' };
  }
}

/**
 * Desconecta/despareia exclusivamente a conta WhatsApp desta empresa (restrito a Administradores)
 */
export async function desconectarWhatsAppProxy(tenantId?: string): Promise<DisparoWhatsAppResultado> {
  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, mensagem: 'Sessão não autenticada.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'disconnect', tenantId }),
    });
    const data = await response.json().catch(() => null);
    return {
      sucesso: Boolean(data?.sucesso),
      conectado: Boolean(data?.conectado),
      estado: data?.estado || 'close',
      instancia: data?.instancia,
      mensagem: data?.mensagem || 'Conta desconectada com sucesso.',
    };
  } catch {
    return {
      sucesso: false,
      mensagem: 'Não foi possível desconectar o WhatsApp no momento.',
    };
  }
}

/**
 * Dispara mensagem pelo Proxy Backend (/api/whatsapp) adequando-se diretamente ao modelo configurado do Tenant!
 */
export async function enviarModeloWhatsAppProxy(opcoes: {
  ativo: boolean;
  numeroDestino: string;
  modelo: TipoModeloWhatsApp;
  tenantId?: string;
  variaveis?: VariaveisModeloWhatsApp;
  templateCustomizado?: string;
  texto?: string;
  ocultarMedicamentosOverride?: boolean;
}): Promise<DisparoWhatsAppResultado> {
  if (!opcoes.ativo) {
    return { sucesso: false, mensagem: 'Disparo automático de WhatsApp está desativado nas configurações.' };
  }

  const numeroNormalizado = normalizarNumeroWhatsApp(opcoes.numeroDestino);
  if (!numeroNormalizado || numeroNormalizado.length < 12) {
    return { sucesso: false, mensagem: 'Número de telefone inválido para envio (informe DDD + Telefone).' };
  }

  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, mensagem: 'Sessão expirada. Faça login novamente para enviar mensagens.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'send',
        tenantId: opcoes.tenantId,
        numeroDestino: numeroNormalizado,
        modelo: opcoes.modelo,
        variaveis: opcoes.variaveis,
        templateCustomizado: opcoes.templateCustomizado,
        texto: opcoes.texto,
        ocultarMedicamentosOverride: opcoes.ocultarMedicamentosOverride,
      }),
    });

    const data = await response.json().catch(() => null);
    if (response.ok && data?.sucesso) {
      return {
        sucesso: true,
        mensagem: data.mensagem || 'Mensagem enviada com sucesso!',
        textoEnviado: data.textoEnviado,
        modeloUtilizado: data.modeloUtilizado,
      };
    }

    return {
      sucesso: false,
      mensagem: data?.mensagem || 'Não foi possível enviar a mensagem automática.',
      textoEnviado: data?.textoEnviado,
    };
  } catch {
    return {
      sucesso: false,
      mensagem: 'Serviço de mensageria indisponível no momento.',
    };
  }
}

/**
 * Envia mensagem de texto direta ou por modelo via Proxy Backend (/api/whatsapp).
 */
export async function enviarMensagemWhatsAppProxy(
  ativo: boolean,
  numeroDestino: string,
  texto: string,
  modelo: TipoModeloWhatsApp = 'personalizado',
  variaveis?: VariaveisModeloWhatsApp
): Promise<DisparoWhatsAppResultado> {
  return enviarModeloWhatsAppProxy({
    ativo,
    numeroDestino,
    modelo,
    variaveis,
    texto,
  });
}
