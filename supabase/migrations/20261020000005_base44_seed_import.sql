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
