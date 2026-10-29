import { supabase } from './supabase';

export interface DisparoWhatsAppResultado {
  sucesso: boolean;
  mensagem: string;
  conectado?: boolean;
  estado?: string;
  base64?: string;
}

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

/**
 * Monta o texto de notificação de chegada de encomenda respeitando minimização LGPD (Art. 11)
 */
export function formatarMensagemNotificacao(
  template: string,
  clienteNome: string,
  itensDescricao: string,
  saldoPendente: number = 0,
  ocultarMedicamentos: boolean = false
): string {
  const primeiroNome = (clienteNome || 'Cliente').trim().split(' ')[0];
  const medicamentos = ocultarMedicamentos ? 'sua encomenda' : (itensDescricao || 'seu medicamento');

  let msg = (template || 'Olá {cliente}! Seu pedido de {medicamento} já está disponível para retirada.')
    .replace('{cliente}', primeiroNome)
    .replace('{medicamento}', medicamentos);

  if (saldoPendente > 0) {
    msg += `\n*Saldo pendente:* R$ ${saldoPendente.toFixed(2)}`;
  }

  return msg;
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
export async function consultarStatusWhatsAppProxy(): Promise<DisparoWhatsAppResultado> {
  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, conectado: false, mensagem: 'Sessão não autenticada.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'status' }),
    });
    const data = await response.json().catch(() => null);
    return {
      sucesso: Boolean(data?.sucesso),
      conectado: Boolean(data?.conectado),
      estado: data?.estado || 'desconhecido',
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
export async function obterQrCodeWhatsAppProxy(): Promise<DisparoWhatsAppResultado> {
  const headers = await obterHeadersAutenticados();
  if (!headers) {
    return { sucesso: false, mensagem: 'Sessão não autenticada.' };
  }

  try {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'qrcode' }),
    });
    const data = await response.json().catch(() => null);
    return {
      sucesso: Boolean(data?.sucesso),
      conectado: Boolean(data?.conectado),
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
 * Envia mensagem de texto via Proxy Backend (/api/whatsapp).
 * Credenciais externas ficam exclusivamente em variáveis de ambiente do servidor.
 */
export async function enviarMensagemWhatsAppProxy(
  ativo: boolean,
  numeroDestino: string,
  texto: string
): Promise<DisparoWhatsAppResultado> {
  if (!ativo) {
    return { sucesso: false, mensagem: 'Disparo automático de WhatsApp está desativado nas configurações.' };
  }

  const numeroNormalizado = normalizarNumeroWhatsApp(numeroDestino);
  if (!numeroNormalizado || numeroNormalizado.length < 12) {
    return { sucesso: false, mensagem: 'Número de telefone inválido para envio.' };
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
        numeroDestino: numeroNormalizado,
        texto,
      }),
    });

    const data = await response.json().catch(() => null);
    if (response.ok && data?.sucesso) {
      return {
        sucesso: true,
        mensagem: data.mensagem || 'Mensagem enviada com sucesso!',
      };
    }

    return {
      sucesso: false,
      mensagem: data?.mensagem || 'Não foi possível enviar a mensagem automática.',
    };
  } catch {
    return {
      sucesso: false,
      mensagem: 'Serviço de mensageria indisponível no momento.',
    };
  }
}
