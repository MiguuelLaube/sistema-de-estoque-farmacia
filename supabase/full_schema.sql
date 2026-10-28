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
-- ====================================================================
-- MIGRAÇÃO DE DADOS LEGADOS: DROGARIA AEROPORTO (BASE44)
-- Gerado automaticamente pelo script ETL scripts/migrate-base44.ts
-- Data de geração: 2026-10-26T03:05:29.846Z
-- Tenant Alvo: a0000000-0000-0000-0000-000000000001
-- ====================================================================

-- 1. Inserção de Clientes
INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'MARIA APARECIDA DA SILVA', '(11) 98765-4321', '12345678901', 'consentimento')
ON CONFLICT DO NOTHING;
INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'JOAO CARLOS PEREIRA', '(11) 97654-3210', '23456789012', 'consentimento')
ON CONFLICT DO NOTHING;
INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'ANA CLAUDIA SANTOS', '(11) 96543-2109', NULL, 'consentimento')
ON CONFLICT DO NOTHING;
INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'ROBERTO ALMEIDA COSTA', '(11) 95432-1098', NULL, 'consentimento')
ON CONFLICT DO NOTHING;
INSERT INTO cliente (tenant_id, nome, telefone, cpf, base_legal)
VALUES ('a0000000-0000-0000-0000-000000000001', 'FERNANDA LIMA SOUZA', '(11) 94321-0987', NULL, 'consentimento')
ON CONFLICT DO NOTHING;

-- 2. Inserção de Itens da Lista de Compras
INSERT INTO item_compra (tenant_id, nome, classificacao, quantidade, status, urgente)
VALUES ('a0000000-0000-0000-0000-000000000001', 'DIPIRONA 500MG 20ML GOTAS', 'GENERICO', 15, 'Pendente', true)
ON CONFLICT DO NOTHING;
INSERT INTO item_compra (tenant_id, nome, classificacao, quantidade, status, urgente)
VALUES ('a0000000-0000-0000-0000-000000000001', 'AMOXICILINA 500MG 21 CAPS', 'ANTIBIOTICO', 8, 'Pendente', false)
ON CONFLICT DO NOTHING;
INSERT INTO item_compra (tenant_id, nome, classificacao, quantidade, status, urgente)
VALUES ('a0000000-0000-0000-0000-000000000001', 'LOSARTANA POTASSICA 50MG 30 COMP', 'GENERICO', 20, 'Pendente', true)
ON CONFLICT DO NOTHING;
INSERT INTO item_compra (tenant_id, nome, classificacao, quantidade, status, urgente)
VALUES ('a0000000-0000-0000-0000-000000000001', 'DORFLEX 36 COMPRIMIDOS', 'REFERENCIA', 12, 'Pendente', false)
ON CONFLICT DO NOTHING;

-- 3. Inserção de Encomendas e Itens com Total Corrigido

-- Encomenda enc-b44-0001 (MARIA APARECIDA DA SILVA)
INSERT INTO encomenda (id, tenant_id, codigo_encomenda, status_geral, status_financeiro, valor_total, valor_pago, observacoes, criado_em)
VALUES ('enc-b44-0001', 'a0000000-0000-0000-0000-000000000001', 'ENC-1000', 'Aguardando', 'nao_pago', 1065.00, 0.00, 'Cliente ligou pedindo urgência para amanhã cedo', '2026-10-25T03:05:29.845Z')
ON CONFLICT DO NOTHING;
INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao_produto, quantidade, preco_unitario, status_item)
VALUES ('enc-b44-0001-it-1', 'a0000000-0000-0000-0000-000000000001', 'enc-b44-0001', 'OZEMPIC 1MG CANETA INJETAVEL', 1, 980.00, 'Aguardando')
ON CONFLICT DO NOTHING;
INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao_produto, quantidade, preco_unitario, status_item)
VALUES ('enc-b44-0001-it-2', 'a0000000-0000-0000-0000-000000000001', 'enc-b44-0001', 'AGULHAS NOVOFINE 31G 100 UNID', 1, 85.00, 'Aguardando')
ON CONFLICT DO NOTHING;

-- Encomenda enc-b44-0002 (JOAO CARLOS PEREIRA)
INSERT INTO encomenda (id, tenant_id, codigo_encomenda, status_geral, status_financeiro, valor_total, valor_pago, observacoes, criado_em)
VALUES ('enc-b44-0002', 'a0000000-0000-0000-0000-000000000001', 'ENC-1001', 'Chegou', 'pago', 65.00, 65.00, 'Pago adiantado via PIX', '2026-10-24T03:05:29.846Z')
ON CONFLICT DO NOTHING;
INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao_produto, quantidade, preco_unitario, status_item)
VALUES ('enc-b44-0002-it-1', 'a0000000-0000-0000-0000-000000000001', 'enc-b44-0002', 'RIVOTRIL 2MG 30 COMPRIMIDOS', 2, 32.50, 'Chegou')
ON CONFLICT DO NOTHING;
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

-- 4. Usuários
INSERT INTO usuario (id, tenant_id, nome, email, perfil, ativo) VALUES
-- Tenant A
('u0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Carlos Gerente', 'carlos@aeroporto.com.br', 'admin', true),
('u0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ana Balcão', 'ana@aeroporto.com.br', 'operador', true),
('u0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Roberto Compras', 'roberto@aeroporto.com.br', 'comprador', true),
-- Tenant B
('u0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Mariana Admin', 'mariana@boaesperanca.com.br', 'admin', true),
-- Super Admin Geral (sem tenant_id)
('u0000000-0000-0000-0000-000000000099', NULL, 'Super Administrador', 'superadmin@plataforma.com.br', 'super_admin', true)
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
('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'ENC-2026-001', 'Aguardando', 'Cliente precisa com urgência para viagem', 'u0000000-0000-0000-0000-000000000002'),
('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'ENC-2026-002', 'Aguardando', 'Avisar no WhatsApp assim que chegar', 'u0000000-0000-0000-0000-000000000002'),
('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'ENC-2026-003', 'Aguardando', 'Receita médica entregue física no balcão', 'u0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- 8. Itens da Encomenda (o trigger criará automaticamente os registros em CompraItem!)
INSERT INTO encomenda_item (id, tenant_id, encomenda_id, descricao, quantidade, preco_unitario, classificacao_id, controlado, urgente) VALUES
('i0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Ozempic 1mg Solução Injetável', 1, 1050.00, 'c0000000-0000-0000-0000-000000000003', false, true),
('i0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Agulhas para Caneta Novofine 32G cx 100', 1, 95.00, 'c0000000-0000-0000-0000-000000000004', false, false),
('i0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Rivotril 2mg c/ 30 Comprimidos', 2, 28.50, 'c0000000-0000-0000-0000-000000000002', true, false),
('i0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'Venvanse 50mg c/ 28 Cápsulas', 1, 480.00, 'c0000000-0000-0000-0000-000000000003', true, true)
ON CONFLICT (id) DO NOTHING;

-- 9. Pagamentos (parcial para encomenda 1, total para encomenda 3)
INSERT INTO pagamento (tenant_id, encomenda_id, valor, forma, tipo, registrado_por) VALUES
('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 500.00, 'pix', 'pagamento', 'u0000000-0000-0000-0000-000000000002'),
('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 480.00, 'cartao_credito', 'pagamento', 'u0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
