import { initialUsuarios } from '../src/data/mockData.ts';
import type { Usuario } from '../src/types/index.ts';

console.log('================================================================');
console.log('🧪 BATERIA DE TESTES AUTOMATIZADOS: FLUXO DE SENHA PROVISÓRIA');
console.log('================================================================\n');

export interface TestResult {
  nome: string;
  passou: boolean;
  detalhe: string;
}

const resultados: TestResult[] = [];

// 1. Função de geração idêntica à do store
function gerarSenhaProvisoriaAmigavel(): string {
  const prefixos = ['EncoMed', 'Pharma', 'MedGestor', 'Drogaria'];
  const prefixo = prefixos[Math.floor(Math.random() * prefixos.length)];
  const pin = Math.floor(1000 + Math.random() * 9000);
  return `${prefixo}@${pin}`;
}

// Simulador de autenticação e governança de senha provisória
interface ContextoSessao {
  autenticado: boolean;
  usuario: Usuario | null;
  exigeTrocaSenha: boolean;
  erro?: string;
}

function simularLoginComSenha(
  usuario: Usuario,
  senhaInformada: string,
  senhaCorreta: string
): ContextoSessao {
  // 1. Verificação de credencial
  if (senhaInformada !== senhaCorreta) {
    return {
      autenticado: false,
      usuario: null,
      exigeTrocaSenha: false,
      erro: 'Identificador corporativo ou senha incorretos. Verifique suas credenciais.',
    };
  }

  // 2. Verificação de expiração temporal de senha provisória
  if (usuario.senha_provisoria_ativa && usuario.senha_provisoria_expira_em) {
    const expiraEm = new Date(usuario.senha_provisoria_expira_em).getTime();
    if (!Number.isNaN(expiraEm) && Date.now() > expiraEm) {
      return {
        autenticado: false,
        usuario: null,
        exigeTrocaSenha: false,
        erro: 'Sua senha provisória de acesso expirou. Solicite ao administrador a emissão de uma nova senha de primeiro acesso.',
      };
    }
  }

  // 3. Determinação da flag de primeiro acesso
  const exigeTroca = Boolean(usuario.exigir_troca_senha || usuario.senha_provisoria_ativa);

  return {
    autenticado: true,
    usuario: { ...usuario, exigir_troca_senha: exigeTroca },
    exigeTrocaSenha: exigeTroca,
  };
}

// ==============================================================================
// EXECUÇÃO DOS TESTES
// ==============================================================================

// TESTE 1: Geração de Senha Provisória com Entropia e Formato Válidos
const senhaGerada = gerarSenhaProvisoriaAmigavel();
const regexSenhaValida = /^(EncoMed|Pharma|MedGestor|Drogaria)@[0-9]{4}$/;
const teste1Valido = regexSenhaValida.test(senhaGerada) && senhaGerada.length >= 10;
resultados.push({
  nome: 'Geração de Senha Provisória Válida',
  passou: teste1Valido,
  detalhe: `Senha gerada: "${senhaGerada}" (atende aos requisitos de prefixo corporativo, @ e 4 dígitos).`,
});

// Mock de usuário para os testes
const mockGestor: Usuario = {
  id: 'u-teste-provisoria-001',
  tenant_id: 'a0000000-0000-0000-0000-000000000001',
  auth_user_id: 'auth-user-001',
  nome: 'Gestor Teste Farmácia',
  email: 'gestor.teste@drogaria.com.br',
  perfil: 'admin',
  ativo: true,
  exigir_troca_senha: true,
  senha_provisoria_ativa: true,
  senha_provisoria_expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias no futuro
  criado_em: new Date().toISOString(),
};

// TESTE 2: Login com Senha Provisória Correta (Primeiro Acesso Obrigatório)
const loginSucesso = simularLoginComSenha(mockGestor, senhaGerada, senhaGerada);
const teste2Valido =
  loginSucesso.autenticado === true &&
  loginSucesso.exigeTrocaSenha === true &&
  loginSucesso.usuario?.email === mockGestor.email;
resultados.push({
  nome: 'Login Bem-Sucedido com Senha Provisória',
  passou: teste2Valido,
  detalhe: `Autenticado com sucesso! Flag de primeiro acesso exigida: ${loginSucesso.exigeTrocaSenha}.`,
});

// TESTE 3: Rejeição de Senha Provisória Incorreta
const loginSenhaErrada = simularLoginComSenha(mockGestor, 'SenhaIncorreta@9999', senhaGerada);
const teste3Valido =
  loginSenhaErrada.autenticado === false &&
  loginSenhaErrada.usuario === null &&
  loginSenhaErrada.erro?.includes('incorretos');
resultados.push({
  nome: 'Rejeição de Senha Incorreta',
  passou: !!teste3Valido,
  detalhe: `Tentativa barrada com retorno seguro: "${loginSenhaErrada.erro}".`,
});

// TESTE 4: Rejeição de Senha Provisória Expirada
const mockGestorExpirado: Usuario = {
  ...mockGestor,
  senha_provisoria_expira_em: new Date(Date.now() - 3600 * 1000).toISOString(), // expirou há 1 hora
};
const loginExpirado = simularLoginComSenha(mockGestorExpirado, senhaGerada, senhaGerada);
const teste4Valido =
  loginExpirado.autenticado === false &&
  loginExpirado.usuario === null &&
  loginExpirado.erro?.includes('expirou');
resultados.push({
  nome: 'Rejeição de Senha Provisória Expirada',
  passou: !!teste4Valido,
  detalhe: `Tentativa barrada com mensagem explicativa: "${loginExpirado.erro}".`,
});

// TESTE 5: Conclusão do Primeiro Acesso e Transição para Senha Definitiva
const usuarioAposTroca: Usuario = {
  ...mockGestor,
  exigir_troca_senha: false,
  senha_provisoria_ativa: false,
  senha_provisoria_expira_em: null,
};
const novaSenhaDefinitiva = 'MinhaNovaSenhaForte@2026';
const loginComSenhaDefinitiva = simularLoginComSenha(
  usuarioAposTroca,
  novaSenhaDefinitiva,
  novaSenhaDefinitiva
);
const teste5Valido =
  loginComSenhaDefinitiva.autenticado === true &&
  loginComSenhaDefinitiva.exigeTrocaSenha === false;
resultados.push({
  nome: 'Transição para Senha Definitiva (Sem Trava de Primeiro Acesso)',
  passou: teste5Valido,
  detalhe: `Usuário autenticado com nova senha definitiva; modal de primeiro acesso não é mais disparado.`,
});

// ==============================================================================
// RELATÓRIO FINAL
// ==============================================================================
let todosPassaram = true;
for (const r of resultados) {
  const icon = r.passou ? '✅ PASSOU' : '❌ FALHOU';
  console.log(`${icon} - [${r.nome}]`);
  console.log(`   Detalhe: ${r.detalhe}\n`);
  if (!r.passou) todosPassaram = false;
}

if (todosPassaram) {
  console.log('🎉 TODOS OS TESTES DO FLUXO DE SENHA PROVISÓRIA PASSARAM COM 100% DE SUCESSO!');
  process.exit(0);
} else {
  console.error('⚠️ ALGUNS TESTES FALHARAM.');
  process.exit(1);
}

