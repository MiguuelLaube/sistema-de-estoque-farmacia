import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { gerarHtmlEmailCriarSenha } from '../src/utils/emailTemplates.ts';

export interface ConvidarEmpresaRequestBody {
  action?: 'send_invite' | 'preview_html';
  emailAdmin?: string;
  nomeAdmin?: string;
  nomeEmpresa?: string;
  slugEmpresa?: string;
  planoEmpresa?: string;
}

export interface ConvidarEmpresaEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  RESEND_API_KEY?: string;
  RESEND_SENDER_EMAIL?: string;
  APP_URL?: string;
}

export async function processConvidarEmpresaRequest(
  method: string | undefined,
  authHeader: string | undefined,
  body: ConvidarEmpresaRequestBody,
  env: ConvidarEmpresaEnv
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
    return { status: 500, payload: { sucesso: false, mensagem: 'Serviço de autenticação indisponível.' } };
  }

  // Validação estrita de Super Admin
  const supa = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userRes, error: authErr } = await supa.auth.getUser(token);
  if (authErr || !userRes?.user) {
    return { status: 401, payload: { sucesso: false, mensagem: 'Sessão inválida ou expirada.' } };
  }

  const { data: usuarioRow, error: userDbErr } = await supa
    .from('usuario')
    .select('id, perfil, ativo')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle();

  if (userDbErr || !usuarioRow || !usuarioRow.ativo || usuarioRow.perfil !== 'super_admin') {
    return { status: 403, payload: { sucesso: false, mensagem: 'Apenas o Super Administrador pode enviar convites de empresas.' } };
  }

  const emailAdmin = (body.emailAdmin || '').trim().toLowerCase();
  const nomeAdmin = (body.nomeAdmin || 'Administrador').trim();
  const nomeEmpresa = (body.nomeEmpresa || 'Nova Empresa').trim();
  const slugEmpresa = (body.slugEmpresa || 'loja').trim().toLowerCase();
  const planoEmpresa = (body.planoEmpresa || 'Profissional').trim();

  const baseUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const redirectTo = `${baseUrl}/login`;

  // Gera o link de recuperação/definição de senha
  let linkCriarSenha = `${baseUrl}/login?modo=criar-senha&email=${encodeURIComponent(emailAdmin)}`;

  // Se houver SERVICE_ROLE_KEY, podemos gerar o link oficial autenticado do Supabase
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSupa = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: linkData } = await adminSupa.auth.admin.generateLink({
        type: 'recovery',
        email: emailAdmin,
        options: { redirectTo },
      });
      if (linkData?.properties?.action_link) {
        linkCriarSenha = linkData.properties.action_link;
      }
    } catch {
      // Mantém linkCriarSenha fallback
    }
  }

  const html = gerarHtmlEmailCriarSenha({
    nomeAdmin,
    emailAdmin,
    nomeEmpresa,
    slugEmpresa,
    planoEmpresa,
    linkCriarSenha,
  });

  if (body.action === 'preview_html') {
    return {
      status: 200,
      payload: {
        sucesso: true,
        html,
        linkCriarSenha,
      },
    };
  }

  // Disparo Real de E-mail
  if (!emailAdmin || !emailAdmin.includes('@')) {
    return { status: 400, payload: { sucesso: false, mensagem: 'Endereço de e-mail do administrador inválido.' } };
  }

  // 1. Tenta envio direto via Brevo API (se chave configurada)
  if (env.BREVO_API_KEY) {
    try {
      const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: {
            name: env.BREVO_SENDER_NAME || 'EncoMed SaaS',
            email: env.BREVO_SENDER_EMAIL || 'no-reply@encomed.com.br',
          },
          to: [{ email: emailAdmin, name: nomeAdmin }],
          subject: `Defina sua Senha de Acesso • ${nomeEmpresa}`,
          htmlContent: html,
        }),
      });

      if (brevoResp.ok) {
        return {
          status: 200,
          payload: {
            sucesso: true,
            provedor: 'Brevo (Sendinblue)',
            mensagem: `E-mail de boas-vindas com link de senha enviado para ${emailAdmin} via Brevo!`,
            linkCriarSenha,
          },
        };
      }
    } catch {
      // Fallback
    }
  }

  // 2. Tenta envio direto via Resend API (se chave configurada)
  if (env.RESEND_API_KEY) {
    try {
      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: env.RESEND_SENDER_EMAIL || 'EncoMed <onboarding@resend.dev>',
          to: [emailAdmin],
          subject: `Defina sua Senha de Acesso • ${nomeEmpresa}`,
          html,
        }),
      });

      if (resendResp.ok) {
        return {
          status: 200,
          payload: {
            sucesso: true,
            provedor: 'Resend',
            mensagem: `E-mail de boas-vindas com link de senha enviado para ${emailAdmin} via Resend!`,
            linkCriarSenha,
          },
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fallback Nativo: Supabase Auth Reset Password
  const { error: supaErr } = await supa.auth.resetPasswordForEmail(emailAdmin, { redirectTo });
  if (supaErr) {
    return {
      status: 200,
      payload: {
        sucesso: true,
        provedor: 'Manual',
        mensagem: `Empresa cadastrada! Copie o link de ativação manualmente: ${linkCriarSenha}`,
        linkCriarSenha,
      },
    };
  }

  return {
    status: 200,
    payload: {
      sucesso: true,
      provedor: 'Supabase Auth',
      mensagem: `Link de definição de senha enviado com sucesso para ${emailAdmin}!`,
      linkCriarSenha,
    },
  };
}

export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse & { status?: (c: number) => any; json?: (b: any) => any }
) {
  let parsedBody: ConvidarEmpresaRequestBody = {};
  if (req.body && typeof req.body === 'object') {
    parsedBody = req.body;
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
  const result = await processConvidarEmpresaRequest(req.method, authHeader, parsedBody, process.env as ConvidarEmpresaEnv);

  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.payload));
}
