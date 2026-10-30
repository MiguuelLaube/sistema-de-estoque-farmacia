import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

export type TipoModeloWhatsApp = 'chegada' | 'pedido' | 'cobranca' | 'entregue' | 'personalizado';

export interface VariaveisModeloWhatsApp {
  cliente?: string;
  nomeCompleto?: string;
  medicamento?: string;
  itens?: string;
  saldo?: number | string;
  valorTotal?: number | string;
  valorPago?: number | string;
  codigoRastreio?: string;
  loja?: string;
  observacao?: string;
}

export interface ProxyRequestBody {
  action?: 'status' | 'qrcode' | 'send' | 'preview';
  numeroDestino?: string;
  texto?: string;
  modelo?: TipoModeloWhatsApp;
  variaveis?: VariaveisModeloWhatsApp;
  templateCustomizado?: string;
  ocultarMedicamentosOverride?: boolean;
}

export interface ProxyEnv {
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_INSTANCE_NAME?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ALLOWED_PROXY_ORIGIN?: string;
}

const DEFAULT_TEMPLATES: Record<Exclude<TipoModeloWhatsApp, 'personalizado'>, string> = {
  chegada:
    'Olá {cliente}! Seu pedido de {medicamento} já está disponível para retirada na {loja}. Aguardamos sua visita!',
  pedido:
    'Olá {cliente}! Confirmamos seu pedido de {medicamento} ({codigo}) na {loja}. Em breve avisaremos assim que chegar.',
  cobranca:
    'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível na {loja}. Saldo a acertar: {saldo}.',
  entregue:
    'Olá {cliente}! Registramos a retirada do seu pedido de {medicamento} na {loja}. Obrigado pela preferência e ótima saúde!',
};

function normalizarTelefone(telefone: string): string {
  const limpo = (telefone || '').replace(/\D/g, '');
  if (!limpo) return '';
  if (!limpo.startsWith('55') && (limpo.length === 10 || limpo.length === 11)) {
    return `55${limpo}`;
  }
  return limpo;
}

function formatarMoedaBr(valor: number | string | undefined): { texto: string; numero: number } {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const n = Math.max(0, valor);
    return {
      numero: n,
      texto: `R$ ${n.toFixed(2).replace('.', ',')}`,
    };
  }
  if (typeof valor === 'string' && valor.trim()) {
    const limpo = valor.replace(/[^\d,.-]/g, '').replace(',', '.');
    const parsed = parseFloat(limpo);
    if (Number.isFinite(parsed)) {
      const n = Math.max(0, parsed);
      return {
        numero: n,
        texto: `R$ ${n.toFixed(2).replace('.', ',')}`,
      };
    }
    return { numero: 0, texto: valor.trim() };
  }
  return { numero: 0, texto: 'R$ 0,00' };
}

export function renderizarMensagemPorModelo(
  modelo: TipoModeloWhatsApp,
  configBanco: Record<string, any> | null,
  variaveis?: VariaveisModeloWhatsApp,
  templateCustomizado?: string,
  textoDireto?: string,
  ocultarOverride?: boolean
): string {
  const ocultarMedicamentos =
    typeof ocultarOverride === 'boolean'
      ? ocultarOverride
      : Boolean(configBanco?.ocultar_medicamentos_notificacao);

  const nomeCompleto = (variaveis?.nomeCompleto || variaveis?.cliente || 'Cliente').trim();
  const primeiroNome = nomeCompleto.split(/\s+/)[0] || 'Cliente';
  const descBruta = (variaveis?.medicamento || variaveis?.itens || 'seu medicamento').trim();
  const medicamentoFinal = ocultarMedicamentos ? 'sua encomenda' : descBruta;
  const nomeLoja = (
    variaveis?.loja ||
    configBanco?.header_title ||
    configBanco?.nome_sistema ||
    'nossa farmácia'
  ).trim();
  const codigo = (variaveis?.codigoRastreio || 'PEDIDO').trim();
  const dataHoje = new Date().toLocaleDateString('pt-BR');

  const saldoFmt = formatarMoedaBr(variaveis?.saldo);
  const totalFmt = formatarMoedaBr(variaveis?.valorTotal);
  const pagoFmt = formatarMoedaBr(variaveis?.valorPago);

  let baseTemplate = '';
  if (templateCustomizado && templateCustomizado.trim()) {
    baseTemplate = templateCustomizado.trim();
  } else if (modelo === 'personalizado' && textoDireto && textoDireto.trim()) {
    baseTemplate = textoDireto.trim();
  } else if (modelo === 'chegada') {
    baseTemplate = configBanco?.mensagem_whatsapp || DEFAULT_TEMPLATES.chegada;
  } else if (modelo === 'pedido') {
    baseTemplate = configBanco?.mensagem_whatsapp_pedido || DEFAULT_TEMPLATES.pedido;
  } else if (modelo === 'cobranca') {
    baseTemplate = configBanco?.mensagem_whatsapp_cobranca || DEFAULT_TEMPLATES.cobranca;
  } else if (modelo === 'entregue') {
    baseTemplate = configBanco?.mensagem_whatsapp_entregue || DEFAULT_TEMPLATES.entregue;
  } else {
    baseTemplate = textoDireto?.trim() || configBanco?.mensagem_whatsapp || DEFAULT_TEMPLATES.chegada;
  }

  const continhaTagSaldo = /\{saldo\}/i.test(baseTemplate);

  let renderizado = baseTemplate
    .replace(/\{cliente\}/gi, primeiroNome)
    .replace(/\{nome_completo\}/gi, nomeCompleto)
    .replace(/\{medicamento\}/gi, medicamentoFinal)
    .replace(/\{itens\}/gi, medicamentoFinal)
    .replace(/\{saldo\}/gi, saldoFmt.texto)
    .replace(/\{total\}/gi, totalFmt.texto)
    .replace(/\{pago\}/gi, pagoFmt.texto)
    .replace(/\{codigo\}/gi, codigo)
    .replace(/\{loja\}/gi, nomeLoja)
    .replace(/\{farmacia\}/gi, nomeLoja)
    .replace(/\{data\}/gi, dataHoje);

  // Se for aviso de chegada ou cobrança com saldo em aberto e o template não incluía {saldo}, anexa lembrete claro
  if ((modelo === 'chegada' || modelo === 'cobranca') && !continhaTagSaldo && saldoFmt.numero > 0) {
    renderizado += `\n*Saldo a acertar na retirada:* ${saldoFmt.texto}`;
  }

  return renderizado.trim();
}

export async function processWhatsAppProxyRequest(
  method: string | undefined,
  authHeader: string | undefined,
  body: ProxyRequestBody,
  env: ProxyEnv
): Promise<{ status: number; payload: Record<string, unknown> }> {
  if (method !== 'POST') {
    return { status: 405, payload: { sucesso: false, mensagem: 'Método não permitido.' } };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, payload: { sucesso: false, mensagem: 'Sessão não autenticada.' } };
  }

  const token = authHeader.slice(7).trim();
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, payload: { sucesso: false, mensagem: 'Serviço de autenticação indisponível no servidor.' } };
  }

  // Valida JWT e obtém perfil real no banco sob RLS
  const supa = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userRes, error: authErr } = await supa.auth.getUser(token);
  if (authErr || !userRes?.user) {
    return { status: 401, payload: { sucesso: false, mensagem: 'Sessão inválida ou expirada. Faça login novamente.' } };
  }

  const { data: usuarioRow, error: userDbErr } = await supa
    .from('usuario')
    .select('id, tenant_id, perfil, ativo')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();

  if (userDbErr || !usuarioRow || !usuarioRow.ativo) {
    return { status: 403, payload: { sucesso: false, mensagem: 'Usuário sem permissão ativa para utilizar integrações.' } };
  }

  // Carrega os modelos de mensagem e política LGPD diretamente do banco para adequar a API aos templates do Tenant
  let configBanco: Record<string, any> | null = null;
  if (usuarioRow.tenant_id) {
    const { data: cfgRow } = await supa
      .from('config_tenant')
      .select(
        'nome_sistema, header_title, mensagem_whatsapp, mensagem_whatsapp_pedido, mensagem_whatsapp_cobranca, mensagem_whatsapp_entregue, ocultar_medicamentos_notificacao, evolution_api_ativo'
      )
      .eq('tenant_id', usuarioRow.tenant_id)
      .maybeSingle();
    configBanco = cfgRow || null;
  }

  const action = body?.action;

  // Ação de pré-visualização server-side do modelo renderizado (não exige Evolution API online)
  if (action === 'preview') {
    const modelo: TipoModeloWhatsApp = body?.modelo || 'chegada';
    const textoRenderizado = renderizarMensagemPorModelo(
      modelo,
      configBanco,
      body?.variaveis,
      body?.templateCustomizado,
      body?.texto,
      body?.ocultarMedicamentosOverride
    );
    return {
      status: 200,
      payload: {
        sucesso: true,
        modeloUtilizado: modelo,
        textoRenderizado,
      },
    };
  }

  const evoUrl = (env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  const evoKey = (env.EVOLUTION_API_KEY || '').trim();
  const evoInstance = (env.EVOLUTION_INSTANCE_NAME || '').trim();
  const proxyOrigin = (env.ALLOWED_PROXY_ORIGIN || 'http://localhost:5173').trim();

  if (!evoUrl || !evoKey || !evoInstance) {
    return {
      status: 503,
      payload: {
        sucesso: false,
        conectado: false,
        mensagem:
          'Serviço de WhatsApp não configurado nas variáveis do servidor (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME).',
      },
    };
  }

  const evoHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: evoKey,
    Origin: proxyOrigin,
  };

  try {
    if (action === 'status') {
      if (usuarioRow.perfil !== 'admin' && usuarioRow.perfil !== 'super_admin') {
        return { status: 403, payload: { sucesso: false, mensagem: 'Apenas administradores podem consultar o estado do serviço.' } };
      }

      const resp = await fetch(`${evoUrl}/instance/connectionState/${encodeURIComponent(evoInstance)}`, {
        method: 'GET',
        headers: evoHeaders,
      });

      if (!resp.ok) {
        return {
          status: 200,
          payload: { sucesso: false, conectado: false, estado: 'indisponivel', mensagem: 'Serviço WhatsApp indisponível no momento.' },
        };
      }

      const data: any = await resp.json().catch(() => ({}));
      const estado = data?.instance?.state || data?.state || 'close';
      return {
        status: 200,
        payload: {
          sucesso: true,
          conectado: estado === 'open',
          estado,
        },
      };
    }

    if (action === 'qrcode') {
      if (usuarioRow.perfil !== 'admin' && usuarioRow.perfil !== 'super_admin') {
        return { status: 403, payload: { sucesso: false, mensagem: 'Apenas administradores podem gerar QR Code de pareamento.' } };
      }

      const resp = await fetch(`${evoUrl}/instance/connect/${encodeURIComponent(evoInstance)}`, {
        method: 'GET',
        headers: evoHeaders,
      });

      if (!resp.ok) {
        return { status: 502, payload: { sucesso: false, mensagem: 'Não foi possível solicitar pareamento ao serviço WhatsApp.' } };
      }

      const data: any = await resp.json().catch(() => ({}));
      if (data?.instance?.state === 'open') {
        return { status: 200, payload: { sucesso: true, conectado: true, mensagem: 'Instância já está conectada.' } };
      }

      const qrBase64 = data?.base64 || data?.qrcode?.base64 || null;
      return {
        status: 200,
        payload: {
          sucesso: Boolean(qrBase64),
          conectado: false,
          base64: qrBase64,
          mensagem: qrBase64 ? 'QR Code gerado com sucesso.' : 'Aguardando geração do QR Code pelo serviço.',
        },
      };
    }

    if (action === 'send') {
      const numero = normalizarTelefone(body?.numeroDestino || '');
      const modelo: TipoModeloWhatsApp = body?.modelo || (body?.texto ? 'personalizado' : 'chegada');
      const textoFinal = renderizarMensagemPorModelo(
        modelo,
        configBanco,
        body?.variaveis,
        body?.templateCustomizado,
        body?.texto,
        body?.ocultarMedicamentosOverride
      );

      if (!numero || numero.length < 12 || numero.length > 15) {
        return { status: 400, payload: { sucesso: false, mensagem: 'Número de telefone inválido para envio (informe DDD + número).' } };
      }
      if (!textoFinal || textoFinal.length > 2500) {
        return { status: 400, payload: { sucesso: false, mensagem: 'Conteúdo da mensagem inválido ou excede o limite permitido.' } };
      }

      // Payload primário compatível com Evolution API v2 (textMessageSchema oficial)
      let resp = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(evoInstance)}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify({
          number: numero,
          text: textoFinal,
          delay: 1000,
          linkPreview: false,
        }),
      });

      // Fallback automático para Evolution API v1 caso a instância remota utilize formato legado textMessage
      if (resp.status === 400) {
        const errBody: any = await resp.clone().json().catch(() => null);
        const errStr = JSON.stringify(errBody || '');
        if (errStr.includes('textMessage')) {
          resp = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(evoInstance)}`, {
            method: 'POST',
            headers: evoHeaders,
            body: JSON.stringify({
              number: numero,
              options: { delay: 1000, presence: 'composing', linkPreview: false },
              textMessage: { text: textoFinal },
            }),
          });
        }
      }

      const data: any = await resp.json().catch(() => null);
      if (resp.ok && (data?.status === 'PENDING' || data?.key || data?.message || data?.status === 200 || data?.status === 201)) {
        return {
          status: 200,
          payload: {
            sucesso: true,
            modeloUtilizado: modelo,
            textoEnviado: textoFinal,
            mensagem: 'Mensagem enviada com sucesso ao WhatsApp do cliente!',
          },
        };
      }

      return {
        status: 502,
        payload: {
          sucesso: false,
          modeloUtilizado: modelo,
          textoEnviado: textoFinal,
          mensagem:
            'Não foi possível entregar a mensagem pela API automática. Verifique em Configurações > WhatsApp se o aparelho está conectado via QR Code.',
        },
      };
    }

    return { status: 400, payload: { sucesso: false, mensagem: 'Ação inválida.' } };
  } catch {
    // Nunca vaza URL interna, stack trace ou chaves de API
    return {
      status: 502,
      payload: {
        sucesso: false,
        conectado: false,
        mensagem: 'Serviço de WhatsApp temporariamente inacessível.',
      },
    };
  }
}

export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse & { status?: (c: number) => any; json?: (b: any) => any }
) {
  let parsedBody: ProxyRequestBody = {};
  if (req.body && typeof req.body === 'object') {
    parsedBody = req.body;
  } else if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body);
    } catch {
      parsedBody = {};
    }
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length > 0) {
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        parsedBody = {};
      }
    }
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  const result = await processWhatsAppProxyRequest(req.method, authHeader, parsedBody, process.env as ProxyEnv);

  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.payload));
}
