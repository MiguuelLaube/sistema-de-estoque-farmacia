-- === 20261020000001_initial_schema.sql ===
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


-- === 20261020000002_rls_policies.sql ===
-- ====================================================================
-- SISTEMA MÃE DE ENCOMENDAS MULTI-TENANT
-- Migração 02: Funções Auxiliares e Políticas de Row Level Security (RLS)
-- ====================================================================

-- 1. Função para extrair o tenant_id ativo
-- Suporta tanto SET LOCAL app.tenant_id quanto o JWT Claim do Supabase Auth
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('app.tenant_id', true), '')::UUID,
        NULLIF((auth.jwt() -> 'app_metadata' ->> 'tenant_id'), '')::UUID,
        NULLIF((auth.jwt() -> 'user_metadata' ->> 'tenant_id'), '')::UUID
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Função para verificar se o usuário atual é Super-admin da plataforma
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'super_admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'perfil') = 'super_admin' OR
        current_setting('app.is_super_admin', true) = 'true',
        false
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Habilitação e Forçamento de RLS em todas as tabelas
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE classificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE encomenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE encomenda_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE importacao_xml ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao ENABLE ROW LEVEL SECURITY;

-- Forçar RLS mesmo para donos de tabela (garante falha fechada)
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE config_tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE usuario FORCE ROW LEVEL SECURITY;
ALTER TABLE cliente FORCE ROW LEVEL SECURITY;
ALTER TABLE classificacao FORCE ROW LEVEL SECURITY;
ALTER TABLE fornecedor FORCE ROW LEVEL SECURITY;
ALTER TABLE compra_item FORCE ROW LEVEL SECURITY;
ALTER TABLE encomenda FORCE ROW LEVEL SECURITY;
ALTER TABLE encomenda_item FORCE ROW LEVEL SECURITY;
ALTER TABLE pagamento FORCE ROW LEVEL SECURITY;
ALTER TABLE evento_historico FORCE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria FORCE ROW LEVEL SECURITY;
ALTER TABLE importacao_xml FORCE ROW LEVEL SECURITY;
ALTER TABLE notificacao FORCE ROW LEVEL SECURITY;

-- ====================================================================
-- Políticas RLS: Tenant (Plano de controle)
-- ====================================================================
CREATE POLICY tenant_isolation_select ON tenant
    FOR SELECT
    USING (id = current_tenant_id() OR is_super_admin());

CREATE POLICY tenant_superadmin_all ON tenant
    FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- ====================================================================
-- Políticas RLS: ConfigTenant
-- ====================================================================
CREATE POLICY config_tenant_select ON config_tenant
    FOR SELECT
    USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY config_tenant_update ON config_tenant
    FOR UPDATE
    USING (tenant_id = current_tenant_id() OR is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ====================================================================
-- Políticas RLS: Usuario
-- ====================================================================
CREATE POLICY usuario_tenant_all ON usuario
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ====================================================================
-- Políticas RLS: Cliente
-- ====================================================================
CREATE POLICY cliente_tenant_all ON cliente
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: Classificação
-- ====================================================================
CREATE POLICY classificacao_tenant_all ON classificacao
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ====================================================================
-- Políticas RLS: Fornecedor
-- ====================================================================
CREATE POLICY fornecedor_tenant_all ON fornecedor
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: CompraItem
-- ====================================================================
CREATE POLICY compra_item_tenant_all ON compra_item
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: Encomenda
-- ====================================================================
CREATE POLICY encomenda_tenant_all ON encomenda
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: EncomendaItem
-- ====================================================================
CREATE POLICY encomenda_item_tenant_all ON encomenda_item
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: Pagamento
-- ====================================================================
CREATE POLICY pagamento_tenant_all ON pagamento
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

-- ====================================================================
-- Políticas RLS: EventoHistorico (Apenas inserção e leitura)
-- ====================================================================
CREATE POLICY evento_historico_tenant_select ON evento_historico
    FOR SELECT
    USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY evento_historico_tenant_insert ON evento_historico
    FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ====================================================================
-- Políticas RLS: LogAuditoria
-- ====================================================================
CREATE POLICY log_auditoria_tenant_select ON log_auditoria
    FOR SELECT
    USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY log_auditoria_tenant_insert ON log_auditoria
    FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ====================================================================
-- Políticas RLS: ImportacaoXML & Notificacao
-- ====================================================================
CREATE POLICY importacao_xml_tenant_all ON importacao_xml
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());

CREATE POLICY notificacao_tenant_all ON notificacao
    FOR ALL
    USING (tenant_id = current_tenant_id() AND NOT is_super_admin())
    WITH CHECK (tenant_id = current_tenant_id() AND NOT is_super_admin());


-- === 20261020000003_triggers_and_business_rules.sql ===
-- ====================================================================
-- SISTEMA MÃE DE ENCOMENDAS MULTI-TENANT
-- Migração 03: Regras de Negócio, Vínculo Encomenda <-> Compra e Triggers
-- ====================================================================

-- 1. Função utilitária para normalização de descrições de produtos
CREATE OR REPLACE FUNCTION normalizar_descricao(texto TEXT)
RETURNS TEXT AS $$
BEGIN
    IF texto IS NULL THEN
        RETURN '';
    END IF;
    -- Remove acentos, espaços extras e coloca em maiúsculas
    RETURN UPPER(TRIM(REGEXP_REPLACE(unaccent(texto), '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Função para recalcular o status derivado de uma Encomenda
-- Regra 5.2: Menor estágio entre os itens (Aguardando < Pedido Feito < Chegou)
-- Entregue só permanece se todos estiverem Chegou e foi definido manualmente.
CREATE OR REPLACE FUNCTION recalcular_status_encomenda(p_tenant_id UUID, p_encomenda_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status_atual VARCHAR(30);
    v_total_itens INT;
    v_qtd_aguardando INT;
    v_qtd_pedido_feito INT;
    v_qtd_chegou INT;
    v_novo_status VARCHAR(30);
BEGIN
    SELECT status INTO v_status_atual
    FROM encomenda
    WHERE tenant_id = p_tenant_id AND id = p_encomenda_id;

    -- Se já estiver cancelada ou arquivada, não altera
    IF v_status_atual = 'Cancelada' THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status_item = 'Aguardando'),
        COUNT(*) FILTER (WHERE status_item = 'Pedido Feito'),
        COUNT(*) FILTER (WHERE status_item = 'Chegou')
    INTO
        v_total_itens,
        v_qtd_aguardando,
        v_qtd_pedido_feito,
        v_qtd_chegou
    FROM encomenda_item
    WHERE tenant_id = p_tenant_id AND encomenda_id = p_encomenda_id;

    IF v_total_itens = 0 THEN
        v_novo_status := 'Aguardando';
    ELSIF v_qtd_aguardando > 0 THEN
        v_novo_status := 'Aguardando';
    ELSIF v_qtd_pedido_feito > 0 THEN
        v_novo_status := 'Pedido Feito';
    ELSIF v_qtd_chegou = v_total_itens THEN
        -- Se todos chegaram, mantém 'Entregue' se já havia sido entregue, senão vira 'Chegou'
        IF v_status_atual = 'Entregue' THEN
            v_novo_status := 'Entregue';
        ELSE
            v_novo_status := 'Chegou';
        END IF;
    ELSE
        v_novo_status := 'Aguardando';
    END IF;

    -- Atualiza total financeiro e status na encomenda
    UPDATE encomenda
    SET
        status = v_novo_status,
        valor_total = COALESCE((
            SELECT SUM(subtotal)
            FROM encomenda_item
            WHERE tenant_id = p_tenant_id AND encomenda_id = p_encomenda_id
        ), 0.00),
        atualizado_em = now()
    WHERE tenant_id = p_tenant_id AND id = p_encomenda_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger ao inserir/alterar EncomendaItem:
-- Auto-vincula a um CompraItem aberto ou cria um novo em 'Aguardando'
CREATE OR REPLACE FUNCTION trg_encomenda_item_processar()
RETURNS TRIGGER AS $$
DECLARE
    v_norm TEXT;
    v_compra_id UUID;
    v_compra_status VARCHAR(30);
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recalcular_status_encomenda(OLD.tenant_id, OLD.encomenda_id);
        RETURN OLD;
    END IF;

    v_norm := normalizar_descricao(NEW.descricao);

    -- Se não tem compra_item vinculado ainda, busca ou cria
    IF NEW.compra_item_id IS NULL THEN
        SELECT id, status INTO v_compra_id, v_compra_status
        FROM compra_item
        WHERE tenant_id = NEW.tenant_id
          AND descricao_normalizada = v_norm
          AND ((classificacao_id IS NULL AND NEW.classificacao_id IS NULL) OR classificacao_id = NEW.classificacao_id)
          AND status != 'Chegou'
          AND arquivado_em IS NULL
        ORDER BY criado_em DESC
        LIMIT 1;

        IF v_compra_id IS NOT NULL THEN
            NEW.compra_item_id := v_compra_id;
            NEW.status_item := v_compra_status;
        ELSE
            -- Cria novo registro na lista de compras da farmácia
            INSERT INTO compra_item (
                tenant_id,
                descricao,
                descricao_normalizada,
                classificacao_id,
                quantidade,
                urgente,
                controlado,
                status,
                origem
            ) VALUES (
                NEW.tenant_id,
                NEW.descricao,
                v_norm,
                NEW.classificacao_id,
                NEW.quantidade,
                NEW.urgente,
                NEW.controlado,
                'Aguardando',
                'manual'
            ) RETURNING id INTO v_compra_id;

            NEW.compra_item_id := v_compra_id;
            NEW.status_item := 'Aguardando';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_encomenda_item_before
BEFORE INSERT OR UPDATE ON encomenda_item
FOR EACH ROW
EXECUTE FUNCTION trg_encomenda_item_processar();

CREATE OR REPLACE FUNCTION trg_encomenda_item_after_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recalcular_status_encomenda(OLD.tenant_id, OLD.encomenda_id);
    ELSE
        PERFORM recalcular_status_encomenda(NEW.tenant_id, NEW.encomenda_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_encomenda_item_after
AFTER INSERT OR UPDATE OR DELETE ON encomenda_item
FOR EACH ROW
EXECUTE FUNCTION trg_encomenda_item_after_change();

-- 4. Propagação de Status do CompraItem para os EncomendaItem
-- Se CompraItem muda de status (ex: Aguardando -> Pedido Feito -> Chegou),
-- todos os EncomendaItem vinculados herdam o novo status.
CREATE OR REPLACE FUNCTION trg_compra_item_status_propagacao()
RETURNS TRIGGER AS $$
DECLARE
    r_encomenda RECORD;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Atualiza todos os itens vinculados
        UPDATE encomenda_item
        SET status_item = NEW.status
        WHERE tenant_id = NEW.tenant_id AND compra_item_id = NEW.id;

        -- Recalcula o status de cada encomenda afetada
        FOR r_encomenda IN
            SELECT DISTINCT encomenda_id
            FROM encomenda_item
            WHERE tenant_id = NEW.tenant_id AND compra_item_id = NEW.id
        LOOP
            PERFORM recalcular_status_encomenda(NEW.tenant_id, r_encomenda.encomenda_id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_compra_item_status_update
AFTER UPDATE OF status ON compra_item
FOR EACH ROW
EXECUTE FUNCTION trg_compra_item_status_propagacao();

-- 5. Atualização automática de Pagamentos e Saldo da Encomenda
CREATE OR REPLACE FUNCTION trg_atualizar_valor_pago_encomenda()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
    v_encomenda_id UUID;
    v_soma NUMERIC(10, 2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_encomenda_id := OLD.encomenda_id;
    ELSE
        v_tenant_id := NEW.tenant_id;
        v_encomenda_id := NEW.encomenda_id;
    END IF;

    SELECT COALESCE(SUM(valor), 0.00)
    INTO v_soma
    FROM pagamento
    WHERE tenant_id = v_tenant_id AND encomenda_id = v_encomenda_id;

    UPDATE encomenda
    SET valor_pago = v_soma,
        atualizado_em = now()
    WHERE tenant_id = v_tenant_id AND id = v_encomenda_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_pagamento_after_change
AFTER INSERT OR UPDATE OR DELETE ON pagamento
FOR EACH ROW
EXECUTE FUNCTION trg_atualizar_valor_pago_encomenda();

-- 6. Cancelamento de Encomenda (Regra 3.3.4):
-- Desfaz vínculo e arquiva o CompraItem se estiver em 'Aguardando' e sem outros itens vinculados
CREATE OR REPLACE FUNCTION trg_encomenda_cancelamento()
RETURNS TRIGGER AS $$
DECLARE
    r_item RECORD;
    v_outros_vinculos INT;
BEGIN
    IF OLD.status != 'Cancelada' AND NEW.status = 'Cancelada' THEN
        FOR r_item IN
            SELECT id, compra_item_id
            FROM encomenda_item
            WHERE tenant_id = NEW.tenant_id AND encomenda_id = NEW.id
        LOOP
            IF r_item.compra_item_id IS NOT NULL THEN
                -- Desvincula
                UPDATE encomenda_item
                SET compra_item_id = NULL
                WHERE id = r_item.id;

                -- Verifica se sobrou algum outro item de outra encomenda vinculado
                SELECT COUNT(*) INTO v_outros_vinculos
                FROM encomenda_item
                WHERE tenant_id = NEW.tenant_id AND compra_item_id = r_item.compra_item_id;

                -- Se não houver nenhum e ainda estiver em 'Aguardando', arquiva
                IF v_outros_vinculos = 0 THEN
                    UPDATE compra_item
                    SET arquivado_em = now()
                    WHERE tenant_id = NEW.tenant_id
                      AND id = r_item.compra_item_id
                      AND status = 'Aguardando';
                END IF;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_encomenda_cancelamento_update
AFTER UPDATE OF status ON encomenda
FOR EACH ROW
EXECUTE FUNCTION trg_encomenda_cancelamento();


-- === 20261020000004_print_template_and_reservas.sql ===
-- ====================================================================
-- SISTEMA MÃE DE ENCOMENDAS MULTI-TENANT
-- Migração 04: Campos de PrintTemplate e Tabela de Reservas do Balcão
-- ====================================================================

-- 1. Campos do PrintTemplate do sistema legado na tabela config_tenant
ALTER TABLE config_tenant
    ADD COLUMN IF NOT EXISTS header_title VARCHAR(255) DEFAULT 'DROGARIA AEROPORTO',
    ADD COLUMN IF NOT EXISTS header_subtitle VARCHAR(255) DEFAULT 'Sistema de Reservas',
    ADD COLUMN IF NOT EXISTS footer_text TEXT DEFAULT 'Obrigado pela preferencia!',
    ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_payment BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_status BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 14;

-- 2. Tabela de Reservas Rápidas do Balcão (Reconstrução fiel da entidade Reservation)
CREATE TABLE IF NOT EXISTS reserva (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    paid BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reserva_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS reserva_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    reserva_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reserva_item_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_reserva_item FOREIGN KEY (tenant_id, reserva_id) REFERENCES reserva(tenant_id, id) ON DELETE CASCADE
);

-- Índices para buscas em reservas
CREATE INDEX IF NOT EXISTS idx_reserva_tenant_cliente ON reserva(tenant_id, customer_name, phone);
CREATE INDEX IF NOT EXISTS idx_reserva_item_reserva ON reserva_item(tenant_id, reserva_id);

-- 3. Habilitação de RLS com chave tenant_id
ALTER TABLE reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva FORCE ROW LEVEL SECURITY;

ALTER TABLE reserva_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_item FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_reserva"
    ON reserva
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation_reserva_item"
    ON reserva_item
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());


-- === 20261029000006_security_hardening.sql ===
-- ====================================================================
-- SISTEMA ENCOMED / DROGARIA AEROPORTO - HARDENING DE SEGURANÇA PRÉ-LANÇAMENTO
-- Migração 06: Zero-Trust Super Admin (2FA AAL2, Rate Limit, IP/Device Allowlist),
--              Blindagem Anti-Escalação (RLS/Triggers), Auditoria Imutável e Persistência
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 1. Ajustes de Persistência Completa sem Segredos no Perfil/Tenant
ALTER TABLE public.config_tenant
    ADD COLUMN IF NOT EXISTS mensagem_whatsapp_pedido TEXT DEFAULT 'Olá {cliente}! Confirmamos seu pedido de {medicamento} na farmácia. Em breve avisaremos assim que chegar.',
    ADD COLUMN IF NOT EXISTS mensagem_whatsapp_cobranca TEXT DEFAULT 'Olá {cliente}! Lembrando que sua encomenda de {medicamento} está disponível. Saldo a acertar: {saldo}.',
    ADD COLUMN IF NOT EXISTS ocultar_medicamentos_notificacao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS evolution_api_ativo BOOLEAN NOT NULL DEFAULT false;

-- Garantia explícita: remover colunas de segredos externos caso tenham existido
ALTER TABLE public.config_tenant
    DROP COLUMN IF EXISTS evolution_api_key,
    DROP COLUMN IF EXISTS evolution_api_url,
    DROP COLUMN IF EXISTS evolution_api_instance;

-- Tabela de Funcionários / Balconistas do Tenant
CREATE TABLE IF NOT EXISTS public.funcionario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cargo VARCHAR(120),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_funcionario_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_funcionario_tenant ON public.funcionario(tenant_id);

-- Campos operacionais complementares em encomenda
ALTER TABLE public.encomenda
    ADD COLUMN IF NOT EXISTS cliente_avisado BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cliente_avisado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cliente_avisado_por VARCHAR(255),
    ADD COLUMN IF NOT EXISTS historico JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Ajuste em log_auditoria para suportar eventos globais de plataforma (tenant_id NULL)
-- e invisibilidade de ações internas do super_admin para admins comuns
ALTER TABLE public.log_auditoria
    ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.log_auditoria
    ADD COLUMN IF NOT EXISTS usuario_email_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS nivel VARCHAR(20) NOT NULL DEFAULT 'INFO',
    ADD COLUMN IF NOT EXISTS visivel_tenant BOOLEAN NOT NULL DEFAULT true;

-- ====================================================================
-- 2. Tabelas de Segurança de Acesso, Rate Limiting, IP & Dispositivos
-- ====================================================================

-- 2.1. Controle de Tentativas de Login (Anti Brute-Force / Credential Stuffing)
CREATE TABLE IF NOT EXISTS public.seguranca_tentativa_login (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identificador_hash VARCHAR(64) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    sucesso BOOLEAN NOT NULL DEFAULT false,
    motivo VARCHAR(120),
    user_agent TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tentativa_login_hash_tempo
    ON public.seguranca_tentativa_login(identificador_hash, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tentativa_login_ip_tempo
    ON public.seguranca_tentativa_login(ip, criado_em DESC);

ALTER TABLE public.seguranca_tentativa_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguranca_tentativa_login FORCE ROW LEVEL SECURITY;

-- 2.2. Política Zero-Trust Exclusiva do Super Admin
CREATE TABLE IF NOT EXISTS public.super_admin_politica (
    usuario_id UUID PRIMARY KEY REFERENCES public.usuario(id) ON DELETE RESTRICT,
    mfa_obrigatorio BOOLEAN NOT NULL DEFAULT true CHECK (mfa_obrigatorio = true),
    restringir_ip BOOLEAN NOT NULL DEFAULT false,
    ips_permitidos TEXT[] NOT NULL DEFAULT '{}',
    exigir_dispositivo_confiavel BOOLEAN NOT NULL DEFAULT false,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_politica FORCE ROW LEVEL SECURITY;

-- 2.3. Dispositivos Confiáveis (Token Criptográfico Hasheado SHA-256)
CREATE TABLE IF NOT EXISTS public.super_admin_dispositivo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
    nome_dispositivo VARCHAR(120) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_registro VARCHAR(64),
    user_agent TEXT,
    ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    revogado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_dispositivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_dispositivo FORCE ROW LEVEL SECURITY;

-- 2.4. Sessões Temporárias de Suporte Emergencial Auditado (Break-Glass)
CREATE TABLE IF NOT EXISTS public.super_admin_break_glass (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    justificativa TEXT NOT NULL,
    ip VARCHAR(64),
    ativo BOOLEAN NOT NULL DEFAULT true,
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_break_glass ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_break_glass FORCE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. Funções Utilitárias Seguras (Sem Confiança em user_metadata!)
-- ====================================================================

-- Corrige search_path da função normalizar_descricao para encontrar unaccent em public ou extensions
CREATE OR REPLACE FUNCTION public.normalizar_descricao(texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
BEGIN
    IF texto IS NULL THEN
        RETURN '';
    END IF;
    RETURN UPPER(TRIM(REGEXP_REPLACE(unaccent(texto), '\s+', ' ', 'g')));
END;
$$;

-- Corrige chaves estrangeiras compostas com ON DELETE SET NULL para anular apenas a coluna opcional (preservando tenant_id NOT NULL)
ALTER TABLE public.compra_item
    DROP CONSTRAINT IF EXISTS fk_compra_classificacao,
    ADD CONSTRAINT fk_compra_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES public.classificacao(tenant_id, id) ON DELETE SET NULL (classificacao_id),
    DROP CONSTRAINT IF EXISTS fk_compra_fornecedor,
    ADD CONSTRAINT fk_compra_fornecedor FOREIGN KEY (tenant_id, fornecedor_id) REFERENCES public.fornecedor(tenant_id, id) ON DELETE SET NULL (fornecedor_id);

ALTER TABLE public.encomenda
    DROP CONSTRAINT IF EXISTS fk_encomenda_criado_por,
    ADD CONSTRAINT fk_encomenda_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (criado_por),
    DROP CONSTRAINT IF EXISTS fk_encomenda_entregue_por,
    ADD CONSTRAINT fk_encomenda_entregue_por FOREIGN KEY (tenant_id, entregue_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (entregue_por);

ALTER TABLE public.encomenda_item
    DROP CONSTRAINT IF EXISTS fk_item_classificacao,
    ADD CONSTRAINT fk_item_classificacao FOREIGN KEY (tenant_id, classificacao_id) REFERENCES public.classificacao(tenant_id, id) ON DELETE SET NULL (classificacao_id),
    DROP CONSTRAINT IF EXISTS fk_item_compra,
    ADD CONSTRAINT fk_item_compra FOREIGN KEY (tenant_id, compra_item_id) REFERENCES public.compra_item(tenant_id, id) ON DELETE SET NULL (compra_item_id);

ALTER TABLE public.pagamento
    DROP CONSTRAINT IF EXISTS fk_pagamento_registrado_por,
    ADD CONSTRAINT fk_pagamento_registrado_por FOREIGN KEY (tenant_id, registrado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (registrado_por);

ALTER TABLE public.importacao_xml
    DROP CONSTRAINT IF EXISTS fk_importacao_criado_por,
    ADD CONSTRAINT fk_importacao_criado_por FOREIGN KEY (tenant_id, criado_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (criado_por);

ALTER TABLE public.notificacao
    DROP CONSTRAINT IF EXISTS fk_notificacao_enviada_por,
    ADD CONSTRAINT fk_notificacao_enviada_por FOREIGN KEY (tenant_id, enviada_por) REFERENCES public.usuario(tenant_id, id) ON DELETE SET NULL (enviada_por);

-- Extrai IP real injetado pelo proxy reverso / PostgREST (não falsificável via payload JS)
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS VARCHAR
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
    v_ip TEXT;
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::JSON;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NOT NULL THEN
        v_ip := COALESCE(
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'cf-connecting-ip', ',', 1)), ''),
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'x-real-ip', ',', 1)), ''),
            NULLIF(TRIM(SPLIT_PART(v_headers ->> 'x-forwarded-for', ',', 1)), '')
        );
    END IF;

    RETURN LEFT(COALESCE(v_ip, '127.0.0.1'), 64);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_user_agent()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::JSON;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    IF v_headers IS NOT NULL THEN
        RETURN LEFT(COALESCE(v_headers ->> 'user-agent', 'unknown'), 512);
    END IF;
    RETURN 'server-internal';
END;
$$;

-- Obtém ID interno do usuário autenticado na tabela public.usuario
CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM public.usuario
    WHERE auth_user_id = auth.uid()
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;
$$;

-- Obtém perfil verificado no banco (NUNCA de user_metadata!)
CREATE OR REPLACE FUNCTION public.current_usuario_perfil()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT perfil
    FROM public.usuario
    WHERE auth_user_id = auth.uid()
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;
$$;

-- Verifica se o usuário autenticado é super_admin E cumpriu MFA AAL2 + Política de IP
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_usuario_id UUID;
    v_aal TEXT;
    v_restringir_ip BOOLEAN;
    v_ips TEXT[];
    v_client_ip TEXT;
BEGIN
    -- Suporte exclusivo para suíte de testes automatizados rodando como role postgres
    IF auth.uid() IS NULL AND current_user = 'postgres' AND current_setting('app.is_super_admin', true) = 'true' THEN
        RETURN true;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND perfil = 'super_admin'
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
        RETURN false;
    END IF;

    -- Exigência obrigatória de 2FA (Authenticator Assurance Level 2 no JWT do Supabase Auth)
    v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
    IF v_aal <> 'aal2' THEN
        RETURN false;
    END IF;

    -- Verifica política opcional de restrição por endereço IP
    SELECT restringir_ip, ips_permitidos
    INTO v_restringir_ip, v_ips
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario_id;

    IF COALESCE(v_restringir_ip, false) = true THEN
        v_client_ip := public.request_client_ip();
        IF NOT (v_client_ip = ANY(COALESCE(v_ips, '{}'))) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$;

-- Verifica se há sessão Break-Glass ativa para o Super Admin
CREATE OR REPLACE FUNCTION public.active_break_glass_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT bg.tenant_id
    FROM public.super_admin_break_glass bg
    JOIN public.usuario u ON u.id = bg.usuario_id
    WHERE u.auth_user_id = auth.uid()
      AND u.perfil = 'super_admin'
      AND bg.ativo = true
      AND bg.expira_em > now()
      AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    ORDER BY bg.criado_em DESC
    LIMIT 1;
$$;

-- Obtém tenant_id estritamente da tabela public.usuario (ou Break-Glass auditado)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_tenant UUID;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        IF current_user = 'postgres' THEN
            RETURN NULLIF(current_setting('app.tenant_id', true), '')::UUID;
        END IF;
        RETURN NULL;
    END IF;

    SELECT tenant_id INTO v_tenant
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_tenant IS NOT NULL THEN
        RETURN v_tenant;
    END IF;

    -- Se for super_admin com Break-Glass ativo e auditado
    RETURN public.active_break_glass_tenant_id();
END;
$$;

-- ====================================================================
-- 4. Triggers de Blindagem do Super Admin e Imutabilidade de Auditoria
-- ====================================================================

CREATE OR REPLACE FUNCTION public.trg_proteger_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Permite manutenção controlada apenas pelo papel interno postgres com flag explícita
    IF current_user = 'postgres' AND current_setting('app.allow_super_admin_setup', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- 1. Bloqueia qualquer exclusão de conta super_admin
    IF TG_OP = 'DELETE' THEN
        IF OLD.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: a conta protegida de nível plataforma não pode ser excluída.';
        END IF;
        RETURN OLD;
    END IF;

    -- 2. Bloqueia criação de novas contas super_admin por qualquer usuário comum ou admin
    IF TG_OP = 'INSERT' THEN
        IF NEW.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: criação de conta super_admin não permitida por esta interface.';
        END IF;
        RETURN NEW;
    END IF;

    -- 3. Bloqueia rebaixamento, desativação ou alteração não autorizada de super_admin
    IF TG_OP = 'UPDATE' THEN
        IF OLD.perfil = 'super_admin' THEN
            IF NEW.perfil <> 'super_admin' THEN
                RAISE EXCEPTION 'Operação bloqueada: não é permitido rebaixar o perfil da conta super_admin.';
            END IF;
            IF NEW.ativo = false OR NEW.excluido_em IS NOT NULL THEN
                RAISE EXCEPTION 'Operação bloqueada: não é permitido desativar ou arquivar a conta super_admin.';
            END IF;
            IF NEW.tenant_id IS NOT NULL THEN
                RAISE EXCEPTION 'Operação bloqueada: super_admin não pode ser vinculado a um tenant comum.';
            END IF;
            IF NOT public.is_super_admin() OR OLD.auth_user_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Operação bloqueada: somente o próprio super_admin autenticado com 2FA pode atualizar seu registro.';
            END IF;
        ELSIF NEW.perfil = 'super_admin' THEN
            RAISE EXCEPTION 'Operação bloqueada: escalonamento de privilégio para super_admin negado.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuario_proteger_super_admin ON public.usuario;
CREATE TRIGGER trg_usuario_proteger_super_admin
BEFORE INSERT OR UPDATE OR DELETE ON public.usuario
FOR EACH ROW
EXECUTE FUNCTION public.trg_proteger_super_admin();

-- Imutabilidade do Log de Auditoria (LGPD / Marco Civil)
CREATE OR REPLACE FUNCTION public.trg_bloquear_mutacao_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user = 'postgres' AND current_setting('app.allow_audit_maintenance', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Operação negada: registros de log_auditoria são imutáveis e protegidos contra alteração ou exclusão.';
END;
$$;

DROP TRIGGER IF EXISTS trg_log_auditoria_imutavel ON public.log_auditoria;
CREATE TRIGGER trg_log_auditoria_imutavel
BEFORE UPDATE OR DELETE ON public.log_auditoria
FOR EACH ROW
EXECUTE FUNCTION public.trg_bloquear_mutacao_auditoria();

-- ====================================================================
-- 5. Reescrita das Políticas RLS (Invisibilidade Total do Super Admin e RBAC)
-- ====================================================================

-- 5.1. Usuario: Admin de tenant NUNCA vê, lista, edita ou exclui super_admin
DROP POLICY IF EXISTS usuario_tenant_all ON public.usuario;
DROP POLICY IF EXISTS usuario_select_isolado ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_insert ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_update ON public.usuario;
DROP POLICY IF EXISTS usuario_admin_delete ON public.usuario;

CREATE POLICY usuario_select_isolado ON public.usuario
    FOR SELECT
    USING (
        public.is_super_admin()
        OR auth_user_id = auth.uid()
        OR (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND perfil <> 'super_admin'
        )
    );

CREATE POLICY usuario_admin_insert ON public.usuario
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = public.current_tenant_id()
        AND public.current_usuario_perfil() = 'admin'
        AND perfil IN ('admin', 'comprador', 'operador')
    );

CREATE POLICY usuario_admin_update ON public.usuario
    FOR UPDATE
    USING (
        (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND perfil <> 'super_admin'
        )
        OR (public.is_super_admin() AND auth_user_id = auth.uid())
    )
    WITH CHECK (
        (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND perfil IN ('admin', 'comprador', 'operador')
        )
        OR (public.is_super_admin() AND auth_user_id = auth.uid())
    );

CREATE POLICY usuario_admin_delete ON public.usuario
    FOR DELETE
    USING (
        tenant_id IS NOT NULL
        AND tenant_id = public.current_tenant_id()
        AND public.current_usuario_perfil() = 'admin'
        AND perfil IN ('admin', 'comprador', 'operador')
    );

-- 5.2. ConfigTenant: leitura pelo tenant, escrita apenas por Admin do tenant ou Super Admin
DROP POLICY IF EXISTS config_tenant_update ON public.config_tenant;
DROP POLICY IF EXISTS config_tenant_insert ON public.config_tenant;

CREATE POLICY config_tenant_update ON public.config_tenant
    FOR UPDATE
    USING (
        (tenant_id = public.current_tenant_id() AND public.current_usuario_perfil() = 'admin')
        OR public.is_super_admin()
    )
    WITH CHECK (
        (tenant_id = public.current_tenant_id() AND public.current_usuario_perfil() = 'admin')
        OR public.is_super_admin()
    );

CREATE POLICY config_tenant_insert ON public.config_tenant
    FOR INSERT
    WITH CHECK (public.is_super_admin());

-- 5.3. Funcionario: leitura pelo tenant, gestão por Admin (ou Super Admin em suporte)
ALTER TABLE public.funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funcionario_select ON public.funcionario;
DROP POLICY IF EXISTS funcionario_manage ON public.funcionario;

CREATE POLICY funcionario_select ON public.funcionario
    FOR SELECT
    USING (tenant_id = public.current_tenant_id());

CREATE POLICY funcionario_manage ON public.funcionario
    FOR ALL
    USING (
        tenant_id = public.current_tenant_id()
        AND (public.current_usuario_perfil() IN ('admin') OR public.active_break_glass_tenant_id() IS NOT NULL OR current_user = 'postgres')
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND (public.current_usuario_perfil() IN ('admin') OR public.active_break_glass_tenant_id() IS NOT NULL OR current_user = 'postgres')
    );

-- 5.4. Tabelas Operacionais: permitir também Break-Glass auditado quando ativo
DROP POLICY IF EXISTS cliente_tenant_all ON public.cliente;
CREATE POLICY cliente_tenant_all ON public.cliente
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS fornecedor_tenant_all ON public.fornecedor;
CREATE POLICY fornecedor_tenant_all ON public.fornecedor
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS compra_item_tenant_all ON public.compra_item;
CREATE POLICY compra_item_tenant_all ON public.compra_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS encomenda_tenant_all ON public.encomenda;
CREATE POLICY encomenda_tenant_all ON public.encomenda
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS encomenda_item_tenant_all ON public.encomenda_item;
CREATE POLICY encomenda_item_tenant_all ON public.encomenda_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS pagamento_tenant_all ON public.pagamento;
CREATE POLICY pagamento_tenant_all ON public.pagamento
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS "tenant_isolation_reserva" ON public.reserva;
CREATE POLICY "tenant_isolation_reserva" ON public.reserva
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

DROP POLICY IF EXISTS "tenant_isolation_reserva_item" ON public.reserva_item;
CREATE POLICY "tenant_isolation_reserva_item" ON public.reserva_item
    FOR ALL
    USING (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id))
    WITH CHECK (tenant_id = public.current_tenant_id() AND (NOT public.is_super_admin() OR public.active_break_glass_tenant_id() = tenant_id));

-- 5.5. Log de Auditoria: Admin do tenant vê apenas logs visíveis do próprio tenant; Super Admin vê todos
DROP POLICY IF EXISTS log_auditoria_tenant_select ON public.log_auditoria;
DROP POLICY IF EXISTS log_auditoria_tenant_insert ON public.log_auditoria;

CREATE POLICY log_auditoria_tenant_select ON public.log_auditoria
    FOR SELECT
    USING (
        public.is_super_admin()
        OR (
            tenant_id IS NOT NULL
            AND tenant_id = public.current_tenant_id()
            AND public.current_usuario_perfil() = 'admin'
            AND visivel_tenant = true
        )
    );

CREATE POLICY log_auditoria_tenant_insert ON public.log_auditoria
    FOR INSERT
    WITH CHECK (
        public.is_super_admin()
        OR (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id())
    );

-- 5.6. Políticas das tabelas exclusivas de Super Admin
DROP POLICY IF EXISTS super_admin_politica_all ON public.super_admin_politica;
CREATE POLICY super_admin_politica_all ON public.super_admin_politica
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

DROP POLICY IF EXISTS super_admin_dispositivo_all ON public.super_admin_dispositivo;
CREATE POLICY super_admin_dispositivo_all ON public.super_admin_dispositivo
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

DROP POLICY IF EXISTS super_admin_break_glass_all ON public.super_admin_break_glass;
CREATE POLICY super_admin_break_glass_all ON public.super_admin_break_glass
    FOR ALL
    USING (public.is_super_admin() AND usuario_id = public.current_usuario_id())
    WITH CHECK (public.is_super_admin() AND usuario_id = public.current_usuario_id());

-- ====================================================================
-- 6. RPCs de Segurança (Rate Limit, Auditoria, IP/Device Gate, Break-Glass)
-- ====================================================================

-- 6.1. Verifica se identificador ou IP está bloqueado por excesso de tentativas (5 falhas / 15 min)
CREATE OR REPLACE FUNCTION public.verificar_bloqueio_login(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_falhas_id INT;
    v_falhas_ip INT;
    v_ultima_falha TIMESTAMPTZ;
    v_segundos_restantes INT := 0;
BEGIN
    v_hash := encode(digest(LOWER(TRIM(COALESCE(p_identificador, ''))), 'sha256'), 'hex');
    v_ip := public.request_client_ip();

    SELECT COUNT(*), MAX(criado_em)
    INTO v_falhas_id, v_ultima_falha
    FROM public.seguranca_tentativa_login
    WHERE identificador_hash = v_hash
      AND sucesso = false
      AND criado_em > (now() - interval '15 minutes');

    SELECT COUNT(*)
    INTO v_falhas_ip
    FROM public.seguranca_tentativa_login
    WHERE ip = v_ip
      AND sucesso = false
      AND criado_em > (now() - interval '15 minutes');

    IF v_falhas_id >= 5 OR v_falhas_ip >= 10 THEN
        v_segundos_restantes := GREATEST(
            60,
            EXTRACT(EPOCH FROM ((COALESCE(v_ultima_falha, now()) + interval '15 minutes') - now()))::INT
        );
        RETURN jsonb_build_object(
            'bloqueado', true,
            'tentativas', GREATEST(v_falhas_id, v_falhas_ip),
            'segundos_restantes', v_segundos_restantes
        );
    END IF;

    RETURN jsonb_build_object(
        'bloqueado', false,
        'tentativas', v_falhas_id,
        'segundos_restantes', 0
    );
END;
$$;

-- 6.2. Registra tentativa de login (sucesso ou falha) e grava trilha de auditoria
CREATE OR REPLACE FUNCTION public.registrar_evento_login(
    p_identificador TEXT,
    p_sucesso BOOLEAN,
    p_motivo TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_uid UUID;
    v_usuario RECORD;
BEGIN
    v_hash := encode(digest(LOWER(TRIM(COALESCE(p_identificador, ''))), 'sha256'), 'hex');
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();
    v_uid := auth.uid();

    INSERT INTO public.seguranca_tentativa_login (identificador_hash, ip, sucesso, motivo, user_agent)
    VALUES (v_hash, v_ip, COALESCE(p_sucesso, false), LEFT(COALESCE(p_motivo, ''), 120), v_ua);

    -- Se autenticou com sucesso, limpa falhas recentes deste identificador para evitar falso bloqueio posterior
    IF p_sucesso = true AND v_uid IS NOT NULL THEN
        SELECT id, tenant_id, perfil INTO v_usuario
        FROM public.usuario
        WHERE auth_user_id = v_uid
        LIMIT 1;

        INSERT INTO public.log_auditoria (
            tenant_id,
            usuario_id,
            usuario_email_hash,
            acao,
            recurso,
            justificativa,
            ip,
            user_agent,
            nivel,
            visivel_tenant
        ) VALUES (
            v_usuario.tenant_id,
            v_usuario.id,
            v_hash,
            CASE WHEN v_usuario.perfil = 'super_admin' THEN 'LOGIN_SUPER_ADMIN_ETAPA1' ELSE 'LOGIN_SUCESSO' END,
            'Autenticação do Sistema',
            COALESCE(p_motivo, 'Sessão autenticada'),
            v_ip,
            v_ua,
            'INFO',
            CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
        );
    ELSE
        -- Tenta localizar tenant sem vazar existência para o cliente
        SELECT id, tenant_id, perfil INTO v_usuario
        FROM public.usuario
        WHERE LOWER(email) = LOWER(TRIM(COALESCE(p_identificador, '')))
        LIMIT 1;

        INSERT INTO public.log_auditoria (
            tenant_id,
            usuario_id,
            usuario_email_hash,
            acao,
            recurso,
            justificativa,
            ip,
            user_agent,
            nivel,
            visivel_tenant
        ) VALUES (
            v_usuario.tenant_id,
            v_usuario.id,
            v_hash,
            'LOGIN_FALHA',
            'Autenticação do Sistema',
            LEFT(COALESCE(p_motivo, 'Credenciais inválidas'), 200),
            v_ip,
            v_ua,
            'WARN',
            CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
        );
    END IF;
END;
$$;

-- 6.3. Valida contexto completo do Super Admin (AAL2 2FA + IP Allowlist + Dispositivo Confiável)
CREATE OR REPLACE FUNCTION public.validar_contexto_super_admin(p_device_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid UUID;
    v_usuario RECORD;
    v_politica RECORD;
    v_aal TEXT;
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_token_hash VARCHAR(64);
    v_dispositivo_id UUID;
BEGIN
    v_uid := auth.uid();
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('autorizado', false, 'codigo', 'NAO_AUTENTICADO', 'ip_atual', v_ip);
    END IF;

    SELECT id, nome, email, perfil, ativo
    INTO v_usuario
    FROM public.usuario
    WHERE auth_user_id = v_uid
      AND perfil = 'super_admin'
      AND ativo = true
      AND excluido_em IS NULL
    LIMIT 1;

    IF v_usuario.id IS NULL THEN
        RETURN jsonb_build_object('autorizado', false, 'codigo', 'PERFIL_INVALIDO', 'ip_atual', v_ip);
    END IF;

    v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
    IF v_aal <> 'aal2' THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'codigo', 'MFA_OBRIGATORIO',
            'aal_atual', v_aal,
            'ip_atual', v_ip
        );
    END IF;

    SELECT * INTO v_politica
    FROM public.super_admin_politica
    WHERE usuario_id = v_usuario.id;

    -- 1. Validação de IP Permitido
    IF COALESCE(v_politica.restringir_ip, false) = true THEN
        IF NOT (v_ip = ANY(COALESCE(v_politica.ips_permitidos, '{}'))) THEN
            INSERT INTO public.log_auditoria (
                tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
            ) VALUES (
                NULL, v_usuario.id, 'BLOQUEIO_IP_SUPER_ADMIN', 'Portal da Plataforma',
                'Acesso negado para IP fora da allowlist: ' || v_ip, v_ip, v_ua, 'CRITICAL', false
            );
            RETURN jsonb_build_object(
                'autorizado', false,
                'codigo', 'IP_NAO_AUTORIZADO',
                'ip_atual', v_ip
            );
        END IF;
    END IF;

    -- 2. Validação de Dispositivo Confiável
    IF p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 0 THEN
        v_token_hash := encode(digest(TRIM(p_device_token), 'sha256'), 'hex');
        SELECT id INTO v_dispositivo_id
        FROM public.super_admin_dispositivo
        WHERE usuario_id = v_usuario.id
          AND token_hash = v_token_hash
          AND revogado_em IS NULL
        LIMIT 1;

        IF v_dispositivo_id IS NOT NULL THEN
            UPDATE public.super_admin_dispositivo
            SET ultimo_acesso_em = now(), ip_registro = v_ip
            WHERE id = v_dispositivo_id;
        END IF;
    END IF;

    IF COALESCE(v_politica.exigir_dispositivo_confiavel, false) = true AND v_dispositivo_id IS NULL THEN
        INSERT INTO public.log_auditoria (
            tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
        ) VALUES (
            NULL, v_usuario.id, 'BLOQUEIO_DISPOSITIVO_SUPER_ADMIN', 'Portal da Plataforma',
            'Tentativa em dispositivo não confiável / sem token válido', v_ip, v_ua, 'CRITICAL', false
        );
        RETURN jsonb_build_object(
            'autorizado', false,
            'codigo', 'DISPOSITIVO_NAO_CONFIAVEL',
            'ip_atual', v_ip
        );
    END IF;

    -- Registra acesso verificado com 2FA AAL2 na trilha de auditoria
    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario.id, 'ACESSO_VERIFICADO_2FA', 'Sessão Super Admin (AAL2)',
        'Autenticação multifator e políticas Zero-Trust validadas com sucesso', v_ip, v_ua, 'INFO', false
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'codigo', 'OK',
        'ip_atual', v_ip,
        'dispositivo_reconhecido', (v_dispositivo_id IS NOT NULL),
        'restringir_ip', COALESCE(v_politica.restringir_ip, false),
        'ips_permitidos', COALESCE(v_politica.ips_permitidos, '{}'),
        'exigir_dispositivo_confiavel', COALESCE(v_politica.exigir_dispositivo_confiavel, false)
    );
END;
$$;

-- 6.4. Cadastra Dispositivo Confiável (exige Super Admin com 2FA AAL2 ativo)
CREATE OR REPLACE FUNCTION public.registrar_dispositivo_super_admin(
    p_nome_dispositivo TEXT,
    p_token_plain TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_usuario_id UUID;
    v_hash VARCHAR(64);
    v_ip VARCHAR(64);
    v_ua TEXT;
    v_id UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige autenticação Super Admin com 2FA (AAL2).';
    END IF;

    IF LENGTH(TRIM(COALESCE(p_token_plain, ''))) < 32 THEN
        RAISE EXCEPTION 'Token de dispositivo inválido.';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_hash := encode(digest(TRIM(p_token_plain), 'sha256'), 'hex');
    v_ip := public.request_client_ip();
    v_ua := public.request_user_agent();

    INSERT INTO public.super_admin_dispositivo (usuario_id, nome_dispositivo, token_hash, ip_registro, user_agent)
    VALUES (v_usuario_id, LEFT(TRIM(COALESCE(p_nome_dispositivo, 'Estação Principal')), 120), v_hash, v_ip, v_ua)
    RETURNING id INTO v_id;

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario_id, 'CADASTRO_DISPOSITIVO_CONFIAVEL', LEFT(TRIM(p_nome_dispositivo), 120),
        'Novo dispositivo confiável autorizado via 2FA', v_ip, v_ua, 'INFO', false
    );

    RETURN v_id;
END;
$$;

-- 6.5. Atualiza Política de Restrição de IP / Dispositivo (com trava anti-lockout acidental)
CREATE OR REPLACE FUNCTION public.atualizar_politica_super_admin(
    p_restringir_ip BOOLEAN,
    p_ips_permitidos TEXT[],
    p_exigir_dispositivo BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_ip VARCHAR(64);
    v_qtd_disp INT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige Super Admin com 2FA (AAL2).';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_ip := public.request_client_ip();

    IF p_restringir_ip = true AND (p_ips_permitidos IS NULL OR array_length(p_ips_permitidos, 1) IS NULL) THEN
        RAISE EXCEPTION 'Cadastre ao menos um endereço IP válido (ex: %) antes de ativar a restrição por IP.', v_ip;
    END IF;

    IF p_exigir_dispositivo = true THEN
        SELECT COUNT(*) INTO v_qtd_disp
        FROM public.super_admin_dispositivo
        WHERE usuario_id = v_usuario_id AND revogado_em IS NULL;

        IF v_qtd_disp = 0 THEN
            RAISE EXCEPTION 'Autorize primeiro este navegador/computador como Dispositivo Confiável antes de exigir a trava.';
        END IF;
    END IF;

    INSERT INTO public.super_admin_politica (
        usuario_id, mfa_obrigatorio, restringir_ip, ips_permitidos, exigir_dispositivo_confiavel, atualizado_em
    ) VALUES (
        v_usuario_id, true, COALESCE(p_restringir_ip, false), COALESCE(p_ips_permitidos, '{}'), COALESCE(p_exigir_dispositivo, false), now()
    )
    ON CONFLICT (usuario_id) DO UPDATE SET
        restringir_ip = EXCLUDED.restringir_ip,
        ips_permitidos = EXCLUDED.ips_permitidos,
        exigir_dispositivo_confiavel = EXCLUDED.exigir_dispositivo_confiavel,
        atualizado_em = now();

    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        NULL, v_usuario_id, 'ATUALIZACAO_POLITICA_ZERO_TRUST', 'Política Super Admin',
        format('restringir_ip=%s, exigir_dispositivo=%s', p_restringir_ip, p_exigir_dispositivo),
        v_ip, public.request_user_agent(), 'WARN', false
    );
END;
$$;

-- 6.6. Ativa Break-Glass Auditado por 30 minutos (visível ao Tenant conforme LGPD)
CREATE OR REPLACE FUNCTION public.ativar_break_glass_suporte(
    p_tenant_id UUID,
    p_justificativa TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_ip VARCHAR(64);
    v_id UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: exige Super Admin autenticado com 2FA.';
    END IF;

    IF LENGTH(TRIM(COALESCE(p_justificativa, ''))) < 10 THEN
        RAISE EXCEPTION 'A justificativa técnica deve conter ao menos 10 caracteres para fins de auditoria LGPD.';
    END IF;

    v_usuario_id := public.current_usuario_id();
    v_ip := public.request_client_ip();

    UPDATE public.super_admin_break_glass
    SET ativo = false
    WHERE usuario_id = v_usuario_id AND ativo = true;

    INSERT INTO public.super_admin_break_glass (usuario_id, tenant_id, justificativa, ip)
    VALUES (v_usuario_id, p_tenant_id, TRIM(p_justificativa), v_ip)
    RETURNING id INTO v_id;

    -- Este registro É visivel_tenant = true por transparência contratual LGPD (Seção 6.7)
    INSERT INTO public.log_auditoria (
        tenant_id, usuario_id, acao, recurso, justificativa, ip, user_agent, nivel, visivel_tenant
    ) VALUES (
        p_tenant_id, NULL, 'SUPORTE_EMERGENCIAL_BREAK_GLASS', 'Ambiente Operacional do Tenant',
        TRIM(p_justificativa), v_ip, public.request_user_agent(), 'WARN', true
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_break_glass_suporte()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.super_admin_break_glass
    SET ativo = false
    WHERE usuario_id = public.current_usuario_id() AND ativo = true;
END;
$$;

-- 6.7. Registra evento geral de auditoria LGPD / Operacional
CREATE OR REPLACE FUNCTION public.registrar_auditoria(
    p_acao TEXT,
    p_recurso TEXT,
    p_justificativa TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_usuario RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    SELECT id, tenant_id, perfil INTO v_usuario
    FROM public.usuario
    WHERE auth_user_id = v_uid
    LIMIT 1;

    IF v_usuario.id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.log_auditoria (
        tenant_id,
        usuario_id,
        acao,
        recurso,
        justificativa,
        ip,
        user_agent,
        nivel,
        visivel_tenant
    ) VALUES (
        COALESCE(v_usuario.tenant_id, public.active_break_glass_tenant_id()),
        CASE WHEN v_usuario.perfil = 'super_admin' THEN NULL ELSE v_usuario.id END,
        LEFT(TRIM(p_acao), 100),
        LEFT(TRIM(p_recurso), 255),
        LEFT(p_justificativa, 500),
        public.request_client_ip(),
        public.request_user_agent(),
        'INFO',
        CASE WHEN v_usuario.perfil = 'super_admin' THEN false ELSE true END
    );
END;
$$;

-- ====================================================================
-- 7. Permissões Explícitas de Papéis (Princípio do Menor Privilégio)
-- ====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.tenant,
    public.config_tenant,
    public.usuario,
    public.cliente,
    public.classificacao,
    public.fornecedor,
    public.compra_item,
    public.encomenda,
    public.encomenda_item,
    public.pagamento,
    public.importacao_xml,
    public.notificacao,
    public.reserva,
    public.reserva_item,
    public.funcionario,
    public.super_admin_politica,
    public.super_admin_dispositivo,
    public.super_admin_break_glass
TO authenticated;

GRANT SELECT, INSERT ON public.evento_historico, public.log_auditoria TO authenticated;

-- Anon pode APENAS consultar rate-limit e registrar evento de login
REVOKE ALL ON FUNCTION public.registrar_dispositivo_super_admin(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.atualizar_politica_super_admin(BOOLEAN, TEXT[], BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.ativar_break_glass_suporte(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verificar_bloqueio_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_login(TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_contexto_super_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_dispositivo_super_admin(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_politica_super_admin(BOOLEAN, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_break_glass_suporte(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_break_glass_suporte() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, TEXT) TO authenticated;


-- === seed.sql ===
-- ====================================================================
-- SISTEMA MÃE DE ENCOMENDAS MULTI-TENANT
-- Seed inicial para desenvolvimento e testes de isolamento multi-tenant
-- ====================================================================

-- 1. Tenants de Teste
INSERT INTO tenant (id, nome_empresa, slug, dominio, status, plano, limite_encomendas_mes) VALUES
('a0000000-0000-0000-0000-000000000001', 'Drogaria Aeroporto', 'aeroporto', 'aeroporto.farmacia.local', 'ativo', 'profissional', 1000),
('b0000000-0000-0000-0000-000000000002', 'Farmácia Boa Esperança', 'boaesperanca', 'boaesperanca.farmacia.local', 'ativo', 'basico', 300)
ON CONFLICT (id) DO NOTHING;

-- 2. Configurações dos Tenants
INSERT INTO config_tenant (tenant_id, nome_sistema, cor_primaria, cor_secundaria, mensagem_whatsapp) VALUES
('a0000000-0000-0000-0000-000000000001', 'Drogaria Aeroporto Manager', '#0284c7', '#0f172a', 'Olá {cliente}! Seu pedido de {medicamento} já está disponível para retirada na Drogaria Aeroporto. Aguardamos sua visita!'),
('b0000000-0000-0000-0000-000000000002', 'Boa Esperança Encomendas', '#16a34a', '#14532d', 'Olá {cliente}! Seu produto {medicamento} chegou na Farmácia Boa Esperança. Pode retirar quando quiser!')
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Classificações
INSERT INTO classificacao (id, tenant_id, nome, ordem) VALUES
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'FÓRMULA / MANIPULADO', 1),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'GENÉRICO / SIMILAR', 2),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'REFERÊNCIA', 3),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'PERFUMARIA / HIGIENE', 4),
-- Tenant B
('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'MEDICAMENTOS', 1),
('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'COSMÉTICOS', 2)
ON CONFLICT (id) DO NOTHING;

-- 4. Usuários (UUIDs hexadecimais RFC 4122; conta Super Admin é provisionada separadamente com identificador não óbvio e 2FA obrigatório)
INSERT INTO usuario (id, tenant_id, nome, email, perfil, ativo) VALUES
-- Tenant A
('01000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Carlos Gerente', 'carlos@aeroporto.com.br', 'admin', true),
('01000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ana Balcão', 'ana@aeroporto.com.br', 'operador', true),
('01000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Roberto Compras', 'roberto@aeroporto.com.br', 'comprador', true),
-- Tenant B
('01000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Mariana Admin', 'mariana@boaesperanca.com.br', 'admin', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Fornecedores
INSERT INTO fornecedor (id, tenant_id, nome, cnpj, contato, telefone, email) VALUES
('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Distribuidora Panpharma', '12.345.678/0001-90', 'Marcos Vendas', '11 98765-4321', 'pedidos@panpharma.com.br'),
('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'SantaCruz Distribuidora', '98.765.432/0001-10', 'Juliana', '11 91234-5678', 'contato@santacruz.com.br'),
-- Tenant B
('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Profarma Distribuidora', '45.678.901/0001-23', 'Renato', '21 99999-8888', 'comercial@profarma.com.br')
ON CONFLICT (id) DO NOTHING;

-- 6. Clientes
INSERT INTO cliente (id, tenant_id, nome, cpf, cpf_hash, telefone, endereco, base_legal) VALUES
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Maria Oliveira Santos', '123.456.789-00', encode(digest('12345678900', 'sha256'), 'hex'), '(11) 98111-2233', 'Rua das Flores, 120, Apto 42', 'execucao_contrato'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'João Pereira Lima', '987.654.321-11', encode(digest('98765432111', 'sha256'), 'hex'), '(11) 97222-3344', NULL, 'execucao_contrato'),
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Clara Mendonça Costa', '555.666.777-88', encode(digest('55566677788', 'sha256'), 'hex'), '(11) 99333-4455', 'Av. Central, 500', 'execucao_contrato'),
-- Tenant B
('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Fernanda Souza', '222.333.444-55', encode(digest('22233344455', 'sha256'), 'hex'), '(21) 98888-7777', NULL, 'execucao_contrato')
ON CONFLICT (id) DO NOTHING;

-- 7. Encomendas do Tenant A
INSERT INTO encomenda (id, tenant_id, cliente_id, codigo_rastreio, status, observacao, criado_por) VALUES
('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'ENC-2026-001', 'Aguardando', 'Cliente precisa com urgência para viagem', '01000000-0000-0000-0000-000000000002'),
('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'ENC-2026-002', 'Aguardando', 'Avisar no WhatsApp assim que chegar', '01000000-0000-0000-0000-000000000002'),
('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'ENC-2026-003', 'Aguardando', 'Receita médica entregue física no balcão', '01000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- 8. Itens da Encomenda (o trigger criará automaticamente os registros em CompraItem!)
INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao, quantidade, preco_unitario, classificacao_id, controlado, urgente) VALUES
('09000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Ozempic 1mg Solução Injetável', 1, 1050.00, 'c0000000-0000-0000-0000-000000000003', false, true),
('09000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Agulhas para Caneta Novofine 32G cx 100', 1, 95.00, 'c0000000-0000-0000-0000-000000000004', false, false),
('09000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Rivotril 2mg c/ 30 Comprimidos', 2, 28.50, 'c0000000-0000-0000-0000-000000000002', true, false),
('09000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'Venvanse 50mg c/ 28 Cápsulas', 1, 480.00, 'c0000000-0000-0000-0000-000000000003', true, true)
ON CONFLICT (id) DO NOTHING;

-- 9. Pagamentos (parcial para encomenda 1, total para encomenda 3)
INSERT INTO pagamento (tenant_id, encomenda_id, valor, forma, tipo, registrado_por) VALUES
('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 500.00, 'pix', 'pagamento', '01000000-0000-0000-0000-000000000002'),
('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 480.00, 'cartao_credito', 'pagamento', '01000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;


-- === 20261029000007_visual_identity_and_whatsapp.sql ===
-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 07
-- Identidade Visual Completa (White-Label SaaS) e Automação de Modelos WhatsApp
-- ====================================================================

ALTER TABLE public.config_tenant
    ADD COLUMN IF NOT EXISTS slogan_sistema VARCHAR(255) DEFAULT 'Gestão de Encomendas',
    ADD COLUMN IF NOT EXISTS saudacao_painel VARCHAR(255) DEFAULT 'Bem-vindo',
    ADD COLUMN IF NOT EXISTS visual_opcoes JSONB NOT NULL DEFAULT '{"estilo_sidebar":"claro","formato_logo":"retangular","estilo_bordas":"padrao","densidade_interface":"confortavel","fonte_interface":"jakarta","cor_destaque":"#059669","exibir_selo_encomed":true,"animacoes_ativas":true}'::jsonb,
    ADD COLUMN IF NOT EXISTS mensagem_whatsapp_entregue TEXT DEFAULT 'Olá {cliente}! Registramos a retirada do seu pedido de {medicamento} na {loja}. Agradecemos a preferência e desejamos ótima saúde!',
    ADD COLUMN IF NOT EXISTS auto_whatsapp_pedido BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_whatsapp_entregue BOOLEAN NOT NULL DEFAULT false;

-- Recarrega cache do PostgREST para reconhecer imediatamente as novas colunas na API REST
NOTIFY pgrst, 'reload schema';



-- === 20261029000008_api_and_sql_rate_limiting.sql ===
-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 08
-- Proteção contra Ataques, Rate Limiting de API/SQL e Timeouts de Query
-- ====================================================================

ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE authenticated SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.rate_limit_requisicao (
    chave VARCHAR(160) NOT NULL,
    escopo VARCHAR(80) NOT NULL,
    janela_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contagem INTEGER NOT NULL DEFAULT 1,
    bloqueios_acumulados INTEGER NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chave, escopo)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_atualizado_em
    ON public.rate_limit_requisicao (atualizado_em);

ALTER TABLE public.rate_limit_requisicao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_requisicao FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.verificar_rate_limit_requisicao(
    p_escopo TEXT,
    p_limite INTEGER DEFAULT 60,
    p_janela_segundos INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid TEXT;
    v_ip TEXT;
    v_chave TEXT;
    v_agora TIMESTAMPTZ := clock_timestamp();
    v_janela_inicio TIMESTAMPTZ;
    v_contagem INTEGER;
    v_segundos_restantes INTEGER;
BEGIN
    v_uid := auth.uid()::text;
    v_ip := COALESCE(public.request_client_ip(), 'ip_desconhecido');
    v_chave := COALESCE('uid:' || v_uid, 'ip:' || v_ip);

    DELETE FROM public.rate_limit_requisicao
    WHERE atualizado_em < (v_agora - INTERVAL '15 minutes')
      AND random() < 0.03;

    INSERT INTO public.rate_limit_requisicao (chave, escopo, janela_inicio, contagem, atualizado_em)
    VALUES (v_chave, LEFT(COALESCE(p_escopo, 'geral'), 80), v_agora, 1, v_agora)
    ON CONFLICT (chave, escopo) DO UPDATE
    SET
        contagem = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora
            THEN 1
            ELSE public.rate_limit_requisicao.contagem + 1
        END,
        janela_inicio = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora
            THEN v_agora
            ELSE public.rate_limit_requisicao.janela_inicio
        END,
        bloqueios_acumulados = CASE
            WHEN public.rate_limit_requisicao.janela_inicio + make_interval(secs => p_janela_segundos) > v_agora
                 AND public.rate_limit_requisicao.contagem >= p_limite
            THEN public.rate_limit_requisicao.bloqueios_acumulados + 1
            ELSE public.rate_limit_requisicao.bloqueios_acumulados
        END,
        atualizado_em = v_agora
    RETURNING janela_inicio, contagem INTO v_janela_inicio, v_contagem;

    v_segundos_restantes := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM ((v_janela_inicio + make_interval(secs => p_janela_segundos)) - v_agora)))::INTEGER
    );

    IF v_contagem > p_limite THEN
        RETURN jsonb_build_object(
            'permitido', false,
            'contagem', v_contagem,
            'limite', p_limite,
            'restantes', 0,
            'segundos_restantes', v_segundos_restantes
        );
    END IF;

    RETURN jsonb_build_object(
        'permitido', true,
        'contagem', v_contagem,
        'limite', p_limite,
        'restantes', GREATEST(0, p_limite - v_contagem),
        'segundos_restantes', v_segundos_restantes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_rate_limit_requisicao(TEXT, INTEGER, INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_limitar_mutacoes_sql()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check JSONB;
BEGIN
    IF auth.uid() IS NULL AND public.request_client_ip() IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_check := public.verificar_rate_limit_requisicao('sql_mut_' || TG_TABLE_NAME, 90, 60);

    IF COALESCE((v_check->>'permitido')::boolean, true) = false THEN
        RAISE EXCEPTION 'Limite de segurança de requisições SQL excedido para a tabela %. Aguarde % segundos.',
            TG_TABLE_NAME,
            COALESCE(v_check->>'segundos_restantes', '15')
            USING ERRCODE = 'P0001';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_sql_cliente ON public.cliente;
CREATE TRIGGER trg_rate_limit_sql_cliente
    BEFORE INSERT OR UPDATE OR DELETE ON public.cliente
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_encomenda ON public.encomenda;
CREATE TRIGGER trg_rate_limit_sql_encomenda
    BEFORE INSERT OR UPDATE OR DELETE ON public.encomenda
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_encomenda_item ON public.encomenda_item;
CREATE TRIGGER trg_rate_limit_sql_encomenda_item
    BEFORE INSERT OR UPDATE OR DELETE ON public.encomenda_item
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_compra_item ON public.compra_item;
CREATE TRIGGER trg_rate_limit_sql_compra_item
    BEFORE INSERT OR UPDATE OR DELETE ON public.compra_item
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_pagamento ON public.pagamento;
CREATE TRIGGER trg_rate_limit_sql_pagamento
    BEFORE INSERT OR UPDATE OR DELETE ON public.pagamento
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_fornecedor ON public.fornecedor;
CREATE TRIGGER trg_rate_limit_sql_fornecedor
    BEFORE INSERT OR UPDATE OR DELETE ON public.fornecedor
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_classificacao ON public.classificacao;
CREATE TRIGGER trg_rate_limit_sql_classificacao
    BEFORE INSERT OR UPDATE OR DELETE ON public.classificacao
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_funcionario ON public.funcionario;
CREATE TRIGGER trg_rate_limit_sql_funcionario
    BEFORE INSERT OR UPDATE OR DELETE ON public.trg_limitar_mutacoes_sql();

DROP TRIGGER IF EXISTS trg_rate_limit_sql_config_tenant ON public.config_tenant;
CREATE TRIGGER trg_rate_limit_sql_config_tenant
    BEFORE INSERT OR UPDATE OR DELETE ON public.config_tenant
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_limitar_mutacoes_sql();

NOTIFY pgrst, 'reload schema';
