-- ====================================================================
-- SISTEMA MÃE DE ENCOMENDAS MULTI-TENANT
-- Migração 01: Extensões, Esquema Base e Tabelas com Chaves Compostas
-- ====================================================================

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- 2. Tabela de Tenants (Plano de controle da plataforma)
CREATE TABLE IF NOT EXISTS tenant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_empresa VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    dominio VARCHAR(255) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'cancelado')),
    plano VARCHAR(30) NOT NULL DEFAULT 'basico' CHECK (plano IN ('basico', 'profissional', 'enterprise')),
    limite_encomendas_mes INTEGER NOT NULL DEFAULT 300,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Configurações por Tenant (1:1 com Tenant)
CREATE TABLE IF NOT EXISTS config_tenant (
    tenant_id UUID PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
    nome_sistema VARCHAR(255) NOT NULL DEFAULT 'Sistema de Encomendas',
    logo_url TEXT,
    cor_primaria VARCHAR(50) NOT NULL DEFAULT '#2563eb',
    cor_secundaria VARCHAR(50) NOT NULL DEFAULT '#1e293b',
    modelo_cupom VARCHAR(50) NOT NULL DEFAULT 'padrao',
    fuso VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
    mensagem_whatsapp TEXT NOT NULL DEFAULT 'Olá, {cliente}! Seu pedido de {medicamento} chegou na farmácia e já está disponível para retirada.',
    base_legal_padrao VARCHAR(100) NOT NULL DEFAULT 'execucao_contrato',
    bloquear_entrega_com_saldo BOOLEAN NOT NULL DEFAULT false,
    dias_retencao_arquivamento INTEGER NOT NULL DEFAULT 90,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Usuários do Sistema
CREATE TABLE IF NOT EXISTS usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenant(id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    perfil VARCHAR(50) NOT NULL CHECK (perfil IN ('super_admin', 'admin', 'operador', 'comprador')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    excluido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_usuario_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_usuario_email_por_tenant UNIQUE (tenant_id, email)
);

-- 5. Clientes
CREATE TABLE IF NOT EXISTS cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    cpf_hash VARCHAR(64),
    telefone VARCHAR(30) NOT NULL,
    endereco TEXT,
    consentimento_em TIMESTAMPTZ,
    base_legal VARCHAR(100) DEFAULT 'execucao_contrato',
    arquivado_em TIMESTAMPTZ,
    excluido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cliente_tenant_id UNIQUE (tenant_id, id)
);

-- 6. Classificações (Categorias de Compras / Encomendas gerenciadas pelo Admin)
CREATE TABLE IF NOT EXISTS classificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_classificacao_tenant_id UNIQUE (tenant_id, id)
);

-- 7. Fornecedores
CREATE TABLE IF NOT EXISTS fornecedor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(30),
    contato VARCHAR(255),
    telefone VARCHAR(30),
    email VARCHAR(255),
    excluido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_fornecedor_tenant_id UNIQUE (tenant_id, id)
);

-- 8. Itens de Compra (Lista consolidada de reposição da farmácia)
CREATE TABLE IF NOT EXISTS compra_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    descricao_normalizada VARCHAR(255) NOT NULL,
    classificacao_id UUID,
    fornecedor_id UUID,
    quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
    preco_custo NUMERIC(10, 2) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Aguardando', 'Pedido Feito', 'Chegou')),
    urgente BOOLEAN NOT NULL DEFAULT false,
    controlado BOOLEAN NOT NULL DEFAULT false,
    origem VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'xml')),
    atributos JSONB NOT NULL DEFAULT '{}'::jsonb,
    arquivado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_compra_item_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_compra_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES classificacao(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_compra_fornecedor FOREIGN KEY (tenant_id, fornecedor_id) REFERENCES fornecedor(tenant_id, id) ON DELETE SET NULL
);

-- 9. Encomendas (Pedidos feitos por Clientes)
CREATE TABLE IF NOT EXISTS encomenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL,
    codigo_rastreio VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Aguardando', 'Pedido Feito', 'Chegou', 'Entregue', 'Cancelada')),
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_pago NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    situacao_pagamento VARCHAR(20) GENERATED ALWAYS AS (
        CASE
            WHEN valor_pago >= valor_total AND valor_total > 0 THEN 'Pago'
            WHEN valor_pago > 0 THEN 'Parcial'
            ELSE 'Não pago'
        END
    ) STORED,
    observacao TEXT,
    criado_por UUID,
    entregue_por UUID,
    entregue_em TIMESTAMPTZ,
    entregue_com_saldo_devedor BOOLEAN NOT NULL DEFAULT false,
    arquivada_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_encomenda_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_encomenda_cliente FOREIGN KEY (tenant_id, cliente_id) REFERENCES cliente(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_encomenda_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES usuario(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_encomenda_entregue_por FOREIGN KEY (tenant_id, entregue_por) REFERENCES usuario(tenant_id, id) ON DELETE SET NULL
);

-- 10. Itens da Encomenda (Vínculo N:1 com CompraItem)
CREATE TABLE IF NOT EXISTS encomenda_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    encomenda_id UUID NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    preco_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(10, 2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    classificacao_id UUID,
    controlado BOOLEAN NOT NULL DEFAULT false,
    urgente BOOLEAN NOT NULL DEFAULT false,
    compra_item_id UUID,
    atributos JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_item VARCHAR(30) NOT NULL DEFAULT 'Aguardando' CHECK (status_item IN ('Aguardando', 'Pedido Feito', 'Chegou')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_encomenda_item_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_item_encomenda FOREIGN KEY (tenant_id, encomenda_id) REFERENCES encomenda(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_item_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES classificacao(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_item_compra FOREIGN KEY (tenant_id, compra_item_id) REFERENCES compra_item(tenant_id, id) ON DELETE SET NULL
);

-- 11. Pagamentos de Encomendas (Histórico financeiro detalhado)
CREATE TABLE IF NOT EXISTS pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    encomenda_id UUID NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    forma VARCHAR(30) NOT NULL CHECK (forma IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'convenio', 'outros')),
    tipo VARCHAR(20) NOT NULL DEFAULT 'pagamento' CHECK (tipo IN ('pagamento', 'estorno')),
    motivo_estorno TEXT,
    registrado_por UUID,
    data TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pagamento_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_pagamento_encomenda FOREIGN KEY (tenant_id, encomenda_id) REFERENCES encomenda(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_pagamento_registrado_por FOREIGN KEY (tenant_id, registrado_por) REFERENCES usuario(tenant_id, id) ON DELETE SET NULL
);

-- 12. Histórico de Eventos (Trilha de modificações com dados antes/depois)
CREATE TABLE IF NOT EXISTS evento_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    entidade VARCHAR(50) NOT NULL,
    entidade_id UUID NOT NULL,
    acao VARCHAR(50) NOT NULL,
    usuario_id UUID,
    usuario_nome VARCHAR(255),
    dados_antes JSONB,
    dados_depois JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Log de Auditoria e Conformidade LGPD
CREATE TABLE IF NOT EXISTS log_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    usuario_id UUID,
    acao VARCHAR(100) NOT NULL,
    recurso VARCHAR(255) NOT NULL,
    justificativa TEXT,
    ip VARCHAR(50),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Registro de Importações XML (Notas Fiscais de Entrada)
CREATE TABLE IF NOT EXISTS importacao_xml (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    arquivo_ref VARCHAR(255) NOT NULL,
    chave_nfe VARCHAR(50),
    fornecedor_nome VARCHAR(255),
    total_itens INTEGER NOT NULL DEFAULT 0,
    resultado JSONB,
    criado_por UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_importacao_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES usuario(tenant_id, id) ON DELETE SET NULL
);

-- 15. Registro de Notificações Enviadas (WhatsApp wa.me)
CREATE TABLE IF NOT EXISTS notificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    encomenda_id UUID NOT NULL,
    canal VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    enviada_por UUID,
    enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_notificacao_encomenda FOREIGN KEY (tenant_id, encomenda_id) REFERENCES encomenda(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_notificacao_enviada_por FOREIGN KEY (tenant_id, enviada_por) REFERENCES usuario(tenant_id, id) ON DELETE SET NULL
);

-- ====================================================================
-- Índices de Otimização (Sempre iniciando por tenant_id)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_cliente_tenant_busca ON cliente(tenant_id, nome, telefone) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_cpf_hash ON cliente(tenant_id, cpf_hash) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_encomenda_tenant_status ON encomenda(tenant_id, status, arquivada_em);
CREATE INDEX IF NOT EXISTS idx_encomenda_cliente ON encomenda(tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_encomenda_item_encomenda ON encomenda_item(tenant_id, encomenda_id);
CREATE INDEX IF NOT EXISTS idx_encomenda_item_compra ON encomenda_item(tenant_id, compra_item_id);
CREATE INDEX IF NOT EXISTS idx_compra_item_tenant_status ON compra_item(tenant_id, status, arquivado_em);
CREATE INDEX IF NOT EXISTS idx_compra_item_desc_norm ON compra_item(tenant_id, descricao_normalizada, classificacao_id);
CREATE INDEX IF NOT EXISTS idx_pagamento_tenant_encomenda ON pagamento(tenant_id, encomenda_id);
CREATE INDEX IF NOT EXISTS idx_evento_historico_entidade ON evento_historico(tenant_id, entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_tenant ON log_auditoria(tenant_id, criado_em DESC);
