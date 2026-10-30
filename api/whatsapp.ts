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
  action?: 'status' | 'qrcode' | 'send' | 'preview' | 'disconnect';
  tenantId?: string;
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
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ALLOWED_PROXY_ORIGIN?: string;
}

/**
 * Anti-SSRF: aceita apenas https com host público. Bloqueia localhost, IPs privados/loopback/link-local,
 * endpoints de metadata de nuvem e sufixos internos.
 */
export function urlPublicaSegura(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
    if (/\.(internal|local|lan|intranet|corp|home|localdomain)$/.test(host)) return false;
    if (host.includes(':')) return false; // literais IPv6 (::1, fe80::, fc00::) não são permitidos
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// PROTEÇÃO DE RATE LIMITING SERVER-SIDE E TAMANHO DE PAYLOAD (ANTI-ATAQUE/SPAM)
// ============================================================================
const MAX_WHATSAPP_BODY_BYTES = 32 * 1024; // 32 KB máx por requisição
const rateLimitMap = new Map<string, number[]>();

function verificarRateLimitMemoria(
  chave: string,
  limite: number,
  janelaMs: number
): { permitido: boolean; restantes: number; retryAfterSec: number } {
  const agora = Date.now();
  // Limpeza preventiva caso o mapa cresça demais
  if (rateLimitMap.size > 2000) {
    rateLimitMap.clear();
  }
  const lista = (rateLimitMap.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= limite) {
    const maisAntigo = lista[0] || agora;
    const retryAfterSec = Math.max(1, Math.ceil((janelaMs - (agora - maisAntigo)) / 1000));
    rateLimitMap.set(chave, lista);
    return { permitido: false, restantes: 0, retryAfterSec };
  }
  lista.push(agora);
  rateLimitMap.set(chave, lista);
  return { permitido: true, restantes: Math.max(0, limite - lista.length), retryAfterSec: 0 };
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

  const action = body?.action;
  const isSendAction = action === 'send';
  const limiteAcao = isSendAction ? 15 : 30; // 15 disparos/min ou 30 consultas/min por usuário
  const escopoRateLimit = isSendAction ? 'api_whatsapp_send' : 'api_whatsapp_meta';

  // Camada 1: Rate Limit em memória por Usuário + Ação
  const rlMem = verificarRateLimitMemoria(`${usuarioRow.id}:${escopoRateLimit}`, limiteAcao, 60_000);
  if (!rlMem.permitido) {
    return {
      status: 429,
      payload: {
        sucesso: false,
        retryAfterSec: rlMem.retryAfterSec,
        mensagem: `Limite de uso da API atingido (${limiteAcao} req/min). Aguarde ${rlMem.retryAfterSec}s antes de tentar novamente.`,
      },
    };
  }

  // Camada 2: Rate Limit persistente no PostgreSQL (compartilhado entre instâncias Serverless)
  const { data: rlDb, error: rlDbErr } = await supa.rpc('verificar_rate_limit_requisicao', {
    p_escopo: escopoRateLimit,
    p_limite: limiteAcao,
    p_janela_segundos: 60,
  });
  if (!rlDbErr && rlDb && rlDb.permitido === false) {
    return {
      status: 429,
      payload: {
        sucesso: false,
        retryAfterSec: rlDb.segundos_restantes || 30,
        mensagem: `Limite de segurança da API excedido. Aguarde ${rlDb.segundos_restantes || 30}s para nova tentativa.`,
      },
    };
  }

  // ============================================================================
  // ISOLAMENTO MULTI-TENANT ESTRITO: Cada empresa possui sua própria instância/API
  // ============================================================================
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let targetTenantId: string | null = null;

  if (usuarioRow.perfil === 'super_admin') {
    // Zero-Trust: Super Admin só opera o WhatsApp de uma empresa com sessão Break-Glass ATIVA (auditada) nela
    const { data: bgTenant } = await supa.rpc('active_break_glass_tenant_id');
    if (bgTenant && typeof bgTenant === 'string') {
      const pedido = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
      if (!pedido || (uuidRegex.test(pedido) && pedido.toLowerCase() === bgTenant.toLowerCase())) {
        targetTenantId = bgTenant;
      }
    }
  } else {
    // Zero-Trust: Usuários de loja sempre operam estritamente no próprio tenant_id do banco
    targetTenantId = usuarioRow.tenant_id || null;
  }

  if (!targetTenantId) {
    return {
      status: 400,
      payload: {
        sucesso: false,
        conectado: false,
        mensagem: 'Contexto de empresa (tenant) não identificado para operação do WhatsApp.',
      },
    };
  }

  // Carrega dados da Empresa (slug exclusivo) e Configurações do Tenant sob RLS
  const [{ data: tenantRow }, { data: cfgRow }] = await Promise.all([
    supa.from('tenant').select('id, slug, nome_empresa').eq('id', targetTenantId).maybeSingle(),
    supa.from('config_tenant').select('*').eq('tenant_id', targetTenantId).maybeSingle(),
  ]);

  if (!tenantRow) {
    return {
      status: 403,
      payload: {
        sucesso: false,
        conectado: false,
        mensagem: 'Acesso não autorizado aos recursos de WhatsApp desta empresa.',
      },
    };
  }

  const configBanco: Record<string, any> | null = cfgRow || null;

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

  // Determina a instância e credenciais EXCLUSIVAS desta empresa (nunca compartilha conta entre empresas!)
  const slugLimpo = (tenantRow.slug || targetTenantId.slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');

  // Credenciais de servidor próprio ficam em tabela blindada (sem acesso pelo navegador).
  // Só o backend lê, com a service_role (variável exclusiva de servidor) e DEPOIS de o tenant
  // ter sido validado sob RLS acima.
  let customApiUrl = '';
  let customApiKey = '';
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSupa = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: seg } = await adminSupa
        .from('config_tenant_whatsapp_segredo')
        .select('api_url, api_key')
        .eq('tenant_id', targetTenantId)
        .maybeSingle();
      customApiUrl = String(seg?.api_url || '').trim().replace(/\/+$/, '');
      customApiKey = String(seg?.api_key || '').trim();
    } catch {
      // Sem segredo próprio: segue com a infraestrutura compartilhada isolada por instância
    }
  }

  const usandoServidorProprio = Boolean(customApiUrl && customApiKey);

  // ANTI-SEQUESTRO DE SESSÃO: no servidor compartilhado da plataforma a instância é SEMPRE derivada do
  // slug da empresa (imutável pelo usuário). Nome de instância customizado só vale em servidor próprio.
  const instanciaCustom = String(configBanco?.whatsapp_instance_name || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const evoInstance = usandoServidorProprio && instanciaCustom ? instanciaCustom : `encomed_${slugLimpo}`;

  // Proteção anti-SSRF para URL própria: somente https público (sem IPs privados/loopback/metadata)
  if (usandoServidorProprio && !urlPublicaSegura(customApiUrl)) {
    return {
      status: 400,
      payload: {
        sucesso: false,
        conectado: false,
        mensagem: 'URL do servidor WhatsApp próprio não é permitida (use um endereço https público).',
      },
    };
  }

  const evoUrl = usandoServidorProprio ? customApiUrl : (env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  const evoKey = usandoServidorProprio ? customApiKey : (env.EVOLUTION_API_KEY || '').trim();
  const proxyOrigin = (env.ALLOWED_PROXY_ORIGIN || 'http://localhost:5173').trim();

  if (!evoUrl || !evoKey) {
    return {
      status: 503,
      payload: {
        sucesso: false,
        conectado: false,
        instancia: evoInstance,
        mensagem:
          'Servidor de WhatsApp ainda não configurado. Informe a URL e API Key da empresa em Configurações > WhatsApp ou nas variáveis globais (EVOLUTION_API_URL / EVOLUTION_API_KEY).',
      },
    };
  }

  const evoHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: evoKey,
    Origin: proxyOrigin,
  };

  function formatarNumeroJid(jid?: string | null): string | undefined {
    if (!jid) return undefined;
    const digitos = jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') || '';
    if (!digitos) return undefined;
    if (digitos.startsWith('55') && digitos.length === 13) {
      return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
    }
    if (digitos.startsWith('55') && digitos.length === 12) {
      return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 8)}-${digitos.slice(8)}`;
    }
    return `+${digitos}`;
  }

  try {
    if (action === 'status') {
      if (usuarioRow.perfil !== 'admin' && usuarioRow.perfil !== 'super_admin') {
        return { status: 403, payload: { sucesso: false, mensagem: 'Apenas administradores podem consultar o estado do serviço.' } };
      }

      const resp = await fetch(`${evoUrl}/instance/connectionState/${encodeURIComponent(evoInstance)}`, {
        method: 'GET',
        headers: evoHeaders,
      });

      // 404 significa que a instância exclusiva desta empresa ainda não foi criada/pareada
      if (resp.status === 404) {
        return {
          status: 200,
          payload: {
            sucesso: true,
            conectado: false,
            estado: 'close',
            instancia: evoInstance,
            servidorDedicado: usandoServidorProprio,
            mensagem: `Instância exclusiva (${evoInstance}) pronta para primeiro pareamento.`,
          },
        };
      }

      if (!resp.ok) {
        return {
          status: 200,
          payload: {
            sucesso: false,
            conectado: false,
            estado: 'indisponivel',
            instancia: evoInstance,
            servidorDedicado: usandoServidorProprio,
            mensagem: 'Serviço WhatsApp indisponível no momento.',
          },
        };
      }

      const data: any = await resp.json().catch(() => ({}));
      const estado = data?.instance?.state || data?.state || 'close';
      const conectado = estado === 'open';

      let numeroConectado: string | undefined;
      let perfilConectado: string | undefined;

      if (conectado) {
        try {
          const infoResp = await fetch(
            `${evoUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(evoInstance)}`,
            { method: 'GET', headers: evoHeaders }
          );
          if (infoResp.ok) {
            const infoData: any = await infoResp.json().catch(() => null);
            const item = Array.isArray(infoData)
              ? infoData.find((i: any) => (i?.name || i?.instance?.instanceName) === evoInstance) || infoData[0]
              : infoData?.instance || infoData;
            const ownerRaw = item?.ownerJid || item?.owner || item?.number || item?.instance?.owner;
            numeroConectado = formatarNumeroJid(ownerRaw);
            perfilConectado = item?.profileName || item?.instance?.profileName || undefined;
          }
        } catch {
          // Metadados opcionais da conta conectada
        }
      }

      return {
        status: 200,
        payload: {
          sucesso: true,
          conectado,
          estado,
          instancia: evoInstance,
          servidorDedicado: usandoServidorProprio,
          numeroConectado,
          perfilConectado,
        },
      };
    }

    if (action === 'qrcode') {
      if (usuarioRow.perfil !== 'admin' && usuarioRow.perfil !== 'super_admin') {
        return { status: 403, payload: { sucesso: false, mensagem: 'Apenas administradores podem gerar QR Code de pareamento.' } };
      }

      let resp = await fetch(`${evoUrl}/instance/connect/${encodeURIComponent(evoInstance)}`, {
        method: 'GET',
        headers: evoHeaders,
      });

      // Se a instância exclusiva desta empresa ainda não existe na Evolution API, provisiona automaticamente!
      if (resp.status === 404) {
        const createResp = await fetch(`${evoUrl}/instance/create`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            instanceName: evoInstance,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });

        if (createResp.ok) {
          const createData: any = await createResp.json().catch(() => ({}));
          const createdQr = createData?.qrcode?.base64 || createData?.base64 || null;
          if (createdQr) {
            return {
              status: 200,
              payload: {
                sucesso: true,
                conectado: false,
                instancia: evoInstance,
                base64: createdQr,
                mensagem: `Instância exclusiva "${evoInstance}" criada! Escaneie o QR Code com o WhatsApp desta farmácia.`,
              },
            };
          }
          // Caso não tenha vindo no create, solicita o connect logo em seguida
          resp = await fetch(`${evoUrl}/instance/connect/${encodeURIComponent(evoInstance)}`, {
            method: 'GET',
            headers: evoHeaders,
          });
        }
      }

      if (!resp.ok) {
        return {
          status: 502,
          payload: {
            sucesso: false,
            instancia: evoInstance,
            mensagem: 'Não foi possível solicitar pareamento ao serviço WhatsApp desta empresa.',
          },
        };
      }

      const data: any = await resp.json().catch(() => ({}));
      if (data?.instance?.state === 'open') {
        return {
          status: 200,
          payload: {
            sucesso: true,
            conectado: true,
            instancia: evoInstance,
            mensagem: 'O WhatsApp desta empresa já está conectado.',
          },
        };
      }

      const qrBase64 = data?.base64 || data?.qrcode?.base64 || null;
      return {
        status: 200,
        payload: {
          sucesso: Boolean(qrBase64),
          conectado: false,
          instancia: evoInstance,
          base64: qrBase64,
          mensagem: qrBase64 ? 'QR Code exclusivo gerado com sucesso.' : 'Aguardando geração do QR Code pelo serviço.',
        },
      };
    }

    if (action === 'disconnect') {
      if (usuarioRow.perfil !== 'admin' && usuarioRow.perfil !== 'super_admin') {
        return { status: 403, payload: { sucesso: false, mensagem: 'Apenas administradores podem desconectar o WhatsApp da loja.' } };
      }

      const logoutResp = await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(evoInstance)}`, {
        method: 'DELETE',
        headers: evoHeaders,
      });

      if (!logoutResp.ok && logoutResp.status !== 404) {
        return {
          status: 502,
          payload: {
            sucesso: false,
            instancia: evoInstance,
            mensagem: 'Não foi possível desconectar a sessão atual. Tente novamente em instantes.',
          },
        };
      }

      return {
        status: 200,
        payload: {
          sucesso: true,
          conectado: false,
          estado: 'close',
          instancia: evoInstance,
          mensagem: `Conta de WhatsApp desconectada da instância "${evoInstance}". Você já pode parear outro aparelho!`,
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
  const clientIp =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    req.socket?.remoteAddress ||
    'unknown-ip';

  const ipCheck = verificarRateLimitMemoria(`wa_ip:${clientIp}`, 35, 60_000);
  if (!ipCheck.permitido) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', String(ipCheck.retryAfterSec));
    res.end(
      JSON.stringify({
        sucesso: false,
        conectado: false,
        mensagem: `Limite de segurança da API excedido para este IP. Aguarde ${ipCheck.retryAfterSec}s.`,
      })
    );
    return;
  }

  let parsedBody: ProxyRequestBody = {};
  if (req.body && typeof req.body === 'object') {
    const rawStr = JSON.stringify(req.body);
    if (rawStr.length > MAX_WHATSAPP_BODY_BYTES) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ sucesso: false, mensagem: 'Payload excede o tamanho máximo permitido (32 KB).' }));
      return;
    }
    parsedBody = req.body;
  } else if (typeof req.body === 'string') {
    if (req.body.length > MAX_WHATSAPP_BODY_BYTES) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ sucesso: false, mensagem: 'Payload excede o tamanho máximo permitido (32 KB).' }));
      return;
    }
    try {
      parsedBody = JSON.parse(req.body);
    } catch {
      parsedBody = {};
    }
  } else {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_WHATSAPP_BODY_BYTES) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ sucesso: false, mensagem: 'Payload excede o tamanho máximo permitido (32 KB).' }));
        return;
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
  const result = await processWhatsAppProxyRequest(req.method, authHeader, parsedBody, process.env as ProxyEnv);

  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (result.status === 429) {
    res.setHeader('Retry-After', '15');
  }
  res.end(JSON.stringify(result.payload));
}
