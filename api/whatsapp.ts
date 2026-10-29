import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface ProxyRequestBody {
  action?: 'status' | 'qrcode' | 'send';
  numeroDestino?: string;
  texto?: string;
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

function normalizarTelefone(telefone: string): string {
  const limpo = (telefone || '').replace(/\D/g, '');
  if (!limpo) return '';
  if (!limpo.startsWith('55') && (limpo.length === 10 || limpo.length === 11)) {
    return `55${limpo}`;
  }
  return limpo;
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
        mensagem: 'Serviço de mensageria não configurado nas variáveis de ambiente do servidor.',
      },
    };
  }

  const action = body?.action;
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
      const texto = (body?.texto || '').trim();

      if (!numero || numero.length < 12 || numero.length > 15) {
        return { status: 400, payload: { sucesso: false, mensagem: 'Número de telefone inválido para envio.' } };
      }
      if (!texto || texto.length > 1500) {
        return { status: 400, payload: { sucesso: false, mensagem: 'Conteúdo da mensagem inválido ou excede o limite permitido.' } };
      }

      const resp = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(evoInstance)}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify({
          number: numero,
          options: { delay: 1200, presence: 'composing', linkPreview: false },
          textMessage: { text: texto },
          text: texto,
        }),
      });

      const data: any = await resp.json().catch(() => null);
      if (resp.ok && (data?.status === 'PENDING' || data?.key || data?.message || data?.status === 200)) {
        return {
          status: 200,
          payload: { sucesso: true, mensagem: 'Mensagem enviada com sucesso ao WhatsApp do cliente!' },
        };
      }

      return {
        status: 502,
        payload: {
          sucesso: false,
          mensagem: 'Não foi possível entregar a mensagem pelo serviço automático. Verifique se o WhatsApp da farmácia está conectado.',
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

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse & { status?: (c: number) => any; json?: (b: any) => any }) {
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

