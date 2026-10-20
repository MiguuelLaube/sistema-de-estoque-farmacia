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
