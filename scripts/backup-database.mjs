#!/usr/bin/env node
/**
 * Script Oficial de Backup Completo e Verificado (Pré-Lançamento / Produção)
 * Uso: DATABASE_URL="postgresql://..." npm run backup:db
 *
 * Gera em ./backups/ (diretório protegido no .gitignore):
 *  1. backup_<label>_<timestamp>.json   -> Snapshot estruturado completo + metadados
 *  2. backup_<label>_<timestamp>.sql    -> Dump SQL restaurável em ordem de integridade referencial
 *  3. backup_<label>_<timestamp>.sha256 -> Manifesto criptográfico SHA-256 verificado em disco
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('../evolution-api/node_modules/pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[ERRO] Defina a variável de ambiente DATABASE_URL antes de executar o backup.');
  process.exit(1);
}

const label = process.argv[2] || 'pre_limpeza';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const rootDir = process.cwd();
const backupDir = path.join(rootDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

// Ordem topológica estrita respeitando chaves estrangeiras
const PUBLIC_TABLES_ORDERED = [
  'tenant',
  'config_tenant',
  'usuario',
  'super_admin_politica',
  'super_admin_dispositivo',
  'super_admin_break_glass',
  'seguranca_tentativa_login',
  'funcionario',
  'classificacao',
  'fornecedor',
  'cliente',
  'compra_item',
  'encomenda',
  'encomenda_item',
  'pagamento',
  'reserva',
  'reserva_item',
  'importacao_xml',
  'notificacao',
  'evento_historico',
  'log_auditoria',
];

function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'";
    return `ARRAY[${val.map((item) => sqlLiteral(item)).join(', ')}]`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function runBackup() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Descobre todas as tabelas reais em public para garantir que nenhuma tabela fique de fora
    const { rows: realTables } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const realSet = new Set(realTables.map((r) => r.tablename));
    const orderedTables = [
      ...PUBLIC_TABLES_ORDERED.filter((t) => realSet.has(t)),
      ...[...realSet].filter((t) => !PUBLIC_TABLES_ORDERED.includes(t)),
    ];

    const tablesDump = {};
    const rowCounts = {};
    const sqlLines = [
      '-- ====================================================================',
      `-- BACKUP COMPLETO VERIFICADO (${label.toUpperCase()})`,
      `-- Gerado em: ${new Date().toISOString()}`,
      '-- ====================================================================',
      'BEGIN;',
      "SET LOCAL app.allow_super_admin_setup = 'on';",
      '',
    ];

    for (const table of orderedTables) {
      const { rows } = await client.query(`SELECT * FROM public."${table}"`);
      tablesDump[table] = rows;
      rowCounts[table] = rows.length;

      sqlLines.push(`-- Tabela: public.${table} (${rows.length} registros)`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const valList = cols.map((c) => sqlLiteral(row[c])).join(', ');
        sqlLines.push(`INSERT INTO public."${table}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;`);
      }
      sqlLines.push('');
    }

    sqlLines.push('COMMIT;');

    // Metadados de contas Auth (sem hashes de senha) e sessão WhatsApp pareada
    const { rows: authUsers } = await client.query(`
      SELECT id, email, role, email_confirmed_at, last_sign_in_at, created_at, updated_at
      FROM auth.users
      ORDER BY created_at
    `);

    let evolutionInstances = [];
    try {
      const { rows: evoRows } = await client.query(`
        SELECT id, name, "connectionStatus", "ownerJid", "profileName", "createdAt", "updatedAt"
        FROM evolution_api."Instance"
      `);
      evolutionInstances = evoRows;
    } catch {
      evolutionInstances = [];
    }

    const baseName = `backup_${label}_${timestamp}`;
    const jsonPath = path.join(backupDir, `${baseName}.json`);
    const sqlPath = path.join(backupDir, `${baseName}.sql`);
    const shaPath = path.join(backupDir, `${baseName}.sha256`);

    const snapshot = {
      metadata: {
        label,
        generatedAt: new Date().toISOString(),
        schemaCount: orderedTables.length,
        totalPublicRows: Object.values(rowCounts).reduce((a, b) => a + b, 0),
        rowCounts,
      },
      authUsersSummary: authUsers,
      evolutionInstancesSummary: evolutionInstances,
      publicTables: tablesDump,
    };

    fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.writeFileSync(sqlPath, sqlLines.join('\n'), 'utf8');

    // Verificação de integridade pós-gravação (releitura + conferência de contagens + SHA-256)
    const parsedBack = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const table of orderedTables) {
      if (!Array.isArray(parsedBack.publicTables[table]) || parsedBack.publicTables[table].length !== rowCounts[table]) {
        throw new Error(`Falha na verificação de integridade da tabela ${table}`);
      }
    }

    const jsonHash = sha256File(jsonPath);
    const sqlHash = sha256File(sqlPath);
    const manifest = [
      `${jsonHash}  ${path.basename(jsonPath)}`,
      `${sqlHash}  ${path.basename(sqlPath)}`,
    ].join('\n') + '\n';
    fs.writeFileSync(shaPath, manifest, 'utf8');

    console.log(JSON.stringify({
      sucesso: true,
      arquivos: {
        json: jsonPath,
        sql: sqlPath,
        sha256: shaPath,
      },
      hashes: {
        jsonSha256: jsonHash,
        sqlSha256: sqlHash,
      },
      rowCounts,
      authUsersCount: authUsers.length,
      evolutionInstances,
    }, null, 2));
  } finally {
    await client.end();
  }
}

runBackup().catch((err) => {
  console.error('[FALHA CRÍTICA NO BACKUP]', err.message);
  process.exit(1);
});

