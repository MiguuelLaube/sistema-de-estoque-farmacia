/**
 * SCRIPT DE MIGRAÇÃO E CARGA DE DADOS LEGADOS: BASE44 -> NOVO SISTEMA MÃE
 * 
 * Executa a extração, transformação e carga (ETL) dos dados legados:
 * 1. Converte nomes para UPPERCASE
 * 2. Limpa dígitos de telefone e valida máscaras BR
 * 3. Corrige o defeito arquitetural nº 3 do Base44 (recalcula total = quantidade * preco_unitario)
 * 4. Atribui tenant_id e chaves compostas
 * 5. Gera arquivo SQL 'supabase/migrations/20261020000005_base44_seed_import.sql'
 * 
 * Uso:
 *   npx tsx scripts/migrate-base44.ts [--file=caminho/arquivo.json] [--tenant=uuid]
 */

import fs from 'fs';
import path from 'path';

interface Base44Customer {
  id?: string;
  name: string;
  phone?: string;
  cpf?: string;
}

interface Base44OrderItem {
  name: string;
  quantity?: number;
  price?: number;
  status?: string;
}

interface Base44Order {
  id?: string;
  customer_name: string;
  phone?: string;
  status?: string;
  paid?: boolean;
  notes?: string;
  employee_name?: string;
  created_at?: string;
  items?: Base44OrderItem[];
}

interface Base44PurchaseItem {
  name: string;
  classification?: string;
  quantity?: number;
  status?: string;
  urgent?: boolean;
}

interface Base44ExportPayload {
  customers?: Base44Customer[];
  orders?: Base44Order[];
  purchase_items?: Base44PurchaseItem[];
}

// Configurações padrão
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'; // Drogaria Aeroporto Matriz
const DEFAULT_OUTPUT_SQL = path.resolve(process.cwd(), 'supabase/migrations/20261020000005_base44_seed_import.sql');

function cleanDigits(val?: string): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

function escapeSql(val?: string): string {
  if (val === undefined || val === null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

function generateMigrationSQL(payload: Base44ExportPayload, tenantId: string): string {
  let sql = `-- ====================================================================
-- MIGRAÇÃO DE DADOS LEGADOS: DROGARIA AEROPORTO (BASE44)
-- Gerado automaticamente pelo script ETL scripts/migrate-base44.ts
-- Data de geração: ${new Date().toISOString()}
-- Tenant Alvo: ${tenantId}
-- ====================================================================

-- 1. Inserção de Clientes
`;

  const customers = payload.customers || [];
  if (customers.length > 0) {
    for (const c of customers) {
      const nomeNorm = c.name.trim().toUpperCase();
      const rawTel = cleanDigits(c.phone);
      const telFormat = rawTel.length >= 10 
        ? (rawTel.length === 11 
            ? `(${rawTel.slice(0,2)}) ${rawTel.slice(2,7)}-${rawTel.slice(7)}` 
            : `(${rawTel.slice(0,2)}) ${rawTel.slice(2,6)}-${rawTel.slice(6)}`)
        : (c.phone || '');
      const rawCpf = cleanDigits(c.cpf);
      const cpfVal = rawCpf.length === 11 ? rawCpf : null;

      sql += `INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('${tenantId}', ${escapeSql(nomeNorm)}, ${escapeSql(telFormat)}, ${escapeSql(cpfVal || undefined)}, 'consentimento')
ON CONFLICT DO NOTHING;\n`;
    }
  }

  // 2. Inserção de Itens de Compras
  const purchases = payload.purchase_items || [];
  if (purchases.length > 0) {
    sql += `\n-- 2. Inserção de Itens da Lista de Compras\n`;
    for (const p of purchases) {
      const nomeNorm = p.name.trim().toUpperCase();
      const classif = (p.classification || 'GERAL').trim().toUpperCase();
      const qtd = p.quantity && p.quantity > 0 ? p.quantity : 1;
      const status = p.status || 'Pendente';
      const urgente = !!p.urgent;

      sql += `INSERT INTO item_compra (tenant_id, nome, classificacao, quantidade, status, urgente)
VALUES ('${tenantId}', ${escapeSql(nomeNorm)}, ${escapeSql(classif)}, ${qtd}, ${escapeSql(status)}, ${urgente})
ON CONFLICT DO NOTHING;\n`;
    }
  }

  // 3. Inserção de Encomendas & Itens (com correção do cálculo de total)
  const orders = payload.orders || [];
  if (orders.length > 0) {
    sql += `\n-- 3. Inserção de Encomendas e Itens com Total Corrigido\n`;
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const orderId = `enc-b44-${(i + 1).toString().padStart(4, '0')}`;
      const status = o.status || 'Aguardando';
      const items = o.items || [];
      
      // Correção do defeito da Base44: Total é a soma de (quantidade * preco)
      const totalAmount = items.reduce((acc, it) => {
        const q = it.quantity && it.quantity > 0 ? it.quantity : 1;
        const p = it.price && it.price > 0 ? it.price : 0;
        return acc + (q * p);
      }, 0);

      const valorPago = o.paid ? totalAmount : 0;
      const statusFin = o.paid ? 'pago' : 'nao_pago';

      sql += `
-- Encomenda ${orderId} (${o.customer_name})
INSERT INTO encomenda (id, tenant_id, codigo_encomenda, status_geral, status_financeiro, valor_total, valor_pago, observacoes, criado_em)
VALUES ('${orderId}', '${tenantId}', 'ENC-${1000 + i}', ${escapeSql(status)}, '${statusFin}', ${totalAmount.toFixed(2)}, ${valorPago.toFixed(2)}, ${escapeSql(o.notes)}, '${o.created_at || new Date().toISOString()}')
ON CONFLICT DO NOTHING;
`;

      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const itemId = `${orderId}-it-${j + 1}`;
        const itemQtd = it.quantity && it.quantity > 0 ? it.quantity : 1;
        const itemPrice = it.price && it.price > 0 ? it.price : 0;
        const itemStatus = it.status || status;

        sql += `INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao_produto, quantidade, preco_unitario, status_item)
VALUES ('${itemId}', '${tenantId}', '${orderId}', ${escapeSql(it.name.trim().toUpperCase())}, ${itemQtd}, ${itemPrice.toFixed(2)}, ${escapeSql(itemStatus)})
ON CONFLICT DO NOTHING;\n`;
      }
    }
  }

  return sql;
}

// Execução
async function run() {
  console.log('====================================================');
  console.log('MIGRATION ETL: DROGARIA AEROPORTO (BASE44 -> NOVO SAAS)');
  console.log('====================================================');

  const args = process.argv.slice(2);
  let filePath = '';
  let tenantId = DEFAULT_TENANT_ID;

  for (const arg of args) {
    if (arg.startsWith('--file=')) filePath = arg.replace('--file=', '');
    if (arg.startsWith('--tenant=')) tenantId = arg.replace('--tenant=', '');
  }

  let payload: Base44ExportPayload;

  if (filePath && fs.existsSync(filePath)) {
    console.log(`Carregando arquivo legado: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    payload = JSON.parse(raw);
  } else {
    console.log('Nenhum arquivo externo fornecido. Gerando carga com amostra representativa da Base44...');
    payload = {
      customers: [
        { name: 'MARIA APARECIDA DA SILVA', phone: '11987654321', cpf: '12345678901' },
        { name: 'JOAO CARLOS PEREIRA', phone: '11976543210', cpf: '23456789012' },
        { name: 'ANA CLAUDIA SANTOS', phone: '11965432109' },
        { name: 'ROBERTO ALMEIDA COSTA', phone: '11954321098' },
        { name: 'FERNANDA LIMA SOUZA', phone: '11943210987' },
      ],
      purchase_items: [
        { name: 'DIPIRONA 500MG 20ML GOTAS', classification: 'GENERICO', quantity: 15, status: 'Pendente', urgent: true },
        { name: 'AMOXICILINA 500MG 21 CAPS', classification: 'ANTIBIOTICO', quantity: 8, status: 'Pendente', urgent: false },
        { name: 'LOSARTANA POTASSICA 50MG 30 COMP', classification: 'GENERICO', quantity: 20, status: 'Pendente', urgent: true },
        { name: 'DORFLEX 36 COMPRIMIDOS', classification: 'REFERENCIA', quantity: 12, status: 'Pendente', urgent: false },
      ],
      orders: [
        {
          customer_name: 'MARIA APARECIDA DA SILVA',
          phone: '11987654321',
          status: 'Aguardando',
          paid: false,
          notes: 'Cliente ligou pedindo urgência para amanhã cedo',
          employee_name: 'Carlos Santos',
          created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          items: [
            { name: 'OZEMPIC 1MG CANETA INJETAVEL', quantity: 1, price: 980.00, status: 'Aguardando' },
            { name: 'AGULHAS NOVOFINE 31G 100 UNID', quantity: 1, price: 85.00, status: 'Aguardando' },
          ],
        },
        {
          customer_name: 'JOAO CARLOS PEREIRA',
          phone: '11976543210',
          status: 'Chegou',
          paid: true,
          notes: 'Pago adiantado via PIX',
          employee_name: 'Mariana Lima',
          created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
          items: [
            { name: 'RIVOTRIL 2MG 30 COMPRIMIDOS', quantity: 2, price: 32.50, status: 'Chegou' },
          ],
        },
      ],
    };
  }

  const generatedSql = generateMigrationSQL(payload, tenantId);
  fs.writeFileSync(DEFAULT_OUTPUT_SQL, generatedSql, 'utf-8');

  console.log(`✅ Script de migração gerado com sucesso em:`);
  console.log(`   ${DEFAULT_OUTPUT_SQL}`);
  console.log(`\nResumo de registros processados:`);
  console.log(`- Clientes: ${(payload.customers || []).length}`);
  console.log(`- Itens de Compra: ${(payload.purchase_items || []).length}`);
  console.log(`- Encomendas: ${(payload.orders || []).length}`);
  console.log('\nPronto para executar no Supabase SQL Editor!');
}

run().catch((err) => {
  console.error('Erro na execução do script ETL:', err);
  process.exit(1);
});
