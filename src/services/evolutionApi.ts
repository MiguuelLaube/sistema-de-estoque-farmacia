import type { Encomenda } from '../types';

export interface EvolutionApiConfig {
  ativo: boolean;
  apiUrl: string;        // Ex: https://api.seudominio.com ou http://localhost:8080
  apiKey: string;        // Global API Key ou Instance Token da Evolution API v1/v2
  instanceName: string;  // Nome da instância criada na Evolution API
  mensagemTemplate?: string;
  ocultarMedicamentos?: boolean;
}

export interface DisparoWhatsAppResultado {
  sucesso: boolean;
  mensagem: string;
  detalhes?: any;
}

/**
 * Normaliza número para formato internacional aceito pelo WhatsApp (DDI 55 + DDD + Telefone)
 */
export function normalizarNumeroWhatsApp(telefone: string): string {
  const limpo = (telefone || '').replace(/\D/g, '');
  if (!limpo) return '';
  // Se não começa com 55 e tem 10 ou 11 dígitos, adiciona 55
  if (!limpo.startsWith('55') && (limpo.length === 10 || limpo.length === 11)) {
    return `55${limpo}`;
  }
  return limpo;
}

/**
 * Monta o texto de notificação de chegada de encomenda
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

/**
 * Envia mensagem de texto via Evolution API (compatível com v1.x e v2.x)
 */
export async function enviarMensagemEvolutionApi(
  config: EvolutionApiConfig,
  numeroDestino: string,
  texto: string
): Promise<DisparoWhatsAppResultado> {
  if (!config.ativo) {
    return { sucesso: false, mensagem: 'Disparo automático de WhatsApp está desativado.' };
  }

  if (!config.apiUrl || !config.apiKey || !config.instanceName) {
    return {
      sucesso: false,
      mensagem: 'Evolution API não configurada. Preencha URL, Instância e API Key em Configurações > WhatsApp.',
    };
  }

  const numeroNormalizado = normalizarNumeroWhatsApp(numeroDestino);
  if (!numeroNormalizado || numeroNormalizado.length < 10) {
    return { sucesso: false, mensagem: `Número de telefone inválido para envio: "${numeroDestino}".` };
  }

  // Tratamento da URL base sem barra final
  const baseUrl = config.apiUrl.trim().replace(/\/+$/, '');
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(config.instanceName.trim())}`;

  const payload = {
    number: numeroNormalizado,
    options: {
      delay: 1200,
      presence: 'composing',
      linkPreview: false,
    },
    textMessage: {
      text: texto,
    },
    // Suporte a diferentes versões do body da Evolution (v1 / v2)
    text: texto,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey.trim(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && (data?.status === 'PENDING' || data?.key || data?.message || data?.status === 200)) {
      return {
        sucesso: true,
        mensagem: 'Mensagem enviada com sucesso ao WhatsApp do cliente!',
        detalhes: data,
      };
    } else {
      const erroMsg = data?.response?.message || data?.message || response.statusText || 'Erro ao conectar à Evolution API';
      return {
        sucesso: false,
        mensagem: `Falha na Evolution API (${response.status}): ${JSON.stringify(erroMsg)}`,
        detalhes: data,
      };
    }
  } catch (error: any) {
    return {
      sucesso: false,
      mensagem: `Erro de conexão com o servidor da Evolution API: ${error?.message || error}`,
    };
  }
}
