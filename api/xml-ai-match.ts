import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

export interface ItemXmlEntrada {
  idXml: string;
  nome: string;
  ean?: string;
  codigo?: string;
  quantidade?: number;
}

export interface ItemPendenteEntrada {
  id: string;
  descricao: string;
  quantidade?: number;
}

export interface XmlAiMatchRequestBody {
  itensXml?: ItemXmlEntrada[];
  itensPendentes?: ItemPendenteEntrada[];
}

export interface XmlAiMatchEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ALLOWED_PROXY_ORIGIN?: string;
}

export interface ResultadoMatchIa {
  idXml: string;
  compraItemId: string | null;
  confianca: number; // 0 a 1
  autoSelecionar: boolean;
  alertaDosagem: boolean;
  motivoIa: string;
  alternativas: Array<{ compraItemId: string; confianca: number }>;
}

// ============================================================================
// DICIONÁRIO FARMACÊUTICO BRASILEIRO (ABREVIAÇÕES DE DISTRIBUIDORAS & SINÔNIMOS)
// ============================================================================

const EXPANSOES_ABREVIACOES_NFE: Array<[RegExp, string]> = [
  [/\bLOSART\b/g, 'LOSARTANA'],
  [/\bPOT\b/g, 'POTASSICA'],
  [/\bDIPIR\b/g, 'DIPIRONA'],
  [/\bMONO\b/g, 'MONOIDRATADA'],
  [/\bPARACET\b/g, 'PARACETAMOL'],
  [/\bAMOX\b/g, 'AMOXICILINA'],
  [/\bCLAV\b/g, 'CLAVULANATO'],
  [/\bAZITRO\b/g, 'AZITROMICINA'],
  [/\bCLORIDR\b|\bCLOR\b|\bHCL\b/g, 'CLORIDRATO'],
  [/\bSOD\b/g, 'SODICA'],
  [/\bROSUV\b/g, 'ROSUVASTATINA'],
  [/\bATORV\b/g, 'ATORVASTATINA'],
  [/\bSINVAST\b/g, 'SINVASTATINA'],
  [/\bESCITAL\b/g, 'ESCITALOPRAM'],
  [/\bCITALOP\b/g, 'CITALOPRAM'],
  [/\bMETFORM\b/g, 'METFORMINA'],
  [/\bLEVOTIROX\b/g, 'LEVOTIROXINA'],
  [/\bPANTOP\b/g, 'PANTOPRAZOL'],
  [/\bOMEP\b/g, 'OMEPRAZOL'],
  [/\bESOMEP\b/g, 'ESOMEPRAZOL'],
  [/\bIBUPROF\b/g, 'IBUPROFENO'],
  [/\bNIMESUL\b/g, 'NIMESULIDA'],
  [/\bPREGAB\b/g, 'PREGABALINA'],
  [/\bGABAP\b/g, 'GABAPENTINA'],
  [/\bCLONAZ\b/g, 'CLONAZEPAM'],
  [/\bALPRAZ\b/g, 'ALPRAZOLAM'],
  [/\bSERTRAL\b/g, 'SERTRALINA'],
  [/\bVENLAFAX\b/g, 'VENLAFAXINA'],
  [/\bDESVENLA\b/g, 'DESVENLAFAXINA'],
  [/\bINJ\b|\bINJET\b/g, 'INJETAVEL'],
  [/\bCAN\b/g, 'CANETA'],
];

const GRUPOS_EQUIVALENCIA_CLINICA: string[][] = [
  ['OZEMPIC', 'SEMAGLUTIDA'],
  ['WEGOVY', 'SEMAGLUTIDA'],
  ['RYBELSUS', 'SEMAGLUTIDA'],
  ['MOUNJARO', 'TIRZEPATIDA'],
  ['SAXENDA', 'LIRAGLUTIDA'],
  ['VICTOZA', 'LIRAGLUTIDA'],
  ['VENVANSE', 'LISDEXANFETAMINA'],
  ['RITALINA', 'METILFENIDATO'],
  ['CONCERTA', 'METILFENIDATO'],
  ['NOVALGINA', 'DIPIRONA'],
  ['TYLENOL', 'PARACETAMOL'],
  ['GLIFAGE', 'METFORMINA'],
  ['PURAN', 'EUTHYROX', 'SYNTHROID', 'LEVOTIROXINA'],
  ['RIVOTRIL', 'CLONAZEPAM'],
  ['FRONTAL', 'ALPRAZOLAM'],
  ['LEXAPRO', 'ESCITALOPRAM'],
  ['ZOLOFT', 'SERTRALINA'],
  ['ARADOIS', 'COZAAR', 'LOSARTANA'],
  ['CRESTOR', 'ROSUCA', 'ROSUVASTATINA'],
  ['LIPITOR', 'CITALOR', 'ATORVASTATINA'],
  ['SELOKEN', 'METOPROLOL'],
  ['CONCOR', 'BISOPROLOL'],
  ['XARELTO', 'RIVAROXABANA'],
  ['ELIQUIS', 'APIXABANA'],
  ['JARDIANCE', 'EMPAGLIFLOZINA'],
  ['FORXIGA', 'DAPAGLIFLOZINA'],
];

const STOPWORDS_EMBALAGEM = new Set([
  'COM',
  'C',
  'CX',
  'CAIXA',
  'COMP',
  'COMPRIMIDO',
  'COMPRIMIDOS',
  'CP',
  'CPR',
  'REV',
  'REVESTIDO',
  'CAPS',
  'CAPSULA',
  'CAPSULAS',
  'CPS',
  'FR',
  'FRASCO',
  'AMP',
  'AMPOLA',
  'GTS',
  'GOTAS',
  'SOL',
  'SOLUCAO',
  'SUSP',
  'SUSPENSAO',
  'UN',
  'UND',
  'UNID',
  'MEDLEY',
  'EMS',
  'EUROFARMA',
  'ACHE',
  'NEO',
  'QUIMICA',
  'CIMED',
  'SANOFI',
  'PFIZER',
  'NOVO',
  'NORDISK',
  'GERMED',
  'PRATI',
  'TEUTO',
  'GEN',
  'GENERICO',
]);

function removerAcentos(str: string): string {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function extrairDosagensNormalizadas(texto: string): string[] {
  const limpo = removerAcentos(texto).toUpperCase().replace(/,/g, '.');
  const regex = /(\d+(?:\.\d+)?)\s*(MCG|MG|G|UI|ML|%)/g;
  const encontrados = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(limpo)) !== null) {
    let valor = parseFloat(m[1]);
    let unid = m[2];
    if (!Number.isFinite(valor)) continue;
    // Normaliza 1G -> 1000MG para comparação exata entre 1G e 1000MG
    if (unid === 'G' && valor <= 5) {
      valor = valor * 1000;
      unid = 'MG';
    }
    if (unid === 'ML') continue; // Volume isolado costuma variar na descrição da embalagem
    encontrados.add(`${valor}${unid}`);
  }
  return Array.from(encontrados).sort();
}

function tokenizarFarmaceutico(texto: string): string[] {
  let norm = removerAcentos(texto).toUpperCase();
  norm = norm.replace(/\b\d+([.,]\d+)?\s*(MCG|MG|G|UI|ML|KG|%)\b/g, ' ');
  norm = norm.replace(/[^A-Z0-9\s]/g, ' ');
  for (const [padrao, substituto] of EXPANSOES_ABREVIACOES_NFE) {
    norm = norm.replace(padrao, substituto);
  }
  return norm
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS_EMBALAGEM.has(t));
}

function bigramasDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const map = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  let intersecao = 0;
  for (let j = 0; j < b.length - 1; j++) {
    const bg = b.slice(j, j + 2);
    const count = map.get(bg) || 0;
    if (count > 0) {
      map.set(bg, count - 1);
      intersecao++;
    }
  }
  return (2 * intersecao) / (a.length - 1 + (b.length - 1));
}

function possuemEquivalenciaClinica(tokensA: string[], tokensB: string[]): string | null {
  for (const grupo of GRUPOS_EQUIVALENCIA_CLINICA) {
    const achouA = tokensA.find((t) => grupo.includes(t));
    const achouB = tokensB.find((t) => grupo.includes(t));
    if (achouA && achouB) {
      return achouA === achouB ? achouA : `${achouA} ↔ ${achouB}`;
    }
  }
  return null;
}

export function avaliarParFarmaceutico(
  nomeXml: string,
  descEstoque: string
): { confianca: number; alertaDosagem: boolean; motivo: string } {
  const tokensXml = tokenizarFarmaceutico(nomeXml);
  const tokensEst = tokenizarFarmaceutico(descEstoque);

  if (tokensXml.length === 0 || tokensEst.length === 0) {
    return { confianca: 0, alertaDosagem: false, motivo: 'Sem termos farmacêuticos identificáveis.' };
  }

  const strXml = tokensXml.join(' ');
  const strEst = tokensEst.join(' ');

  // Pontuação de tokens + prefixo + bigramas
  let acertosTokens = 0;
  for (const tEst of tokensEst) {
    const matchDireto = tokensXml.some(
      (tXml) =>
        tXml === tEst ||
        (tXml.length >= 4 && tEst.length >= 4 && (tXml.startsWith(tEst.slice(0, 5)) || tEst.startsWith(tXml.slice(0, 5)))) ||
        bigramasDice(tXml, tEst) >= 0.8
    );
    if (matchDireto) acertosTokens++;
  }

  const coberturaEstoque = acertosTokens / tokensEst.length;
  const coberturaXml = acertosTokens / tokensXml.length;
  const diceFrase = bigramasDice(strXml, strEst);
  const primeiroIgual =
    tokensXml[0] === tokensEst[0] || bigramasDice(tokensXml[0], tokensEst[0]) >= 0.82;
  const equivalencia = possuemEquivalenciaClinica(tokensXml, tokensEst);

  let score = coberturaEstoque * 0.52 + coberturaXml * 0.18 + diceFrase * 0.3;
  if (primeiroIgual) score = Math.min(1, score + 0.18);
  if (strXml === strEst) score = 0.98;
  if (equivalencia && score < 0.78) {
    score = 0.8;
  }

  // Guardrail Clínico de Dosagem / Concentração
  const dosXml = extrairDosagensNormalizadas(nomeXml);
  const dosEst = extrairDosagensNormalizadas(descEstoque);
  let alertaDosagem = false;
  let motivo = '';

  if (dosXml.length > 0 && dosEst.length > 0) {
    const mesmaDosagem = dosEst.every((d) => dosXml.includes(d)) || dosXml.every((d) => dosEst.includes(d));
    if (mesmaDosagem) {
      if (score >= 0.45) {
        score = Math.min(0.99, score + 0.12);
      }
      motivo = `IA confirmou princípio ativo e concentração exata (${dosEst.join(' + ')}).`;
    } else if (score >= 0.55) {
      alertaDosagem = true;
      score = Math.min(score, 0.58);
      motivo = `Atenção clínica: medicamento semelhante, mas NF-e traz ${dosXml.join('/')} e o pedido exige ${dosEst.join('/')}.`;
    }
  }

  if (!motivo) {
    if (strXml === strEst) {
      motivo = 'IA identificou correspondência exata do medicamento faturado na NF-e.';
    } else if (equivalencia && !primeiroIgual) {
      motivo = `IA reconheceu equivalência farmacológica (${equivalencia}). Confira se o paciente aceita intercambiável.`;
    } else if (score >= 0.75) {
      motivo = 'IA correlacionou nomenclatura abreviada da distribuidora com o item aguardado.';
    } else if (score >= 0.5) {
      motivo = 'IA encontrou similaridade parcial na descrição; revise antes de confirmar.';
    } else {
      motivo = 'Sem correspondência compatível nos pedidos pendentes.';
    }
  }

  return {
    confianca: Number(Math.max(0, Math.min(0.99, score)).toFixed(2)),
    alertaDosagem,
    motivo,
  };
}

async function refinarComGeminiOpcional(
  apiKey: string,
  ambiguos: Array<{ idXml: string; nome: string }>,
  itensPendentes: ItemPendenteEntrada[]
): Promise<Map<string, { compraItemId: string | null; confianca: number; motivoIa: string }> | null> {
  if (!apiKey || ambiguos.length === 0 || itensPendentes.length === 0) return null;

  const prompt = [
    'Você é um farmacêutico especialista em conciliação de Notas Fiscais (NF-e) de distribuidoras de medicamentos no Brasil.',
    'Relacione cada item do XML abaixo ao item correspondente na lista de compras pendentes da farmácia.',
    'REGRA DE SEGURANÇA CLÍNICA: NUNCA aprove alta confiança se a concentração/dosagem (mg, mcg, g, UI) for diferente.',
    'Responda ESTRITAMENTE em JSON no formato: {"matches":[{"idXml":"...","compraItemId":"id ou null","confianca":0.0,"motivoIa":"explicação curta em pt-BR"}]}',
    `ITENS_XML: ${JSON.stringify(ambiguos.slice(0, 35))}`,
    `PEDIDOS_PENDENTES: ${JSON.stringify(itensPendentes.slice(0, 80))}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json().catch(() => null);
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed?.matches)) return null;

    const mapa = new Map<string, { compraItemId: string | null; confianca: number; motivoIa: string }>();
    for (const m of parsed.matches) {
      if (m && typeof m.idXml === 'string') {
        mapa.set(m.idXml, {
          compraItemId: typeof m.compraItemId === 'string' ? m.compraItemId : null,
          confianca: Math.max(0, Math.min(0.99, Number(m.confianca) || 0)),
          motivoIa: typeof m.motivoIa === 'string' ? m.motivoIa : 'Identificado via IA generativa farmacêutica.',
        });
      }
    }
    return mapa;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function processXmlAiMatchRequest(
  method: string | undefined,
  authHeader: string | undefined,
  body: XmlAiMatchRequestBody,
  env: XmlAiMatchEnv
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

  if (supabaseUrl && supabaseAnonKey) {
    const supa = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: authErr } = await supa.auth.getUser(token);
    if (authErr || !userRes?.user) {
      return { status: 401, payload: { sucesso: false, mensagem: 'Sessão inválida ou expirada.' } };
    }
  }

  const itensXml = Array.isArray(body?.itensXml) ? body.itensXml.slice(0, 200) : [];
  const itensPendentes = Array.isArray(body?.itensPendentes) ? body.itensPendentes.slice(0, 400) : [];

  const idsPendentesValidos = new Set(itensPendentes.map((p) => p.id));
  const ambiguosParaLlm: Array<{ idXml: string; nome: string }> = [];

  const preliminares: ResultadoMatchIa[] = itensXml.map((ext) => {
    const avaliacoes = itensPendentes
      .map((pend) => {
        const av = avaliarParFarmaceutico(ext.nome, pend.descricao);
        return {
          compraItemId: pend.id,
          descricao: pend.descricao,
          confianca: av.confianca,
          alertaDosagem: av.alertaDosagem,
          motivo: av.motivo,
        };
      })
      .filter((a) => a.confianca >= 0.38)
      .sort((a, b) => b.confianca - a.confianca);

    const melhor = avaliacoes[0];
    if (!melhor) {
      ambiguosParaLlm.push({ idXml: ext.idXml, nome: ext.nome });
      return {
        idXml: ext.idXml,
        compraItemId: null,
        confianca: 0,
        autoSelecionar: false,
        alertaDosagem: false,
        motivoIa: 'Medicamento da nota fiscal não consta nos pedidos pendentes atuais.',
        alternativas: [],
      };
    }

    if (melhor.confianca < 0.85 && !melhor.alertaDosagem) {
      ambiguosParaLlm.push({ idXml: ext.idXml, nome: ext.nome });
    }

    const autoSelecionar = melhor.confianca >= 0.65 && !melhor.alertaDosagem;

    return {
      idXml: ext.idXml,
      compraItemId: melhor.compraItemId,
      confianca: melhor.confianca,
      autoSelecionar,
      alertaDosagem: melhor.alertaDosagem,
      motivoIa: melhor.motivo,
      alternativas: avaliacoes.slice(0, 5).map((a) => ({
        compraItemId: a.compraItemId,
        confianca: a.confianca,
      })),
    };
  });

  // Se houver GEMINI_API_KEY no servidor, refina itens ambíguos preservando o guardrail de dosagem
  let usouLlmExterno = false;
  if (env.GEMINI_API_KEY && ambiguosParaLlm.length > 0 && itensPendentes.length > 0) {
    const refinados = await refinarComGeminiOpcional(env.GEMINI_API_KEY, ambiguosParaLlm, itensPendentes);
    if (refinados && refinados.size > 0) {
      usouLlmExterno = true;
      for (const item of preliminares) {
        const refIa = refinados.get(item.idXml);
        if (refIa && refIa.compraItemId && idsPendentesValidos.has(refIa.compraItemId)) {
          const pendAlvo = itensPendentes.find((p) => p.id === refIa.compraItemId);
          const xmlOrig = itensXml.find((x) => x.idXml === item.idXml);
          if (pendAlvo && xmlOrig) {
            const checkClinico = avaliarParFarmaceutico(xmlOrig.nome, pendAlvo.descricao);
            if (!checkClinico.alertaDosagem && refIa.confianca > item.confianca) {
              item.compraItemId = refIa.compraItemId;
              item.confianca = refIa.confianca;
              item.motivoIa = refIa.motivoIa;
              item.autoSelecionar = refIa.confianca >= 0.65;
            }
          }
        }
      }
    }
  }

  return {
    status: 200,
    payload: {
      sucesso: true,
      motorUtilizado: usouLlmExterno
        ? 'EncoMed Pharma AI + Gemini LLM'
        : 'EncoMed Pharma AI (Motor Semântico & Dosagem)',
      resultados: preliminares,
    },
  };
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  let body: XmlAiMatchRequestBody = {};
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length > 0) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = {};
      }
    }
  }

  const allowedOrigin = process.env.ALLOWED_PROXY_ORIGIN || '';
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  const result = await processXmlAiMatchRequest(req.method, authHeader, body, process.env as XmlAiMatchEnv);

  res.statusCode = result.status;
  res.end(JSON.stringify(result.payload));
}
