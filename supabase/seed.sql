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
