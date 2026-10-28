import type { CompraItem } from '../types';

export interface ProdutoExtraidoXml {
  id: string;
  nomeOriginal: string;
  nomeNormalizado: string;
  quantidade?: number;
  tipoMatch: 'exato' | 'aproximado' | 'nao_encontrado';
  itemCorrespondente?: CompraItem;
  sugestoesAproximadas: Array<{ item: CompraItem; score: number }>;
  selecionado: boolean;
}

// Remove acentos e caracteres especiais
export function removerAcentos(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normaliza nome do produto removendo concentrações e unidades comuns (ex: 500mg, 10ml, etc.)
export function normalizarNomeProduto(texto: string): string {
  if (!texto) return '';

  let norm = removerAcentos(texto).toUpperCase().trim();

  // Remove padrões de concentração: 500MG, 10ML, 1G, 0,5MG, 25MCG, etc.
  norm = norm.replace(/\b\d+([.,]\d+)?\s*(MG|ML|G|MCG|UI|KG|MG\/ML|%)\b/gi, '');
  // Remove apresentações comuns de embalagem: C/ 30 COMP, CX 28 CAPS, GTS, FRASCO, etc.
  norm = norm.replace(/\b(C\/|CX|COM)\s*\d+\s*(COMP|CAPS|CPS|CP|SACHES|AMP|ENV|FLAC)?\b/gi, '');
  norm = norm.replace(/\b(COMPRIMIDOS|COMPRIMIDO|CAPSULAS|CAPSULA|GOTAS|POMADA|CREME|XAROPE|SOLUCAO|SUSPENSAO)\b/gi, '');

  // Remove pontuações e limpa espaços
  norm = norm.replace(/[^A-Z0-9\s]/g, ' ');
  norm = norm.replace(/\s+/g, ' ').trim();

  return norm;
}

// Calcula score de similaridade entre duas strings com maior peso no primeiro token (Documento Seção 3 / Pág. 9)
export function calcularSimilaridadeTokens(strA: string, strB: string): number {
  const tokensA = normalizarNomeProduto(strA).split(' ').filter(Boolean);
  const tokensB = normalizarNomeProduto(strB).split(' ').filter(Boolean);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Primeiro token tem peso 3x
  let pontos = 0;
  let pesoTotal = (tokensA.length - 1) + 3;

  if (tokensA[0] === tokensB[0]) {
    pontos += 3;
  } else if (tokensB.includes(tokensA[0])) {
    pontos += 1.5;
  }

  for (let i = 1; i < tokensA.length; i++) {
    if (tokensB.includes(tokensA[i])) {
      pontos += 1;
    }
  }

  return Math.min(1, pontos / pesoTotal);
}

// Leitor no navegador via DOMParser (Documento Seção 3 / Pág. 9)
export function parsearXmlNfe(xmlConteudo: string): Array<{ nome: string; quantidade?: number }> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlConteudo, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Arquivo XML inválido ou mal formatado.');
  }

  const produtosEncontrados: Array<{ nome: string; quantidade?: number }> = [];
  const nomesVistos = new Set<string>();

  // 1. Estratégia Principal: tags de produtos da NF-e padrão (<det><prod><xProd>)
  const prodNodes = xmlDoc.querySelectorAll('prod, produto, medicamento');
  if (prodNodes.length > 0) {
    prodNodes.forEach((prod) => {
      const xProd = prod.querySelector('xProd, nome, descricao, desc');
      const qCom = prod.querySelector('qCom, qTrib, quantidade, qtd');

      if (xProd && xProd.textContent) {
        const nome = xProd.textContent.trim();
        const qtd = qCom && qCom.textContent ? parseFloat(qCom.textContent) : undefined;

        if (nome && !nomesVistos.has(nome.toUpperCase())) {
          nomesVistos.add(nome.toUpperCase());
          produtosEncontrados.push({ nome, quantidade: qtd });
        }
      }
    });
  }

  // 2. Fallback caso seja outro formato XML com tags de item
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

// Executa correspondência de produtos extraídos contra o estoque de compras
export function correlacionarProdutos(
  itensExtraidos: Array<{ nome: string; quantidade?: number }>,
  itensEstoque: CompraItem[]
): ProdutoExtraidoXml[] {
  // Apenas itens que ainda não estão 'Chegou'
  const estoquePendente = itensEstoque.filter((item) => item.status !== 'Chegou');

  return itensExtraidos.map((ext, idx) => {
    const nomeNormExt = normalizarNomeProduto(ext.nome);

    // 1. Comparação exata
    const matchExato = estoquePendente.find((est) => {
      const estNorm = normalizarNomeProduto(est.descricao);
      return estNorm === nomeNormExt && estNorm.length > 0;
    });

    if (matchExato) {
      return {
        id: `match-${idx}`,
        nomeOriginal: ext.nome,
        nomeNormalizado: nomeNormExt,
        quantidade: ext.quantidade,
        tipoMatch: 'exato',
        itemCorrespondente: matchExato,
        sugestoesAproximadas: [],
        selecionado: true,
      };
    }

    // 2. Correspondência aproximada com cálculo de pontuação
    const sugestoes: Array<{ item: CompraItem; score: number }> = [];

    estoquePendente.forEach((est) => {
      const score = calcularSimilaridadeTokens(ext.nome, est.descricao);
      if (score >= 0.4) {
        sugestoes.push({ item: est, score });
      }
    });

    sugestoes.sort((a, b) => b.score - a.score);

    if (sugestoes.length > 0) {
      return {
        id: `match-${idx}`,
        nomeOriginal: ext.nome,
        nomeNormalizado: nomeNormExt,
        quantidade: ext.quantidade,
        tipoMatch: 'aproximado',
        itemCorrespondente: sugestoes[0].item, // Pré-seleciona a de maior pontuação
        sugestoesAproximadas: sugestoes,
        selecionado: false, // Requer confirmação manual pelo operador
      };
    }

    return {
      id: `match-${idx}`,
      nomeOriginal: ext.nome,
      nomeNormalizado: nomeNormExt,
      quantidade: ext.quantidade,
      tipoMatch: 'nao_encontrado',
      sugestoesAproximadas: [],
      selecionado: false,
    };
  });
}
