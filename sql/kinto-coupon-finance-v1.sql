-- Coupon funding affects customer collection and pending V161 vendor finance only.
-- Run before deploying the UI. Atomic, repeatable; no ACL or order workflow changes.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_coupon_finance_backup_v1 (
 kind text NOT NULL, key text NOT NULL, before_value jsonb NOT NULL, after_value jsonb,
 captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,key)
);
REVOKE ALL ON private.kinto_coupon_finance_backup_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_coupon_currency_v1(v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE upper(btrim(coalesce(v,''))) WHEN '$' THEN 'USD' WHEN 'TL' THEN 'TRY' WHEN '€' THEN 'EUR' ELSE upper(btrim(coalesce(v,''))) END
$$;
CREATE OR REPLACE FUNCTION private.kinto_coupon_amount_v1(v text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric; BEGIN
 IF v IS NULL OR v !~ '^[0-9]+([.][0-9]+)?$' THEN RETURN 0; END IF;
 n:=v::numeric; RETURN greatest(0,n);
END $$;
CREATE OR REPLACE FUNCTION private.kinto_coupon_goods_v1(o jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $$
DECLARE price numeric:=private.kinto_coupon_amount_v1(o->>'total_price'); discount numeric;
BEGIN
 discount:=private.kinto_coupon_amount_v1(o->>'reward_discount_amount');
 IF private.kinto_coupon_currency_v1(o->>'currency')=private.kinto_coupon_currency_v1(o->>'reward_discount_currency') THEN RETURN greatest(0,price-discount); END IF;
 RETURN price;
END $$;
REVOKE ALL ON FUNCTION private.kinto_coupon_currency_v1(text),private.kinto_coupon_amount_v1(text),private.kinto_coupon_goods_v1(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_coupon_segment_finance_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE o public.orders%rowtype; s jsonb:=NEW.commission_snapshot; c jsonb; original numeric; discount numeric:=0;
 vendor_discount numeric:=0; platform_discount numeric:=0; basis numeric; rate numeric; other numeric; known boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  -- The legacy orders.details sync carries a pre-coupon snapshot. It must not undo a saved settlement.
  IF OLD.commission_snapshot->>'coupon_finance_version'='v1' AND s->>'coupon_finance_version' IS DISTINCT FROM 'v1' THEN
   NEW.commission_snapshot:=OLD.commission_snapshot; NEW.vendor_payment_status:=OLD.vendor_payment_status; s:=NEW.commission_snapshot;
  END IF;
 END IF;
 IF coalesce(s->>'version','')<>'v161' OR NEW.vendor_settlement_archive_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.vendor_settlement_archive_id IS NOT NULL OR coalesce(OLD.vendor_payment_status,'pending')='paid' OR OLD.commission_snapshot->>'vendor_payment_status'='paid' THEN RETURN NEW; END IF;
 END IF;
 SELECT * INTO o FROM public.orders WHERE id=NEW.order_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 c:=o.reward_discount_snapshot;
 original:=greatest(0,coalesce(NEW.subtotal_local,0));
 known:=coalesce(c->>'source','') IN ('kinto_coupon_v401','kinto_store_coupon_v310')
  AND c->>'store_id'=NEW.store_id::text
  AND private.kinto_coupon_currency_v1(o.reward_discount_currency)=private.kinto_coupon_currency_v1(NEW.currency)
  AND private.kinto_coupon_currency_v1(o.currency)=private.kinto_coupon_currency_v1(NEW.currency);
 IF known THEN
  discount:=least(original,private.kinto_coupon_amount_v1(o.reward_discount_amount::text));
  IF c->>'funded_by'='vendor' THEN vendor_discount:=discount;
  ELSIF c->>'funded_by'='kinto' THEN platform_discount:=discount;
  ELSIF c->>'funded_by'='mixed' THEN
   vendor_discount:=least(discount,private.kinto_coupon_amount_v1(c->>'vendor_points'));
   platform_discount:=discount-vendor_discount;
  ELSE RETURN NEW;
  END IF;
 ELSIF s->>'coupon_finance_version' IS DISTINCT FROM 'v1' THEN RETURN NEW;
 END IF;
 basis:=original-vendor_discount;
 rate:=private.kinto_coupon_amount_v1(s->>'commission_rate');
 other:=private.kinto_coupon_amount_v1(s->>'other_deductions');
 NEW.commission_snapshot:=s||jsonb_build_object('coupon_finance_version','v1',
  'original_goods_amount',original,'vendor_coupon_discount',vendor_discount,'kinto_coupon_discount',platform_discount,
  'customer_goods_amount',original-discount,'commission_basis','goods_after_vendor_coupon',
  'gross_amount',basis,'commission_amount',round(basis*rate/100,2),'net_amount',round(basis-round(basis*rate/100,2)-other,2));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_coupon_segment_finance_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_kinto_coupon_segment_finance_v1 ON public.order_store_segments;
CREATE TRIGGER trg_kinto_coupon_segment_finance_v1 BEFORE INSERT OR UPDATE OF commission_snapshot,subtotal_local ON public.order_store_segments
 FOR EACH ROW EXECUTE FUNCTION private.kinto_coupon_segment_finance_v1();

CREATE OR REPLACE FUNCTION private.kinto_coupon_sync_finance_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 UPDATE public.order_store_segments SET commission_snapshot=commission_snapshot
 WHERE order_id=NEW.id AND vendor_settlement_archive_id IS NULL
 AND coalesce(vendor_payment_status,'pending')<>'paid' AND coalesce(commission_snapshot->>'vendor_payment_status','pending')<>'paid'
 AND commission_snapshot->>'version'='v161';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_coupon_sync_finance_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_kinto_coupon_sync_finance_v1 ON public.orders;
CREATE TRIGGER trg_kinto_coupon_sync_finance_v1 AFTER UPDATE OF reward_discount_amount,reward_discount_currency,reward_discount_snapshot ON public.orders
 FOR EACH ROW EXECUTE FUNCTION private.kinto_coupon_sync_finance_v1();

-- Preserve each installed RPC and replace only its price operand; auth, locks and validation stay intact.
DO $$
DECLARE r record; body text; patched text; needle text; replacement text; expected integer; actual integer;
BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('kinto_request_settlements_session_v1','kinto_decide_settlement_session_v1','kinto_cash_settle_courier_session_v1') LOOP
  body:=pg_get_functiondef(r.oid);
  IF position('private.kinto_coupon_goods_v1(' IN body)>0 THEN CONTINUE; END IF;
  IF r.proname='kinto_decide_settlement_session_v1' THEN
   needle:='private.kinto_settlement_amounts_v1(entry.total_price,';
   replacement:='private.kinto_settlement_amounts_v1(private.kinto_coupon_goods_v1(to_jsonb(entry)),'; expected:=2;
  ELSE
   needle:='private.kinto_settlement_amounts_v1((r->>''total_price'')::numeric,';
   replacement:='private.kinto_settlement_amounts_v1(private.kinto_coupon_goods_v1(r),';expected:=1;
  END IF;
  actual:=(length(body)-length(replace(body,needle,'')))/length(needle);
  IF actual<>expected THEN RAISE EXCEPTION 'COUPON_FINANCE_RPC_SHAPE_CHANGED: %',r.proname; END IF;
  patched:=replace(body,needle,replacement);
  INSERT INTO private.kinto_coupon_finance_backup_v1(kind,key,before_value,after_value)
   VALUES('function',r.oid::regprocedure::text,to_jsonb(body),to_jsonb(patched)) ON CONFLICT DO NOTHING;
  EXECUTE patched;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('kinto_request_settlements_session_v1','kinto_decide_settlement_session_v1','kinto_cash_settle_courier_session_v1'))<>3 THEN RAISE EXCEPTION 'COUPON_FINANCE_RPC_MISSING'; END IF;
END $$;

-- Existing pending, unarchived coupon finance only. Never change orders.total_price or paid history.
INSERT INTO private.kinto_coupon_finance_backup_v1(kind,key,before_value)
 SELECT 'segment',s.id::text,s.commission_snapshot FROM public.order_store_segments s JOIN public.orders o ON o.id=s.order_id
 WHERE s.commission_snapshot->>'version'='v161' AND s.commission_snapshot->>'coupon_finance_version' IS DISTINCT FROM 'v1'
 AND s.vendor_settlement_archive_id IS NULL AND coalesce(s.vendor_payment_status,'pending')<>'paid'
 AND coalesce(s.commission_snapshot->>'vendor_payment_status','pending')<>'paid'
 AND o.reward_discount_amount>0 AND o.reward_discount_snapshot->>'source' IN ('kinto_coupon_v401','kinto_store_coupon_v310')
 AND o.reward_discount_snapshot->>'store_id'=s.store_id::text ON CONFLICT DO NOTHING;
UPDATE public.order_store_segments s SET commission_snapshot=s.commission_snapshot
 FROM private.kinto_coupon_finance_backup_v1 b WHERE b.kind='segment' AND b.key=s.id::text AND b.after_value IS NULL;
UPDATE private.kinto_coupon_finance_backup_v1 b SET after_value=s.commission_snapshot
 FROM public.order_store_segments s WHERE b.kind='segment' AND b.key=s.id::text AND b.after_value IS NULL;
COMMIT;
SELECT 'coupon finance v1 installed' result,count(*) FILTER(WHERE before_value IS DISTINCT FROM after_value) corrected_pending_segments
 FROM private.kinto_coupon_finance_backup_v1 WHERE kind='segment';
