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

