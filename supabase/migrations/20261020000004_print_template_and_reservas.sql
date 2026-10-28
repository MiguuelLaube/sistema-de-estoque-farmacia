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
