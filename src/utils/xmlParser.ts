import type { CompraItem } from '../types';
import { supabase } from '../services/supabase';

export interface ItemBrutoXmlNfe {
  nome: string;
  quantidade?: number;
  ean?: string;
  codigo?: string;
}

export interface MetadadosXmlNfe {
  fornecedorNome?: string;
  numeroNota?: string;
}

export interface ProdutoExtraidoXml {
  id: string;
  nomeOriginal: string;
  nomeNormalizado: string;
  quantidade?: number;
  ean?: string;
  codigo?: string;
  tipoMatch: 'exato' | 'ia_semantico' | 'aproximado' | 'nao_encontrado';
  confiancaIa: number;
  motivoIa: string;
  alertaDosagem: boolean;
  identificadoPorIa: boolean;
  itemCorrespondente?: CompraItem;
  sugestoesAproximadas: Array<{ item: CompraItem; score: number }>;
  selecionado: boolean;
}

// Remove acentos e caracteres especiais
export function removerAcentos(str: string): string {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const ABREVIACOES_DISTRIBUIDORAS: Array<[RegExp, string]> = [
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
  [/\bMETFORM\b/g, 'METFORMINA'],
  [/\bLEVOTIROX\b/g, 'LEVOTIROXINA'],
  [/\bPANTOP\b/g, 'PANTOPRAZOL'],
  [/\bOMEP\b/g, 'OMEPRAZOL'],
  [/\bINJ\b|\bINJET\b/g, 'INJETAVEL'],
];

const SINONIMOS_PRINCIPIO_ATIVO: string[][] = [
  ['OZEMPIC', 'SEMAGLUTIDA'],
  ['WEGOVY', 'SEMAGLUTIDA'],
  ['RYBELSUS', 'SEMAGLUTIDA'],
  ['MOUNJARO', 'TIRZEPATIDA'],
  ['VENVANSE', 'LISDEXANFETAMINA'],
  ['RITALINA', 'CONCERTA', 'METILFENIDATO'],
  ['NOVALGINA', 'DIPIRONA'],
  ['TYLENOL', 'PARACETAMOL'],
  ['GLIFAGE', 'METFORMINA'],
  ['PURAN', 'EUTHYROX', 'LEVOTIROXINA'],
  ['RIVOTRIL', 'CLONAZEPAM'],
  ['LEXAPRO', 'ESCITALOPRAM'],
  ['ARADOIS', 'LOSARTANA'],
  ['CRESTOR', 'ROSUCA', 'ROSUVASTATINA'],
  ['XARELTO', 'RIVAROXABANA'],
  ['JARDIANCE', 'EMPAGLIFLOZINA'],
  ['FORXIGA', 'DAPAGLIFLOZINA'],
];

// Normaliza nome do produto removendo concentrações e unidades de embalagem
export function normalizarNomeProduto(texto: string): string {
  if (!texto) return '';

  let norm = removerAcentos(texto).toUpperCase().trim();
  norm = norm.replace(/\b\d+([.,]\d+)?\s*(MG|ML|G|MCG|UI|KG|MG\/ML|%)\b/gi, '');
  norm = norm.replace(/\b(C\/|CX|COM)\s*\d+\s*(COMP|CAPS|CPS|CP|SACHES|AMP|ENV|FLAC)?\b/gi, '');
  norm = norm.replace(
    /\b(COMPRIMIDOS|COMPRIMIDO|CAPSULAS|CAPSULA|GOTAS|POMADA|CREME|XAROPE|SOLUCAO|SUSPENSAO|MEDLEY|EMS|EUROFARMA|CIMED|NEO QUIMICA|ACHE|GENERICO|GEN)\b/gi,
    ''
  );
  norm = norm.replace(/[^A-Z0-9\s]/g, ' ');
  for (const [padrao, exp] of ABREVIACOES_DISTRIBUIDORAS) {
    norm = norm.replace(padrao, exp);
  }
  norm = norm.replace(/\s+/g, ' ').trim();

  return norm;
}

function extrairDosagens(texto: string): string[] {
  const limpo = removerAcentos(texto).toUpperCase().replace(/,/g, '.');
  const regex = /(\d+(?:\.\d+)?)\s*(MCG|MG|G|UI|%)/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(limpo)) !== null) {
    let val = parseFloat(m[1]);
    let un = m[2];
    if (!Number.isFinite(val)) continue;
    if (un === 'G' && val <= 5) {
      val = val * 1000;
      un = 'MG';
    }
    set.add(`${val}${un}`);
  }
  return Array.from(set).sort();
}

function diceBigrams(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) || 0) + 1);
  }
  let inter = 0;
  for (let j = 0; j < b.length - 1; j++) {
    const bg = b.slice(j, j + 2);
    const c = counts.get(bg) || 0;
    if (c > 0) {
      counts.set(bg, c - 1);
      inter++;
    }
  }
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

// Calcula score de similaridade semântica farmacêutica local
export function calcularSimilaridadeTokens(strA: string, strB: string): number {
  const normA = normalizarNomeProduto(strA);
  const normB = normalizarNomeProduto(strB);
  const tokensA = normA.split(' ').filter((t) => t.length >= 2);
  const tokensB = normB.split(' ').filter((t) => t.length >= 2);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let pontos = 0;
  const pesoTotal = tokensA.length - 1 + 3;

  if (tokensA[0] === tokensB[0] || diceBigrams(tokensA[0], tokensB[0]) >= 0.82) {
    pontos += 3;
  } else if (tokensB.some((tb) => tb === tokensA[0] || diceBigrams(tb, tokensA[0]) >= 0.82)) {
    pontos += 1.8;
  }

  for (let i = 1; i < tokensA.length; i++) {
    if (tokensB.some((tb) => tb === tokensA[i] || diceBigrams(tb, tokensA[i]) >= 0.82)) {
      pontos += 1;
    }
  }

  let score = Math.min(1, pontos / pesoTotal);

  // Equivalência clínica (princípio ativo <-> marca referência)
  for (const grupo of SINONIMOS_PRINCIPIO_ATIVO) {
    const temA = tokensA.some((t) => grupo.includes(t));
    const temB = tokensB.some((t) => grupo.includes(t));
    if (temA && temB && score < 0.78) {
      score = 0.78;
    }
  }

  return Number(score.toFixed(2));
}

export function extrairMetadadosXmlNfe(xmlConteudo: string): MetadadosXmlNfe {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlConteudo, 'text/xml');
    const emitNome = xmlDoc.querySelector('emit > xNome, emit > xFant')?.textContent?.trim();
    const numNota = xmlDoc.querySelector('ide > nNF')?.textContent?.trim();
    return {
      fornecedorNome: emitNome || undefined,
      numeroNota: numNota || undefined,
    };
  } catch {
    return {};
  }
}

// Leitor no navegador via DOMParser com proteção contra XML malformado, tamanho excessivo e XXE
export function parsearXmlNfe(xmlConteudo: string): ItemBrutoXmlNfe[] {
  if (!xmlConteudo || typeof xmlConteudo !== 'string') {
    throw new Error('Conteúdo XML vazio ou inválido.');
  }
  if (xmlConteudo.length > 5 * 1024 * 1024) {
    throw new Error('O arquivo XML excede o tamanho máximo permitido (5 MB).');
  }
  if (/<!ENTITY/i.test(xmlConteudo) || /<!DOCTYPE/i.test(xmlConteudo)) {
    throw new Error('Declarações externas (DOCTYPE/ENTITY) não são permitidas por segurança.');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlConteudo, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Arquivo XML inválido ou mal formatado.');
  }

  const produtosEncontrados: ItemBrutoXmlNfe[] = [];
  const nomesVistos = new Set<string>();

  const prodNodes = xmlDoc.querySelectorAll('prod, produto, medicamento');
  if (prodNodes.length > 0) {
    prodNodes.forEach((prod) => {
      const xProd = prod.querySelector('xProd, nome, descricao, desc');
      const qCom = prod.querySelector('qCom, qTrib, quantidade, qtd');
      const cEan = prod.querySelector('cEAN, cEANTrib, ean');
      const cProd = prod.querySelector('cProd, codigo');

      if (xProd && xProd.textContent) {
        const nome = xProd.textContent.trim();
        const qtd = qCom && qCom.textContent ? parseFloat(qCom.textContent) : undefined;
        const eanRaw = cEan?.textContent?.trim();
        const ean = eanRaw && eanRaw !== 'SEM GTIN' ? eanRaw : undefined;
        const codigo = cProd?.textContent?.trim() || undefined;

        if (nome && !nomesVistos.has(nome.toUpperCase())) {
          nomesVistos.add(nome.toUpperCase());
          produtosEncontrados.push({ nome, quantidade: qtd, ean, codigo });
        }
      }
    });
  }

  if (produtosEncontrados.length === 0) {
    const itemNodes = xmlDoc.querySelectorAll('det, item, row');
    itemNodes.forEach((item) => {
      const nomeEl = item.querySelector('xProd, nome, descricao, description, title, name');
      if (nomeEl && nomeEl.textContent) {
        const nome = nomeEl.textContent.trim();
        if (nome && !nomesVistos.has(nome.toUpperCase())) {
          nomesVistos.add(nome.toUpperCase());
          produtosEncontrados.push({ nome });
        }
      }
    });
  }

  return produtosEncontrados;
}

// Correspondência local com IA semântica farmacêutica e seleção automática inteligente
export function correlacionarProdutos(
  itensExtraidos: ItemBrutoXmlNfe[],
  itensEstoque: CompraItem[]
): ProdutoExtraidoXml[] {
  const estoquePendente = itensEstoque.filter((item) => item.status !== 'Chegou');

  return itensExtraidos.map((ext, idx) => {
    const idXml = `match-${idx}`;
    const nomeNormExt = normalizarNomeProduto(ext.nome);
    const dosXml = extrairDosagens(ext.nome);

    // Avalia todos os itens pendentes
    const candidatos: Array<{
      item: CompraItem;
      score: number;
      alertaDosagem: boolean;
      exato: boolean;
      motivo: string;
    }> = [];

    for (const est of estoquePendente) {
      const estNorm = normalizarNomeProduto(est.descricao);
      const isExato = estNorm.length > 0 && estNorm === nomeNormExt;
      let score = isExato ? 0.98 : calcularSimilaridadeTokens(ext.nome, est.descricao);

      if (score < 0.4) continue;

      const dosEst = extrairDosagens(est.descricao);
      let alertaDosagem = false;
      let motivo = isExato
        ? 'IA identificou correspondência exata do medicamento faturado.'
        : 'IA reconheceu o medicamento mesmo com abreviação de distribuidora.';

      if (dosXml.length > 0 && dosEst.length > 0) {
        const compativel = dosEst.every((d) => dosXml.includes(d)) || dosXml.every((d) => dosEst.includes(d));
        if (compativel) {
          score = Math.min(0.99, score + 0.1);
          motivo = `IA validou nome e concentração exata (${dosEst.join(' + ')}).`;
        } else {
          alertaDosagem = true;
          score = Math.min(score, 0.56);
          motivo = `Atenção: NF-e indica ${dosXml.join('/')}, enquanto o pedido aguarda ${dosEst.join('/')}.`;
        }
      }

      candidatos.push({
        item: est,
        score: Number(score.toFixed(2)),
        alertaDosagem,
        exato: isExato && !alertaDosagem,
        motivo,
      });
    }

    candidatos.sort((a, b) => b.score - a.score);
    const melhor = candidatos[0];

    if (melhor) {
      const autoSelecionar = melhor.score >= 0.65 && !melhor.alertaDosagem;
      return {
        id: idXml,
        nomeOriginal: ext.nome,
        nomeNormalizado: nomeNormExt,
        quantidade: ext.quantidade,
        ean: ext.ean,
        codigo: ext.codigo,
        tipoMatch: melhor.exato ? 'exato' : melhor.score >= 0.68 ? 'ia_semantico' : 'aproximado',
        confiancaIa: melhor.score,
        motivoIa: melhor.motivo,
        alertaDosagem: melhor.alertaDosagem,
        identificadoPorIa: true,
        itemCorrespondente: melhor.item,
        sugestoesAproximadas: candidatos.map((c) => ({ item: c.item, score: c.score })),
        selecionado: autoSelecionar,
      };
    }

    return {
      id: idXml,
      nomeOriginal: ext.nome,
      nomeNormalizado: nomeNormExt,
      quantidade: ext.quantidade,
      ean: ext.ean,
      codigo: ext.codigo,
      tipoMatch: 'nao_encontrado',
      confiancaIa: 0,
      motivoIa: 'Item da nota fiscal não possui pedido aberto na lista de compras.',
      alertaDosagem: false,
      identificadoPorIa: false,
      sugestoesAproximadas: [],
      selecionado: false,
    };
  });
}

/**
 * Executa a análise de IA completa via endpoint seguro (/api/xml-ai-match),
 * selecionando automaticamente os medicamentos que chegaram, mas mantendo o status intacto até confirmação!
 */
export async function analisarXmlComIA(
  itensExtraidos: ItemBrutoXmlNfe[],
  itensEstoque: CompraItem[]
): Promise<{
  correspondencias: ProdutoExtraidoXml[];
  motorUtilizado: string;
}> {
  const baseLocal = correlacionarProdutos(itensExtraidos, itensEstoque);
  const estoquePendente = itensEstoque.filter((item) => item.status !== 'Chegou');

  if (estoquePendente.length === 0 || itensExtraidos.length === 0) {
    return {
      correspondencias: baseLocal,
      motorUtilizado: 'EncoMed Pharma AI',
    };
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return {
        correspondencias: baseLocal,
        motorUtilizado: 'EncoMed Pharma AI (Local)',
      };
    }

    const resp = await fetch('/api/xml-ai-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itensXml: itensExtraidos.map((it, idx) => ({
          idXml: `match-${idx}`,
          nome: it.nome,
          ean: it.ean,
          codigo: it.codigo,
          quantidade: it.quantidade,
        })),
        itensPendentes: estoquePendente.map((p) => ({
          id: p.id,
          descricao: p.descricao,
          quantidade: p.quantidade,
        })),
      }),
    });

    if (!resp.ok) {
      return {
        correspondencias: baseLocal,
        motorUtilizado: 'EncoMed Pharma AI',
      };
    }

    const payload = await resp.json().catch(() => null);
    if (!payload?.sucesso || !Array.isArray(payload.resultados)) {
      return {
        correspondencias: baseLocal,
        motorUtilizado: 'EncoMed Pharma AI',
      };
    }

    const mapaEstoque = new Map(estoquePendente.map((p) => [p.id, p]));
    const enriquecidos: ProdutoExtraidoXml[] = baseLocal.map((itemBase) => {
      const resIa = payload.resultados.find((r: any) => r.idXml === itemBase.id);
      if (!resIa) return itemBase;

      const itemAlvo = resIa.compraItemId ? mapaEstoque.get(resIa.compraItemId) : undefined;
      if (!itemAlvo) {
        return {
          ...itemBase,
          tipoMatch: 'nao_encontrado',
          confiancaIa: 0,
          motivoIa: resIa.motivoIa || itemBase.motivoIa,
          alertaDosagem: false,
          identificadoPorIa: false,
          itemCorrespondente: undefined,
          selecionado: false,
        };
      }

      const sugestoesApi = Array.isArray(resIa.alternativas)
        ? resIa.alternativas
          .map((alt: any) => {
            const found = mapaEstoque.get(alt.compraItemId);
            return found ? { item: found, score: Number(alt.confianca) || 0.5 } : null;
          })
          .filter(Boolean)
        : itemBase.sugestoesAproximadas;

      const confianca = Number(resIa.confianca) || itemBase.confiancaIa;
      const alertaDosagem = Boolean(resIa.alertaDosagem);
      const autoSel = Boolean(resIa.autoSelecionar) && !alertaDosagem;

      return {
        ...itemBase,
        tipoMatch: confianca >= 0.94 ? 'exato' : confianca >= 0.65 ? 'ia_semantico' : 'aproximado',
        confiancaIa: confianca,
        motivoIa: resIa.motivoIa || itemBase.motivoIa,
        alertaDosagem,
        identificadoPorIa: true,
        itemCorrespondente: itemAlvo,
        sugestoesAproximadas: sugestoesApi.length > 0 ? sugestoesApi : [{ item: itemAlvo, score: confianca }],
        selecionado: autoSel,
      };
    });

    return {
      correspondencias: enriquecidos,
      motorUtilizado: payload.motorUtilizado || 'EncoMed Pharma AI',
    };
  } catch {
    return {
      correspondencias: baseLocal,
      motorUtilizado: 'EncoMed Pharma AI',
    };
  }
}
