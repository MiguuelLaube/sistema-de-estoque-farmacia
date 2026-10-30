import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { gerarHtmlEmailCriarSenha } from '../src/utils/emailTemplates.ts';

export interface ConvidarEmpresaRequestBody {
  action?: 'send_invite' | 'provisionar_com_senha_provisoria' | 'redefinir_senha_provisoria';
  emailAdmin?: string;
  nomeAdmin?: string;
  nomeEmpresa?: string;
  slugEmpresa?: string;
  planoEmpresa?: string;
  senhaProvisoria?: string;
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
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

const MAX_BODY_BYTES = 8 * 1024;
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const rateMap = new Map<string, number[]>();

function limitar(chave: string, limite: number, janelaMs: number): { ok: boolean; retryAfterSec: number } {
  const agora = Date.now();
  if (rateMap.size > 1000) rateMap.clear();
  const lista = (rateMap.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= limite) {
    rateMap.set(chave, lista);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((janelaMs - (agora - lista[0])) / 1000)) };
  }
  lista.push(agora);
  rateMap.set(chave, lista);
  return { ok: true, retryAfterSec: 0 };
}

function resolverUrlBase(env: ConvidarEmpresaEnv): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '');
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '');
  return 'http://localhost:5173';
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

  // Validação estrita de Super Admin sob RLS
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

  // Exige 2FA (AAL2) como nas demais operações do Super Admin
  const { data: ctx } = await supa.rpc('is_super_admin');
  if (ctx !== true) {
    return { status: 403, payload: { sucesso: false, mensagem: 'Operação exige sessão Super Admin com 2FA validado.' } };
  }

  // Anti-abuso: no máximo 10 convites por minuto por Super Admin
  const rl = limitar(`convite:${usuarioRow.id}`, 10, 60_000);
  if (!rl.ok) {
    return {
      status: 429,
      payload: { sucesso: false, retryAfterSec: rl.retryAfterSec, mensagem: `Muitos convites seguidos. Aguarde ${rl.retryAfterSec}s.` },
    };
  }

  const emailAdmin = String(body.emailAdmin || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(emailAdmin)) {
    return { status: 400, payload: { sucesso: false, mensagem: 'Endereço de e-mail do administrador inválido.' } };
  }

  // FLUXO: PROVISIONAMENTO OU REDEFINIÇÃO COM SENHA PROVISÓRIA (SEM ENVIO DE E-MAIL)
  if (body.action === 'provisionar_com_senha_provisoria' || body.action === 'redefinir_senha_provisoria') {
    const senhaProvisoria = String(body.senhaProvisoria || '').trim() ||
      `EncoMed@${Math.floor(1000 + Math.random() * 9000)}`;
    const nomeAdmin = String(body.nomeAdmin || 'Administrador').trim().slice(0, 80);

    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const adminSupa = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: listRes } = await adminSupa.auth.admin.listUsers();
        const existing = listRes?.users?.find((u) => u.email?.toLowerCase() === emailAdmin);

        if (existing) {
          await adminSupa.auth.admin.updateUserById(existing.id, {
            password: senhaProvisoria,
            email_confirm: true,
            user_metadata: { ...(existing.user_metadata || {}), nome: nomeAdmin, exigir_troca_senha: true },
          });
        } else {
          await adminSupa.auth.admin.createUser({
            email: emailAdmin,
            password: senhaProvisoria,
            email_confirm: true,
            user_metadata: { nome: nomeAdmin, exigir_troca_senha: true },
          });
        }

        await adminSupa
          .from('usuario')
          .update({ exigir_troca_senha: true, senha_provisoria_ativa: true })
          .eq('email', emailAdmin);

        return {
          status: 200,
          payload: {
            sucesso: true,
            senhaProvisoria,
            mensagem: 'Conta provisionada com sucesso com senha provisória e confirmação imediata sem envio de e-mail.',
          },
        };
      } catch (err: any) {
        console.warn('[ConvidarEmpresa Provisionar Exception]:', err);
      }
    }

    return {
      status: 200,
      payload: {
        sucesso: true,
        senhaProvisoria,
        mensagem: 'Senha provisória registrada com sucesso para primeiro acesso da drogaria.',
      },
    };
  }

  // Não vira "relay" de e-mail: o destinatário PRECISA ser administrador cadastrado de uma empresa
  const { data: admRow } = await supa
    .from('usuario')
    .select('id, nome, tenant_id')
    .eq('email', emailAdmin)
    .eq('perfil', 'admin')
    .eq('ativo', true)
    .maybeSingle();

  if (!admRow) {
    return {
      status: 404,
      payload: { sucesso: false, mensagem: 'Este e-mail não pertence a um administrador de empresa cadastrado.' },
    };
  }

  const nomeAdmin = String(body.nomeAdmin || admRow.nome || 'Administrador').trim().slice(0, 80);
  const nomeEmpresa = String(body.nomeEmpresa || 'Sua empresa').trim().slice(0, 120);
  const slugEmpresa = String(body.slugEmpresa || 'loja').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const planoEmpresa = String(body.planoEmpresa || 'Profissional').trim().slice(0, 30);

  const baseUrl = resolverUrlBase(env);
  const redirectTo = `${baseUrl}/login`;

  // 1) Caminho premium: link oficial com TOKEN (exige SUPABASE_SERVICE_ROLE_KEY, só no servidor).
  //    O link NUNCA é devolvido ao navegador (quem o possui assume a conta do gestor sem passar por auditoria).
  let linkComToken: string | null = null;
  if (env.SUPABASE_SERVICE_ROLE_KEY && (env.BREVO_API_KEY || env.RESEND_API_KEY)) {
    try {
      const adminSupa = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: linkData } = await adminSupa.auth.admin.generateLink({
        type: 'recovery',
        email: emailAdmin,
        options: { redirectTo },
      });
      linkComToken = linkData?.properties?.action_link || null;
    } catch {
      linkComToken = null;
    }
  }

  // 2) E-mail personalizado só é enviado se existir um link REAL com token
  if (linkComToken) {
    const html = gerarHtmlEmailCriarSenha({
      nomeAdmin,
      emailAdmin,
      nomeEmpresa,
      slugEmpresa,
      planoEmpresa,
      linkCriarSenha: linkComToken,
    });
    const assunto = `Defina sua Senha de Acesso • ${nomeEmpresa}`;

    if (env.BREVO_API_KEY) {
      try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
          body: JSON.stringify({
            sender: {
              name: env.BREVO_SENDER_NAME || 'EncoMed SaaS',
              email: env.BREVO_SENDER_EMAIL || 'no-reply@encomed.com.br',
            },
            to: [{ email: emailAdmin, name: nomeAdmin }],
            subject: assunto,
            htmlContent: html,
          }),
        });
        if (r.ok) {
          return {
            status: 200,
            payload: { sucesso: true, provedor: 'Brevo', mensagem: `E-mail de boas-vindas enviado para ${emailAdmin}.` },
          };
        }
      } catch {
        // cai para o próximo provedor
      }
    }

    if (env.RESEND_API_KEY) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: env.RESEND_SENDER_EMAIL || 'EncoMed <onboarding@resend.dev>',
            to: [emailAdmin],
            subject: assunto,
            html,
          }),
        });
        if (r.ok) {
          return {
            status: 200,
            payload: { sucesso: true, provedor: 'Resend', mensagem: `E-mail de boas-vindas enviado para ${emailAdmin}.` },
          };
        }
      } catch {
        // cai para o fallback nativo
      }
    }
  }

  // 3) Fallback nativo e seguro: e-mail de redefinição do próprio Supabase Auth (já contém token válido)
  const { error: supaErr } = await supa.auth.resetPasswordForEmail(emailAdmin, { redirectTo });
  if (supaErr) {
    return {
      status: 502,
      payload: {
        sucesso: false,
        mensagem:
          'Não foi possível enviar o e-mail agora (limite do Supabase ou SMTP). Tente novamente em alguns minutos ou configure o SMTP do Brevo.',
      },
    };
  }

  return {
    status: 200,
    payload: {
      sucesso: true,
      provedor: 'Supabase Auth',
      mensagem: `Link de definição de senha enviado para ${emailAdmin}. Confira também a caixa de spam.`,
    },
  };
}

export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse & { status?: (c: number) => any; json?: (b: any) => any }
) {
  const responder = (status: number, payload: Record<string, unknown>) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  };

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : '') ||
    req.socket?.remoteAddress ||
    'unknown-ip';
  const rlIp = limitar(`convite_ip:${ip}`, 30, 60_000);
  if (!rlIp.ok) {
    res.setHeader('Retry-After', String(rlIp.retryAfterSec));
    return responder(429, { sucesso: false, mensagem: 'Limite de requisições excedido para este IP.' });
  }

  let parsedBody: ConvidarEmpresaRequestBody = {};
  if (req.body && typeof req.body === 'object') {
    if (JSON.stringify(req.body).length > MAX_BODY_BYTES) {
      return responder(413, { sucesso: false, mensagem: 'Payload excede o tamanho permitido.' });
    }
    parsedBody = req.body;
  } else {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        return responder(413, { sucesso: false, mensagem: 'Payload excede o tamanho permitido.' });
      }
      chunks.push(buf);
    }
    if (chunks.length > 0) {
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        parsedBody = {};
      }
    }
  }

  const authHeader = (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer '))
    ? req.headers.authorization
    : typeof req.headers.cookie === 'string'
      ? (() => {
          const m = req.headers.cookie.match(/(?:^|;\s*)(?:sb-access-token|sb_access_token)=([^;]*)/);
          return m ? `Bearer ${decodeURIComponent(m[1])}` : undefined;
        })()
      : undefined;
  const result = await processConvidarEmpresaRequest(req.method, authHeader, parsedBody, process.env as ConvidarEmpresaEnv);
  if (result.status === 429) res.setHeader('Retry-After', '15');
  responder(result.status, result.payload);
}
