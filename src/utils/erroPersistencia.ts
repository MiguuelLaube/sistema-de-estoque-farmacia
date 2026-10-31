/**
 * Traduz erros de persistência (Supabase/PostgREST/PostgreSQL) em mensagens claras
 * para o usuário final, evitando falhas silenciosas ao criar/salvar registros.
 */
export function traduzirErroPersistencia(err: unknown, acao = 'salvar o registro'): string {
  const e = (err || {}) as { code?: string; message?: string; details?: string; hint?: string };
  const code = e.code || '';
  const msg = (e.message || (typeof err === 'string' ? err : '') || '').trim();
  const lower = msg.toLowerCase();

  if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return `Permissão negada ao ${acao}. Seu usuário não está vinculado a esta empresa no banco de dados ou não tem perfil para esta operação. Saia e entre novamente; se persistir, aplique a migração 20261030000016 no Supabase.`;
  }
  if (code === '23503') {
    return `Não foi possível ${acao}: o registro referencia um dado inexistente (empresa, usuário, cliente ou categoria). Atualize a página e tente novamente.`;
  }
  if (code === '23505') {
    return `Não foi possível ${acao}: já existe um registro com os mesmos dados.`;
  }
  if (code === '23502') {
    return `Não foi possível ${acao}: há um campo obrigatório sem valor${e.message ? ` (${msg})` : ''}.`;
  }
  if (code === '23514' || code === '22P02') {
    return `Não foi possível ${acao}: algum campo possui valor em formato inválido.`;
  }
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
    return `O banco de dados está desatualizado (coluna ou tabela ausente) ao ${acao}. Aplique as migrações pendentes do Supabase. Detalhe: ${msg}`;
  }
  if (code === 'P0001' && msg) {
    return msg;
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return `Falha de conexão com o servidor ao ${acao}. Verifique sua internet e tente novamente.`;
  }
  if (lower.includes('jwt') || lower.includes('not authenticated')) {
    return `Sua sessão expirou. Entre novamente para ${acao}.`;
  }
  return msg ? `Não foi possível ${acao}: ${msg}` : `Não foi possível ${acao}. Tente novamente.`;
}

