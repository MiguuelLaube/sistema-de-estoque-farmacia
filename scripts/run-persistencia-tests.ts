import { readFileSync } from 'node:fs';
import { traduzirErroPersistencia } from '../src/utils/erroPersistencia.ts';

console.log('================================================================');
console.log('BATERIA DE TESTES: CRIAÇÃO/GRAVAÇÃO (categorias, clientes, encomendas)');
console.log('================================================================\n');

const resultados: Array<{ nome: string; passou: boolean; detalhe: string }> = [];

function teste(nome: string, condicao: boolean, detalhe = '') {
  resultados.push({ nome, passou: condicao, detalhe });
}

// 1. Mensagens claras para cada classe de falha do PostgREST/PostgreSQL
const rls = traduzirErroPersistencia({ code: '42501', message: 'new row violates row-level security policy for table "cliente"' }, 'cadastrar o cliente');
teste('RLS (42501) gera mensagem de permissão/vínculo', rls.includes('Permissão negada') && rls.includes('20261030000016'), rls);

const fk = traduzirErroPersistencia({ code: '23503', message: 'violates foreign key constraint' }, 'registrar a encomenda');
teste('FK (23503) gera mensagem de referência inexistente', fk.includes('referencia um dado inexistente'), fk);

const dup = traduzirErroPersistencia({ code: '23505', message: 'duplicate key' }, 'cadastrar a categoria');
teste('Unicidade (23505) gera mensagem de duplicidade', dup.includes('já existe um registro'), dup);

const nn = traduzirErroPersistencia({ code: '23502', message: 'null value in column "telefone"' }, 'cadastrar o cliente');
teste('NOT NULL (23502) gera mensagem de campo obrigatório', nn.includes('campo obrigatório'), nn);

const col = traduzirErroPersistencia({ code: 'PGRST204', message: "Could not find the 'x' column of 'cliente' in the schema cache" }, 'cadastrar o cliente');
teste('Coluna ausente (PGRST204) orienta aplicar migrações', col.includes('migrações'), col);

const rede = traduzirErroPersistencia(new Error('Failed to fetch'), 'cadastrar o cliente');
teste('Falha de rede gera mensagem de conexão', rede.includes('conexão'), rede);

const generico = traduzirErroPersistencia({ message: 'algo inesperado' }, 'salvar');
teste('Erro desconhecido preserva a mensagem original (nunca silencioso)', generico.includes('algo inesperado'), generico);

const vazio = traduzirErroPersistencia(undefined, 'salvar');
teste('Erro vazio ainda produz mensagem', vazio.length > 10, vazio);

// 2. Garantias estruturais: nenhuma criação grava sem vínculo tenant/usuário e nenhuma falha é engolida
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clientes = ler('src/stores/clientes.ts');
const compras = ler('src/stores/compras.ts');
const encomendas = ler('src/stores/encomendas.ts');
const auth = ler('src/stores/auth.ts');
const migracao = ler('supabase/migrations/20261030000016_fix_criacao_registros_vinculo_tenant.sql');

teste('adicionarCliente garante vínculo antes do INSERT', /garantirVinculoBanco\(\);[\s\S]{0,200}from\('cliente'\)\.insert/.test(clientes));
teste('adicionarCliente lança erro traduzido (não engole)', /throw new Error\(mensagem\)/.test(clientes));
teste('adicionarClassificacao garante vínculo antes do INSERT', /garantirVinculoBanco\(\);[\s\S]{0,200}from\('classificacao'\)\.insert/.test(compras));
teste('adicionarClassificacao expõe erroOperacao ao falhar', /erroOperacao\.value = traduzirErroPersistencia\(err, 'cadastrar a categoria'\)/.test(compras));
teste('Novo item de compra lança erro traduzido ao falhar', /adicionar o item de compra/.test(compras));
teste('criarEncomenda garante vínculo e traduz erro', /garantirVinculoBanco/.test(encomendas) && /gravar a encomenda/.test(encomendas));
teste('Funcionário só entra na lista após persistir', /funcionario'\)\.insert[\s\S]{0,400}return null;[\s\S]{0,200}funcionarios\.value\.push\(novo\)/.test(auth));
teste('Vínculo de banco é resetado no logout', /vinculoBancoConfirmado\.value = false;/.test(auth));
teste('Migração 16 auto-provisiona admin por tenant.email_admin', /LOWER\(t\.email_admin\) = v_email/.test(migracao) && /INSERT INTO public\.usuario/.test(migracao));
teste('Migração 16 repara usuários existentes e recarrega schema', /UPDATE public\.usuario u/.test(migracao) && /NOTIFY pgrst/.test(migracao));

let ok = true;
for (const r of resultados) {
  console.log(`${r.passou ? 'PASSOU' : 'FALHOU'} - ${r.nome}${r.detalhe && !r.passou ? `\n   ${r.detalhe}` : ''}`);
  if (!r.passou) ok = false;
}
console.log(`\n${resultados.filter((r) => r.passou).length}/${resultados.length} testes passaram.`);
if (!ok) process.exit(1);

