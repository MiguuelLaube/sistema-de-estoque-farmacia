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
  email_admin?: string;
  status: 'ativo' | 'suspenso' | 'cancelado';
  plano: 'basico' | 'profissional' | 'enterprise';
  limite_encomendas_mes: number;
  criado_em: string;
  atualizado_em: string;
}

export interface VisualOpcoesTenant {
  estilo_sidebar?: 'claro' | 'escuro' | 'marca';
  formato_logo?: 'retangular' | 'quadrado' | 'circular';
  estilo_bordas?: 'padrao' | 'arredondado' | 'compacto';
  densidade_interface?: 'confortavel' | 'compacto' | 'amplo';
  fonte_interface?: 'jakarta' | 'inter' | 'system';
  cor_destaque?: string;
  exibir_selo_encomed?: boolean;
  animacoes_ativas?: boolean;
}

export interface ConfigTenant {
  tenant_id: string;
  nome_sistema: string;
  slogan_sistema?: string;
  saudacao_painel?: string;
  logo_url?: string;
  cor_primaria: string;
  cor_secundaria: string;
  visual_opcoes?: VisualOpcoesTenant;
  modelo_cupom: string;
  fuso: string;
  mensagem_whatsapp: string;
  mensagem_whatsapp_pedido?: string;
  mensagem_whatsapp_cobranca?: string;
  mensagem_whatsapp_entregue?: string;
  auto_whatsapp_pedido?: boolean;
  auto_whatsapp_entregue?: boolean;
  base_legal_padrao: string;
  bloquear_entrega_com_saldo: boolean;
  dias_retencao_arquivamento: number;
  ocultar_medicamentos_notificacao?: boolean;
  // Integração WhatsApp Isolada por Empresa (Multi-Tenant) via Proxy Server-Side
  evolution_api_ativo?: boolean;
  // Nome de instância só é honrado em servidor próprio; URL/Chave ficam em tabela blindada (nunca no navegador)
  whatsapp_instance_name?: string;
  // Campos de PrintTemplate (Documento Seção 2)
  header_title?: string;
  header_subtitle?: string;
  footer_text?: string;
  show_phone?: boolean;
  show_payment?: boolean;
  show_status?: boolean;
  font_size?: number;
}

export interface SuperAdminPolitica {
  usuario_id: string;
  mfa_obrigatorio: boolean;
  restringir_ip: boolean;
  ips_permitidos: string[];
  exigir_dispositivo_confiavel: boolean;
  atualizado_em: string;
}

export interface SuperAdminDispositivo {
  id: string;
  usuario_id: string;
  nome_dispositivo: string;
  ip_registro?: string;
  user_agent?: string;
  ultimo_acesso_em: string;
  revogado_em?: string | null;
  criado_em: string;
}

export interface Funcionario {
  id: string;
  tenant_id: string;
  nome: string;
  cargo?: string;
  criado_em: string;
}

export interface ReservaItem {
  id: string;
  tenant_id: string;
  reserva_id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Reserva {
  id: string;
  tenant_id: string;
  customer_name: string;
  phone?: string;
  medications: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  amount_paid: number;
  paid: boolean;
  notes?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Usuario {
  id: string;
  tenant_id?: string | null;
  auth_user_id?: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  exigir_troca_senha?: boolean;
  senha_provisoria_ativa?: boolean;
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
  historico?: Array<{ employee_name: string; action: string; timestamp: string }>;
  cliente_avisado?: boolean;
  cliente_avisado_em?: string;
  cliente_avisado_por?: string;
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
  tenant_id: string | null;
  usuario_id?: string | null;
  acao: string;
  recurso: string;
  justificativa?: string;
  ip?: string;
  nivel?: string;
  visivel_tenant?: boolean;
  criado_em: string;
}
