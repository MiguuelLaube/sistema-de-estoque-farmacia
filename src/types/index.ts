export type PerfilUsuario = 'super_admin' | 'admin' | 'operador' | 'comprador';

export type StatusEncomenda = 'Aguardando' | 'Pedido Feito' | 'Chegou' | 'Entregue' | 'Cancelada';
export type StatusCompra = 'Aguardando' | 'Pedido Feito' | 'Chegou';
export type SituacaoPagamento = 'Não pago' | 'Parcial' | 'Pago';
export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'convenio' | 'outros';

export interface Tenant {
  id: string;
  nome_empresa: string;
  slug: string;
  dominio?: string;
  status: 'ativo' | 'suspenso' | 'cancelado';
  plano: 'basico' | 'profissional' | 'enterprise';
  limite_encomendas_mes: number;
  criado_em: string;
  atualizado_em: string;
}

export interface ConfigTenant {
  tenant_id: string;
  nome_sistema: string;
  logo_url?: string;
  cor_primaria: string;
  cor_secundaria: string;
  modelo_cupom: string;
  fuso: string;
  mensagem_whatsapp: string;
  base_legal_padrao: string;
  bloquear_entrega_com_saldo: boolean;
  dias_retencao_arquivamento: number;
}

export interface Usuario {
  id: string;
  tenant_id?: string | null;
  auth_user_id?: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  excluido_em?: string | null;
  criado_em: string;
}

export interface Cliente {
  id: string;
  tenant_id: string;
  nome: string;
  cpf?: string;
  cpf_hash?: string;
  telefone: string;
  endereco?: string;
  consentimento_em?: string;
  base_legal: string;
  arquivado_em?: string | null;
  excluido_em?: string | null;
  criado_em: string;
  // Campos calculados para listagem rápida
  encomendas_count?: number;
  total_em_aberto?: number;
}

export interface Classificacao {
  id: string;
  tenant_id: string;
  nome: string;
  ordem: number;
  criado_em: string;
}

export interface Fornecedor {
  id: string;
  tenant_id: string;
  nome: string;
  cnpj?: string;
  contato?: string;
  telefone?: string;
  email?: string;
  excluido_em?: string | null;
  criado_em: string;
}

export interface CompraItem {
  id: string;
  tenant_id: string;
  descricao: string;
  descricao_normalizada: string;
  classificacao_id?: string;
  fornecedor_id?: string;
  quantidade: number;
  preco_custo: number;
  status: StatusCompra;
  urgente: boolean;
  controlado: boolean;
  origem: 'manual' | 'xml';
  atributos: Record<string, any>;
  arquivado_em?: string | null;
  criado_em: string;
  atualizado_em: string;
  // Joins enriquecidos
  classificacao?: Classificacao;
  fornecedor?: Fornecedor;
  encomendas_vinculadas_count?: number;
}

export interface EncomendaItem {
  id: string;
  tenant_id: string;
  encomenda_id: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  classificacao_id?: string;
  controlado: boolean;
  urgente: boolean;
  compra_item_id?: string;
  atributos: Record<string, any>;
  status_item: StatusCompra;
  criado_em: string;
  classificacao?: Classificacao;
}

export interface Encomenda {
  id: string;
  tenant_id: string;
  cliente_id: string;
  codigo_rastreio?: string;
  status: StatusEncomenda;
  valor_total: number;
  valor_pago: number;
  situacao_pagamento: SituacaoPagamento;
  observacao?: string;
  criado_por?: string;
  entregue_por?: string;
  entregue_em?: string;
  entregue_com_saldo_devedor: boolean;
  arquivada_em?: string | null;
  criado_em: string;
  atualizado_em: string;
  // Relacionamentos carregados
  cliente?: Cliente;
  itens?: EncomendaItem[];
  pagamentos?: Pagamento[];
}

export interface Pagamento {
  id: string;
  tenant_id: string;
  encomenda_id: string;
  valor: number;
  forma: FormaPagamento;
  tipo: 'pagamento' | 'estorno';
  motivo_estorno?: string;
  registrado_por?: string;
  data: string;
  criado_em: string;
  registrado_por_usuario?: Usuario;
}

export interface EventoHistorico {
  id: string;
  tenant_id: string;
  entidade: string;
  entidade_id: string;
  acao: string;
  usuario_id?: string;
  usuario_nome?: string;
  dados_antes?: Record<string, any>;
  dados_depois?: Record<string, any>;
  criado_em: string;
}

export interface LogAuditoria {
  id: string;
  tenant_id: string;
  usuario_id?: string;
  acao: string;
  recurso: string;
  justificativa?: string;
  ip?: string;
  criado_em: string;
}
