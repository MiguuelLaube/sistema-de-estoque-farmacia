-- ====================================================================
-- SISTEMA ENCOMED - MIGRAÇÃO 09
-- Quitação Automática na Entrega de Encomenda (Entregue = Paga)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.trg_encomenda_entregue_quitar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_falta NUMERIC(10, 2);
    v_registrado_por UUID;
BEGIN
    IF NEW.status = 'Entregue' AND (OLD.status IS DISTINCT FROM 'Entregue') THEN
        v_falta := GREATEST(0.00, NEW.valor_total - NEW.valor_pago);
        IF v_falta > 0.00 THEN
            v_registrado_por := COALESCE(NEW.entregue_por, auth.uid(), NEW.criado_por);
            INSERT INTO public.pagamento (
                id,
                tenant_id,
                encomenda_id,
                valor,
                forma,
                tipo,
                registrado_por,
                data
            ) VALUES (
                gen_random_uuid(),
                NEW.tenant_id,
                NEW.id,
                v_falta,
                'dinheiro',
                'pagamento',
                v_registrado_por,
                COALESCE(NEW.entregue_em, now())
            );
        END IF;

        UPDATE public.encomenda_item
        SET status_item = 'Chegou'
        WHERE tenant_id = NEW.tenant_id
          AND encomenda_id = NEW.id
          AND status_item <> 'Chegou';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encomenda_entregue_quitar ON public.encomenda;
CREATE TRIGGER trg_encomenda_entregue_quitar
    AFTER UPDATE OF status ON public.encomenda
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_encomenda_entregue_quitar();

-- Retroativo: se já existirem encomendas entregues com saldo pendente, quita automaticamente
DO $$
DECLARE
    r RECORD;
    v_falta NUMERIC(10, 2);
BEGIN
    FOR r IN
        SELECT id, tenant_id, valor_total, valor_pago, entregue_por, entregue_em, criado_por
        FROM public.encomenda
        WHERE status = 'Entregue'
          AND valor_total > valor_pago
    LOOP
        v_falta := GREATEST(0.00, r.valor_total - r.valor_pago);
        IF v_falta > 0.00 THEN
            INSERT INTO public.pagamento (
                id,
                tenant_id,
                encomenda_id,
                valor,
                forma,
                tipo,
                registrado_por,
                data
            ) VALUES (
                gen_random_uuid(),
                r.tenant_id,
                r.id,
                v_falta,
                'dinheiro',
                'pagamento',
                COALESCE(r.entregue_por, r.criado_por),
                COALESCE(r.entregue_em, now())
            );
        END IF;
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

