-- ====================================================================
-- MIGRAÇÃO DE DADOS LEGADOS (HOMOLOGAÇÃO): DROGARIA AEROPORTO
-- Corrigida (BUG-05): nomes reais de tabelas/colunas e UUIDs RFC 4122 válidos
-- ====================================================================

-- 1. Clientes de homologação
INSERT INTO cliente (id, tenant_id, nome, telefone, cpf, cpf_hash, base_legal) VALUES
('d0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'MARIA APARECIDA DA SILVA', '(11) 98765-4321', '123.456.789-01', encode(extensions.digest('12345678901', 'sha256'), 'hex'), 'consentimento'),
('d0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'JOAO CARLOS PEREIRA', '(11) 97654-3210', '234.567.890-12', encode(extensions.digest('23456789012', 'sha256'), 'hex'), 'consentimento')
ON CONFLICT (id) DO NOTHING;

-- 2. Itens da Lista de Compras
INSERT INTO compra_item (id, tenant_id, descricao, descricao_normalizada, classificacao_id, quantidade, status, urgente) VALUES
('02000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'DIPIRONA 500MG 20ML GOTAS', 'DIPIRONA 500MG 20ML GOTAS', 'c0000000-0000-0000-0000-000000000002', 15, 'Aguardando', true),
('02000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'DORFLEX 36 COMPRIMIDOS', 'DORFLEX 36 COMPRIMIDOS', 'c0000000-0000-0000-0000-000000000003', 12, 'Aguardando', false)
ON CONFLICT (id) DO NOTHING;
