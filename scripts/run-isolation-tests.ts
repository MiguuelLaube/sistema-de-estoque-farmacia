import { executarTestesIsolamentoMultiTenant } from '../src/utils/isolationTests.ts';

console.log('====================================================');
console.log('EXECUTANDO BATERIA DE TESTES DE ISOLAMENTO MULTI-TENANT (Spec 6.6)');
console.log('====================================================\n');

const resultados = executarTestesIsolamentoMultiTenant();
let todosPassaram = true;

for (const res of resultados) {
  const status = res.passou ? '✅ PASSOU' : '❌ FALHOU';
  console.log(`${status} - [${res.nome}]`);
  console.log(`   Descrição: ${res.descricao}`);
  if (res.detalhe) {
    console.log(`   Detalhe:   ${res.detalhe}`);
  }
  console.log('');
  if (!res.passou) todosPassaram = false;
}

if (todosPassaram) {
  console.log('🎉 TODOS OS TESTES DE ISOLAMENTO E REGRAS DE NEGÓCIO PASSARAM COM SUCESSO!');
} else {
  console.error('⚠️ ALGUNS TESTES FALHARAM.');
  process.exit(1);
}
