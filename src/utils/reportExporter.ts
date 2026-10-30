/**
 * Motor Nativo de Exportação Gerencial (.xlsx Office Open XML & .pdf PDF 1.4)
 * 100% Client-Side / Zero-CDN — Compatível com Content-Security-Policy (CSP) restrita.
 */

export type TipoColunaRelatorio = 'texto' | 'moeda' | 'inteiro' | 'data';

export interface ColunaRelatorio {
  cabecalho: string;
  largura?: number; // Largura aproximada em caracteres (Excel) / peso proporcional (PDF)
  alinhamento?: 'left' | 'center' | 'right';
  tipo?: TipoColunaRelatorio;
}

export interface CardResumoRelatorio {
  rotulo: string;
  valor: string;
}

export interface OpcoesRelatorioExportacao {
  nomeArquivoBase: string;
  tituloRelatorio: string;
  subtituloRelatorio?: string;
  nomeLoja: string;
  corPrimariaHex?: string;
  orientacaoPdf?: 'retrato' | 'paisagem';
  resumoCards?: CardResumoRelatorio[];
  colunas: ColunaRelatorio[];
  linhas: Array<Array<string | number | null | undefined>>;
  linhaTotais?: Array<string | number | null | undefined>;
  notaRodape?: string;
}

// ============================================================================
// UTILITÁRIOS COMUNS (DOWNLOAD, CORES, ESCAPE XML)
// ============================================================================

function dispararDownloadBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function limparHexCor(hex?: string, padrao = '2563EB'): string {
  const limpo = (hex || '').replace(/[^0-9a-fA-F]/g, '');
  if (limpo.length === 6) return limpo.toUpperCase();
  if (limpo.length === 3) {
    return limpo
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  return padrao;
}

function hexParaRgb01(hex?: string): [number, number, number] {
  const c = limparHexCor(hex);
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))];
}

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Remove caracteres de controle inválidos no XML 1.0
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// ============================================================================
// 1. GERADOR NATIVO EXCEL (.XLSX - OFFICE OPEN XML + ZIP STORE CRC-32)
// ============================================================================

const TABELA_CRC32 = (() => {
  const tab = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tab[n] = c >>> 0;
  }
  return tab;
})();

function calcularCrc32(dados: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < dados.length; i++) {
    crc = TABELA_CRC32[(crc ^ dados[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function empacotarZipStore(arquivos: Array<{ nome: string; conteudo: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const partesLocais: Uint8Array[] = [];
  const partesCentrais: Uint8Array[] = [];
  let offsetAtual = 0;

  for (const arq of arquivos) {
    const nomeBytes = enc.encode(arq.nome);
    const dados = arq.conteudo;
    const crc = calcularCrc32(dados);

    // Local File Header (30 bytes + nome)
    const localHeader = new Uint8Array(30 + nomeBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // method 0 = STORE
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dados.length, true);
    lv.setUint32(22, dados.length, true);
    lv.setUint16(26, nomeBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nomeBytes, 30);

    partesLocais.push(localHeader, dados);

    // Central Directory Header (46 bytes + nome)
    const centralHeader = new Uint8Array(46 + nomeBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nomeBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offsetAtual, true);
    centralHeader.set(nomeBytes, 46);

    partesCentrais.push(centralHeader);
    offsetAtual += localHeader.length + dados.length;
  }

  const tamanhoCentral = partesCentrais.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, arquivos.length, true);
  ev.setUint16(10, arquivos.length, true);
  ev.setUint32(12, tamanhoCentral, true);
  ev.setUint32(16, offsetAtual, true);
  ev.setUint16(20, 0, true);

  const totalBytes = offsetAtual + tamanhoCentral + 22;
  const saida = new Uint8Array(totalBytes);
  let pos = 0;
  for (const p of partesLocais) {
    saida.set(p, pos);
    pos += p.length;
  }
  for (const p of partesCentrais) {
    saida.set(p, pos);
    pos += p.length;
  }
  saida.set(eocd, pos);
  return saida;
}

function indiceParaColunaExcel(idx0: number): string {
  let n = idx0 + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export function gerarBytesExcelXlsx(opcoes: OpcoesRelatorioExportacao): Uint8Array {
  const enc = new TextEncoder();
  const corHex = limparHexCor(opcoes.corPrimariaHex, '2563EB');
  const dataEmissao = new Date().toLocaleString('pt-BR');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Relatorio EncoMed" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Estilos:
  // s=0: Padrão
  // s=1: Título principal (Negrito 14pt)
  // s=2: Subtítulo / Metadados (Cinza 10pt)
  // s=3: Cabeçalho da Tabela (Fundo Cor Primária, Texto Branco Negrito)
  // s=4: Célula Texto com borda suave
  // s=5: Célula Moeda R$ #,##0.00 com borda suave
  // s=6: Célula Inteiro #,##0 com borda suave
  // s=7: Linha de Totais Texto Negrito Fundo Cinza Claro
  // s=8: Linha de Totais Moeda Negrito Fundo Cinza Claro
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&quot;R$&quot;\ #,##0.00"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${corHex}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

  // Definição de largura das colunas
  const colsXml = opcoes.colunas
    .map((c, idx) => {
      const w = Math.max(12, Math.min(60, c.largura || 22));
      return `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`;
    })
    .join('');

  const xmlRows: string[] = [];
  let rowNum = 1;

  // Linha 1: Título
  xmlRows.push(
    `<row r="${rowNum}" ht="22" customHeight="1"><c r="A${rowNum}" s="1" t="inlineStr"><is><t>${escaparXml(
      `${opcoes.nomeLoja} — ${opcoes.tituloRelatorio}`
    )}</t></is></c></row>`
  );
  rowNum++;

  // Linha 2: Subtítulo + Data de emissão
  const sub = opcoes.subtituloRelatorio
    ? `${opcoes.subtituloRelatorio} | Emitido em ${dataEmissao}`
    : `Emitido em ${dataEmissao} via EncoMed SaaS`;
  xmlRows.push(
    `<row r="${rowNum}"><c r="A${rowNum}" s="2" t="inlineStr"><is><t>${escaparXml(sub)}</t></is></c></row>`
  );
  rowNum++;

  // Cards de resumo opcionais
  if (opcoes.resumoCards && opcoes.resumoCards.length > 0) {
    const resumoStr = opcoes.resumoCards.map((k) => `${k.rotulo}: ${k.valor}`).join('   •   ');
    xmlRows.push(
      `<row r="${rowNum}"><c r="A${rowNum}" s="7" t="inlineStr"><is><t>${escaparXml(resumoStr)}</t></is></c></row>`
    );
    rowNum++;
  }

  // Linha em branco de respiro
  xmlRows.push(`<row r="${rowNum}"/>`);
  rowNum++;

  // Cabeçalho da Tabela
  const celulasHeader = opcoes.colunas
    .map((col, cIdx) => {
      const ref = `${indiceParaColunaExcel(cIdx)}${rowNum}`;
      return `<c r="${ref}" s="3" t="inlineStr"><is><t>${escaparXml(col.cabecalho)}</t></is></c>`;
    })
    .join('');
  xmlRows.push(`<row r="${rowNum}" ht="20" customHeight="1">${celulasHeader}</row>`);
  rowNum++;

  // Linhas de Dados
  for (const linha of opcoes.linhas) {
    const celulas = opcoes.colunas
      .map((col, cIdx) => {
        const ref = `${indiceParaColunaExcel(cIdx)}${rowNum}`;
        const bruto = linha[cIdx];
        if (typeof bruto === 'number' && Number.isFinite(bruto)) {
          const estilo = col.tipo === 'moeda' ? 5 : col.tipo === 'inteiro' ? 6 : 4;
          return `<c r="${ref}" s="${estilo}" t="n"><v>${bruto}</v></c>`;
        }
        const texto = bruto === null || bruto === undefined ? '' : String(bruto);
        return `<c r="${ref}" s="4" t="inlineStr"><is><t>${escaparXml(texto)}</t></is></c>`;
      })
      .join('');
    xmlRows.push(`<row r="${rowNum}">${celulas}</row>`);
    rowNum++;
  }

  // Linha de Totais opcional
  if (opcoes.linhaTotais && opcoes.linhaTotais.length > 0) {
    const celulasTotal = opcoes.colunas
      .map((col, cIdx) => {
        const ref = `${indiceParaColunaExcel(cIdx)}${rowNum}`;
        const bruto = opcoes.linhaTotais?.[cIdx];
        if (typeof bruto === 'number' && Number.isFinite(bruto)) {
          const estilo = col.tipo === 'moeda' ? 8 : 7;
          return `<c r="${ref}" s="${estilo}" t="n"><v>${bruto}</v></c>`;
        }
        const texto = bruto === null || bruto === undefined ? '' : String(bruto);
        return `<c r="${ref}" s="7" t="inlineStr"><is><t>${escaparXml(texto)}</t></is></c>`;
      })
      .join('');
    xmlRows.push(`<row r="${rowNum}" ht="19" customHeight="1">${celulasTotal}</row>`);
    rowNum++;
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${xmlRows.join('')}</sheetData>
</worksheet>`;

  return empacotarZipStore([
    { nome: '[Content_Types].xml', conteudo: enc.encode(contentTypesXml) },
    { nome: '_rels/.rels', conteudo: enc.encode(relsXml) },
    { nome: 'xl/workbook.xml', conteudo: enc.encode(workbookXml) },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: enc.encode(workbookRelsXml) },
    { nome: 'xl/styles.xml', conteudo: enc.encode(stylesXml) },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: enc.encode(sheetXml) },
  ]);
}

export function exportarRelatorioExcel(opcoes: OpcoesRelatorioExportacao): string {
  const bytes = gerarBytesExcelXlsx(opcoes);
  const dataStr = new Date().toISOString().slice(0, 10);
  const nomeArquivo = `${opcoes.nomeArquivoBase}_${dataStr}.xlsx`;
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  dispararDownloadBlob(blob, nomeArquivo);
  return nomeArquivo;
}

// ============================================================================
// 2. GERADOR NATIVO PDF 1.4 (WINANSI ENCODING - ACENTUAÇÃO PT-BR COMPLETA)
// ============================================================================

const MAPA_WIN1252_ESPECIAL: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function escaparTextoPdfWinAnsi(texto: string): string {
  let out = '';
  const limpo = (texto || '').replace(/\r?\n/g, ' ');
  for (let i = 0; i < limpo.length; i++) {
    const code = limpo.charCodeAt(i);
    let byte = 0x3f; // '?'
    if (code >= 0x20 && code <= 0x7e) {
      byte = code;
    } else if (code >= 0xa0 && code <= 0xff) {
      byte = code;
    } else if (MAPA_WIN1252_ESPECIAL[code] !== undefined) {
      byte = MAPA_WIN1252_ESPECIAL[code];
    } else {
      // Remove emojis ou símbolos fora do WinAnsi suavemente
      continue;
    }

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      out += '\\' + String.fromCharCode(byte);
    } else if (byte < 0x20 || byte > 0x7e) {
      out += '\\' + byte.toString(8).padStart(3, '0');
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

function truncarTextoPorLargura(texto: string, larguraPts: number, fontSize: number): string {
  const mediaChar = fontSize * 0.51;
  const maxChars = Math.max(4, Math.floor((larguraPts - 10) / mediaChar));
  const str = (texto || '').trim();
  if (str.length <= maxChars) return str;
  return str.slice(0, Math.max(1, maxChars - 2)) + '..';
}

function formatarCelulaPdf(valor: string | number | null | undefined, tipo?: TipoColunaRelatorio): string {
  if (valor === null || valor === undefined) return '-';
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (tipo === 'moeda') {
      return `R$ ${valor.toFixed(2).replace('.', ',')}`;
    }
    if (tipo === 'inteiro') {
      return `${Math.round(valor)}`;
    }
    return String(valor);
  }
  return String(valor);
}

export function gerarBytesPdfRelatorio(opcoes: OpcoesRelatorioExportacao): Uint8Array {
  const paisagem = opcoes.orientacaoPdf === 'paisagem';
  const pageW = paisagem ? 841.89 : 595.28;
  const pageH = paisagem ? 595.28 : 841.89;
  const marginX = 34;
  const contentW = pageW - marginX * 2;
  const [rP, gP, bP] = hexParaRgb01(opcoes.corPrimariaHex);
  const dataEmissao = new Date().toLocaleString('pt-BR');

  // Calcula larguras proporcionais das colunas na página PDF
  const pesos = opcoes.colunas.map((c) => Math.max(8, c.largura || 20));
  const somaPesos = pesos.reduce((a, b) => a + b, 0) || 1;
  const largurasCols = pesos.map((p) => (p / somaPesos) * contentW);

  // Paginação das linhas
  const rowH = 19;
  const rowsFirstPage = opcoes.resumoCards && opcoes.resumoCards.length > 0 ? (paisagem ? 16 : 26) : (paisagem ? 19 : 30);
  const rowsNextPages = paisagem ? 21 : 33;

  const todasLinhas: Array<{ dados: Array<string | number | null | undefined>; isTotal?: boolean }> = opcoes.linhas.map(
    (l) => ({ dados: l })
  );
  if (opcoes.linhaTotais && opcoes.linhaTotais.length > 0) {
    todasLinhas.push({ dados: opcoes.linhaTotais, isTotal: true });
  }
  if (todasLinhas.length === 0) {
    todasLinhas.push({ dados: opcoes.colunas.map((_, i) => (i === 0 ? 'Nenhum registro encontrado no período.' : '')) });
  }

  const paginas: Array<typeof todasLinhas> = [];
  let cursor = 0;
  paginas.push(todasLinhas.slice(0, rowsFirstPage));
  cursor = rowsFirstPage;
  while (cursor < todasLinhas.length) {
    paginas.push(todasLinhas.slice(cursor, cursor + rowsNextPages));
    cursor += rowsNextPages;
  }

  const streamsPaginas: string[] = [];

  paginas.forEach((linhasPag, pIdx) => {
    const cmds: string[] = [];
    let y = pageH - 34;

    // Cabeçalho Institucional Colorido
    const bannerH = pIdx === 0 ? 62 : 44;
    cmds.push(`${rP} ${gP} ${bP} rg`);
    cmds.push(`${marginX} ${y - bannerH} ${contentW} ${bannerH} re f`);

    // Textos do Banner
    cmds.push(`1 1 1 rg`);
    cmds.push(
      `BT /F2 ${pIdx === 0 ? 14 : 11} Tf ${marginX + 14} ${y - 23} Td (${escaparTextoPdfWinAnsi(
        `${opcoes.nomeLoja.toUpperCase()} — ${opcoes.tituloRelatorio}`
      )}) Tj ET`
    );

    if (pIdx === 0) {
      const sub = opcoes.subtituloRelatorio || 'Relatório Oficial Gerado pelo Sistema EncoMed SaaS';
      cmds.push(`BT /F1 8.5 Tf ${marginX + 14} ${y - 39} Td (${escaparTextoPdfWinAnsi(sub)}) Tj ET`);
      cmds.push(
        `BT /F1 8 Tf ${marginX + 14} ${y - 52} Td (${escaparTextoPdfWinAnsi(`Emitido em: ${dataEmissao}`)}) Tj ET`
      );
    } else {
      cmds.push(
        `BT /F1 8 Tf ${marginX + 14} ${y - 36} Td (${escaparTextoPdfWinAnsi(
          `Continuação • Emitido em ${dataEmissao}`
        )}) Tj ET`
      );
    }

    y -= bannerH + 14;

    // Cards de Resumo na Página 1
    if (pIdx === 0 && opcoes.resumoCards && opcoes.resumoCards.length > 0) {
      const cards = opcoes.resumoCards.slice(0, 4);
      const gap = 10;
      const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
      const cardH = 42;

      cards.forEach((c, cIdx) => {
        const cx = marginX + cIdx * (cardW + gap);
        cmds.push(`0.973 0.980 0.988 rg`);
        cmds.push(`0.886 0.910 0.941 RG 0.7 w`);
        cmds.push(`${cx} ${y - cardH} ${cardW} ${cardH} re B`);

        cmds.push(`0.392 0.455 0.545 rg`);
        cmds.push(
          `BT /F1 7.5 Tf ${cx + 10} ${y - 15} Td (${escaparTextoPdfWinAnsi(c.rotulo.toUpperCase())}) Tj ET`
        );

        cmds.push(`0.059 0.090 0.165 rg`);
        cmds.push(
          `BT /F2 11.5 Tf ${cx + 10} ${y - 32} Td (${escaparTextoPdfWinAnsi(
            truncarTextoPorLargura(c.valor, cardW, 11.5)
          )}) Tj ET`
        );
      });

      y -= cardH + 14;
    }

    // Cabeçalho da Tabela
    const thH = 21;
    cmds.push(`0.059 0.090 0.165 rg`); // #0f172a
    cmds.push(`${marginX} ${y - thH} ${contentW} ${thH} re f`);
    cmds.push(`1 1 1 rg`);

    let colX = marginX;
    opcoes.colunas.forEach((col, cIdx) => {
      const cw = largurasCols[cIdx];
      const txt = truncarTextoPorLargura(col.cabecalho, cw, 8.2);
      const textX =
        col.alinhamento === 'right'
          ? colX + Math.max(4, cw - txt.length * 4.4 - 6)
          : col.alinhamento === 'center'
          ? colX + Math.max(4, (cw - txt.length * 4.4) / 2)
          : colX + 6;
      cmds.push(`BT /F2 8.2 Tf ${textX.toFixed(1)} ${(y - 14).toFixed(1)} Td (${escaparTextoPdfWinAnsi(txt)}) Tj ET`);
      colX += cw;
    });

    y -= thH;

    // Linhas da Tabela
    linhasPag.forEach((itemLinha, rIdx) => {
      if (itemLinha.isTotal) {
        cmds.push(`0.945 0.961 0.976 rg`); // Destaque total
      } else if (rIdx % 2 === 1) {
        cmds.push(`0.976 0.980 0.988 rg`); // Zebra suave
      } else {
        cmds.push(`1 1 1 rg`);
      }
      cmds.push(`${marginX} ${y - rowH} ${contentW} ${rowH} re f`);

      // Linha divisória inferior
      cmds.push(`0.886 0.910 0.941 RG 0.5 w`);
      cmds.push(`${marginX} ${y - rowH} m ${marginX + contentW} ${y - rowH} l S`);

      cmds.push(`0.059 0.090 0.165 rg`);
      let cx = marginX;
      opcoes.colunas.forEach((col, cIdx) => {
        const cw = largurasCols[cIdx];
        const bruto = formatarCelulaPdf(itemLinha.dados[cIdx], col.tipo);
        const txt = truncarTextoPorLargura(bruto, cw, 8);
        const fontRef = itemLinha.isTotal ? '/F2' : '/F1';
        const textX =
          col.alinhamento === 'right'
            ? cx + Math.max(4, cw - txt.length * 4.2 - 6)
            : col.alinhamento === 'center'
            ? cx + Math.max(4, (cw - txt.length * 4.2) / 2)
            : cx + 6;
        cmds.push(
          `BT ${fontRef} 8 Tf ${textX.toFixed(1)} ${(y - 13).toFixed(1)} Td (${escaparTextoPdfWinAnsi(txt)}) Tj ET`
        );
        cx += cw;
      });

      y -= rowH;
    });

    // Rodapé da Página
    const rodapeEsq =
      opcoes.notaRodape ||
      'Documento gerencial emitido sob governança LGPD (Lei nº 13.709/2018) • EncoMed SaaS';
    const rodapeDir = `Página ${pIdx + 1} de ${paginas.length}`;

    cmds.push(`0.886 0.910 0.941 RG 0.6 w`);
    cmds.push(`${marginX} 34 m ${marginX + contentW} 34 l S`);
    cmds.push(`0.392 0.455 0.545 rg`);
    cmds.push(`BT /F1 7.5 Tf ${marginX} 22 Td (${escaparTextoPdfWinAnsi(rodapeEsq)}) Tj ET`);
    cmds.push(
      `BT /F2 7.5 Tf ${(marginX + contentW - rodapeDir.length * 4.3).toFixed(1)} 22 Td (${escaparTextoPdfWinAnsi(
        rodapeDir
      )}) Tj ET`
    );

    streamsPaginas.push(cmds.join('\n'));
  });

  // Montagem binária dos objetos PDF 1.4
  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Font F1 (Helvetica WinAnsiEncoding)
  // Obj 4: Font F2 (Helvetica-Bold WinAnsiEncoding)
  // Obj 5..N: Page + Contents pairs
  const enc = new TextEncoder();
  const objetos: string[] = [];
  const kidsRefs: string[] = [];

  objetos.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  objetos.push(''); // placeholder para Obj 2
  objetos.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`);
  objetos.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`
  );

  let nextObjId = 5;
  for (const streamContent of streamsPaginas) {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    kidsRefs.push(`${pageObjId} 0 R`);

    const streamBytesLen = enc.encode(streamContent).length;
    objetos.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(
        2
      )}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj`
    );
    objetos.push(
      `${contentObjId} 0 obj\n<< /Length ${streamBytesLen} >>\nstream\n${streamContent}\nendstream\nendobj`
    );
  }

  objetos[1] = `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs.join(' ')}] /Count ${kidsRefs.length} >>\nendobj`;

  const cabecalhoPdf = '%PDF-1.4\n';
  const partesBytes: Uint8Array[] = [enc.encode(cabecalhoPdf)];
  const offsets: number[] = [0]; // obj 0 free
  let bytePos = partesBytes[0].length;

  for (const objStr of objetos) {
    offsets.push(bytePos);
    const b = enc.encode(objStr + '\n');
    partesBytes.push(b);
    bytePos += b.length;
  }

  const xrefOffset = bytePos;
  let xrefStr = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const xrefBytes = enc.encode(xrefStr);
  partesBytes.push(xrefBytes);
  bytePos += xrefBytes.length;

  const pdfFinal = new Uint8Array(bytePos);
  let cursorOut = 0;
  for (const p of partesBytes) {
    pdfFinal.set(p, cursorOut);
    cursorOut += p.length;
  }

  return pdfFinal;
}

export function exportarRelatorioPdf(opcoes: OpcoesRelatorioExportacao): string {
  const bytes = gerarBytesPdfRelatorio(opcoes);
  const dataStr = new Date().toISOString().slice(0, 10);
  const nomeArquivo = `${opcoes.nomeArquivoBase}_${dataStr}.pdf`;
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  dispararDownloadBlob(blob, nomeArquivo);
  return nomeArquivo;
}

