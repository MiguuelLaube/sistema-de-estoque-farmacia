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
