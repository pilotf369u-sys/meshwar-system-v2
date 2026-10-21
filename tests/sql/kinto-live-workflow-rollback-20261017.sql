-- Explicitly authorized rollback-only live workflow rehearsal, NOT a migration.
-- Synthetic accounts are visible only inside the test transaction. Sequence numbers can advance.
-- Expected custom exception rolls back all fixture rows; unexpected errors also roll back.
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';SET LOCAL search_path=pg_catalog,public,private,extensions,pg_temp;
CREATE OR REPLACE FUNCTION pg_temp.expect(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'WORKFLOW_ASSERTION_FAILED: %',label;END IF;END$$;
CREATE OR REPLACE FUNCTION pg_temp.kinto_workflow_run_v1() RETURNS jsonb LANGUAGE plpgsql AS $journey$
DECLARE
 aid uuid:='e7411700-0000-4000-8000-000000000001';eid uuid:='e7411700-0000-4000-8000-000000000002';bid uuid:='e7411700-0000-4000-8000-000000000003';cid uuid:='e7411700-0000-4000-8000-000000000004';
 atoken text;etoken text;btoken text;ctoken text;vtoken text;dtoken text;sid uuid;pid uuid;giftid uuid;oid uuid;segmentid uuid;
 j jsonb;k jsonb;o public.orders%ROWTYPE;rows_changed integer;stock integer;
 report jsonb:='{}';companyid uuid;rateid uuid;courierid text;stage text;settlementid bigint;campaignid uuid;submissionid uuid;dealorderid uuid;updated timestamptz;cancelorderid uuid;
 shipping jsonb:='{"country":"Iraq","state":"Baghdad","city":"Baghdad","address":"KINTO ROLLBACK TEST ONLY","phone":"+0002026101704"}';
 items jsonb;
BEGIN
 BEGIN
 -- Bootstrap only synthetic accounts. Every row and issued session rolls back.
 INSERT INTO public.employees(id,name,phone,role,password,status,is_active,permissions) VALUES
 (aid,'KINTO_WORKFLOW_TEST_ADMIN','+0002026101701','admin',extensions.crypt('KINTO-workflow-temporary-20261017!',extensions.gen_salt('bf')),'نشط',true,'{}'),
 (eid,'KINTO_WORKFLOW_TEST_EMPLOYEE','+0002026101702','employee',extensions.crypt('KINTO-workflow-temporary-20261017!',extensions.gen_salt('bf')),'نشط',true,'{}');
 INSERT INTO public.branches(id,name,phone,password,status) VALUES(bid,'KINTO_WORKFLOW_TEST_BRANCH','+0002026101703',extensions.crypt('KINTO-workflow-temporary-20261017!',extensions.gen_salt('bf')),'active');
 INSERT INTO public.customers(id,name,phone,email,password,code,country,state,address) VALUES(cid,'KINTO_WORKFLOW_TEST_CUSTOMER','+0002026101704','kinto-workflow-test@example.invalid',extensions.crypt('KINTO-workflow-temporary-20261017!',extensions.gen_salt('bf')),'KINTO_WF_20261017','Iraq','Baghdad','KINTO ROLLBACK TEST ONLY');
 SET LOCAL ROLE anon;
 j:=public.admin_login_v147('+0002026101701','KINTO-workflow-temporary-20261017!');atoken:=j->>'session_token';
 j:=public.employee_login_v143('+0002026101702','KINTO-workflow-temporary-20261017!');etoken:=j->>'session_token';
 j:=public.branch_login_v148('+0002026101703','KINTO-workflow-temporary-20261017!');btoken:=j->>'session_token';
 j:=public.customer_review_login_v132('+0002026101704','KINTO-workflow-temporary-20261017!');ctoken:=j->>'session_token';
 RESET ROLE;
 PERFORM pg_temp.expect(atoken IS NOT NULL AND etoken IS NOT NULL AND btoken IS NOT NULL AND ctoken IS NOT NULL,'four role logins issue real sessions');
 SET LOCAL ROLE anon;
 j:=public.kinto_store_operation_session_v1('admin',atoken,'admin_save_local_store',jsonb_build_object('p_store_id',null,'p_store_name','KINTO_WORKFLOW_TEST_STORE','p_username','kinto-wf-20261017','p_phone','+0002026101705','p_password','KINTO-workflow-temporary-20261017!','p_country','Iraq','p_governorate','Baghdad','p_store_type','شامل','p_specialty','شامل','p_default_currency','USD','p_commission_rate',10,'p_logo_url',null,'p_store_url',null,'p_status','active'));
 sid:=(j#>>'{}')::uuid;
 j:=public.vendor_login_session('kinto-wf-20261017','KINTO-workflow-temporary-20261017!');vtoken:=j->>'session_token';
 PERFORM public.kinto_store_operation_session_v1('vendor',vtoken,'vendor_set_exchange_rate',jsonb_build_object('p_store_id',sid,'p_rate',1500,'p_base_currency','USD','p_target_currency','IQD'));
 j:=public.kinto_vendor_product_write_session_v1(vtoken,'insert',null,jsonb_build_object('product_name','KINTO_WORKFLOW_TEST_PRODUCT','base_price',10,'cost_price',6,'currency','USD','stock_quantity',20),'[]');pid:=(j->0->>'id')::uuid;
 j:=public.kinto_vendor_product_write_session_v1(vtoken,'insert',null,jsonb_build_object('product_name','KINTO_WORKFLOW_TEST_GIFT','base_price',3,'currency','USD','stock_quantity',10),'[]');giftid:=(j->0->>'id')::uuid;
 RESET ROLE;
 PERFORM pg_temp.expect(sid IS NOT NULL AND vtoken IS NOT NULL AND pid IS NOT NULL AND giftid IS NOT NULL,'admin creates store; vendor logs in and creates priced stock');
 items:=jsonb_build_array(jsonb_build_object('store_id',sid,'product_id',pid,'quantity',2,'selected_options','{}'::jsonb));
 SET LOCAL ROLE anon;
 j:=public.kinto_checkout_session_v1(ctoken,shipping,items);oid:=(j->'orders'->0->>'id')::uuid;
 RESET ROLE;
 PERFORM set_config('app.v161_finance_checkout','',true);PERFORM set_config('app.checkout_customer_shipping','',true);
 SELECT * INTO o FROM public.orders WHERE id=oid;
 PERFORM pg_temp.expect(oid IS NOT NULL AND o.customer_id=cid::text AND o.order_code LIKE 'KN-%' AND o.total_price=36000,'checkout uses canonical KN/customer/server pricing');
 SELECT stock_quantity INTO stock FROM public.local_products WHERE id=pid;PERFORM pg_temp.expect(stock=20,'prepayment order leaves product stock intact');
 SET LOCAL ROLE anon;
 PERFORM public.kinto_save_staff_order_session_v1('employee',etoken,oid,o.status,o.total_price,o.currency,'{"status":"بانتظار موافقة العميل"}');
 PERFORM public.admin_grant_loyalty_v310(atoken,cid::text,sid::text,'IQD',1000,'kinto','KINTO rollback workflow test');
 j:=public.customer_apply_coupon_v310(ctoken,oid::text,1000);
 RESET ROLE;
 PERFORM pg_temp.expect((j->>'ok')::boolean,'admin grants eligible coupon and customer redeems it');
 SELECT * INTO o FROM public.orders WHERE id=oid;PERFORM pg_temp.expect(o.reward_discount_amount=1000 AND o.total_price=36000 AND o.loyalty_points_redeemed=1000,'coupon preserves product subtotal and records exact discount');
 PERFORM set_config('request.headers',jsonb_build_object('x-kinto-role','customer','x-kinto-session',ctoken)::text,true);
 SET LOCAL ROLE anon;
 UPDATE public.orders SET status='تمت الموافقة - بانتظار الدفع' WHERE id=oid;GET DIAGNOSTICS rows_changed=ROW_COUNT;
 RESET ROLE;
 PERFORM pg_temp.expect(rows_changed=1,'customer accepts own priced order');PERFORM set_config('request.headers','{}',true);
 SELECT * INTO o FROM public.orders WHERE id=oid;
 SET LOCAL ROLE anon;
 PERFORM public.kinto_approve_paid_order_v1(etoken,'employee',oid,o.status,'{"status":"تم التسديد"}');
 RESET ROLE;
 SELECT stock_quantity INTO stock FROM public.local_products WHERE id=pid;PERFORM pg_temp.expect(stock=18,'employee confirms payment and deducts exact stock');
 SET LOCAL ROLE anon;
 SELECT to_jsonb(x) INTO j FROM public.kinto_vendor_orders_read_session_v1(vtoken) x WHERE x.id=oid;
 RESET ROLE;
 PERFORM pg_temp.expect(j->>'id'=oid::text,'paid order is available to its vendor');
 -- Configure this test vendor's shipping, then exercise a paid shipment.
 SET LOCAL ROLE anon;
 j:=public.vendor_save_shipping_settings(vtoken,0,true,'IQD','[{"key":"test","company_name":"KINTO_WORKFLOW_TEST_SHIPPING","is_active":true}]','[{"company_key":"test","destination_country":"Iraq","governorate":"Baghdad","area":"*","delivery_fee":3000,"currency":"IQD","is_active":true}]');
 RESET ROLE;
 SELECT id INTO companyid FROM public.vendor_shipping_companies WHERE store_id=sid;
 SELECT id INTO rateid FROM public.vendor_shipping_rates WHERE store_id=sid;
 SELECT id INTO segmentid FROM public.order_store_segments WHERE order_id=oid AND store_id=sid;
 SELECT * INTO o FROM public.orders WHERE id=oid;
 SET LOCAL ROLE anon;
 j:=public.vendor_update_order_shipping(vtoken,segmentid,o.shipping_version,companyid,rateid,4000,'IQD',false);
 RESET ROLE;
 SELECT * INTO o FROM public.orders WHERE id=oid;
 PERFORM pg_temp.expect(o.total_price=36000 AND o.delivery_fee=4000 AND o.reward_discount_amount=1000,'vendor shipping preserves goods and coupon snapshots');
 SELECT store_status INTO stage FROM public.order_store_segments WHERE id=segmentid;
 SET LOCAL ROLE anon;
 j:=public.vendor_advance_order_segment_status(vtoken,segmentid,stage,'تجهيز شحن');
 RESET ROLE;
 SELECT * INTO o FROM public.orders WHERE id=oid;
 SET LOCAL ROLE anon;
 j:=public.kinto_attachment_ticket_session_v1('employee',etoken,'parcel',oid::text,'image/png',100);
 RESET ROLE;
 PERFORM pg_temp.expect(j->>'bucket'='chat-attachments','employee parcel authorization at shipping stage');
 -- The branch creates its own courier through its actual management RPC.
 SET LOCAL ROLE anon;
 j:=public.branch_save_courier_v304(btoken,null,'KINTO_WORKFLOW_TEST_COURIER','+0002026101706','KINTO-workflow-temporary-20261017!',4000);courierid:=j->>'id';
 j:=public.courier_login_v149('+0002026101706','KINTO-workflow-temporary-20261017!');dtoken:=j->>'session_token';
 RESET ROLE;
 PERFORM pg_temp.expect(courierid IS NOT NULL AND dtoken IS NOT NULL,'branch creates courier; courier signs in');
 SELECT * INTO o FROM public.orders WHERE id=oid;
 SET LOCAL ROLE anon;
 PERFORM public.kinto_save_staff_order_session_v1('employee',etoken,oid,o.status,o.total_price,o.currency,jsonb_build_object('status','مخزن محلي','branch_id',bid::text));
 RESET ROLE;
 SELECT * INTO o FROM public.orders WHERE id=oid;
 SET LOCAL ROLE anon;
 PERFORM public.kinto_save_branch_orders_session_v1('branch',btoken,bid::text,jsonb_build_array(jsonb_build_object('id',o.id,'status',o.status,'courier_id',o.courier_id,'delivery_agent_id',o.delivery_agent_id,'delivery_fee',o.delivery_fee)),jsonb_build_object('courier_id',courierid,'status','مندوب','delivery_fee',4000));
 RESET ROLE;
 PERFORM set_config('request.headers',jsonb_build_object('x-kinto-role','courier','x-kinto-session',dtoken)::text,true);
 SET LOCAL ROLE anon;
 SELECT count(*) INTO rows_changed FROM public.orders WHERE id=oid;
 j:=public.kinto_attachment_ticket_session_v1('courier',dtoken,'proof',oid::text,'image/png',100);
 RESET ROLE;
 PERFORM pg_temp.expect(rows_changed=1 AND j->>'bucket'='chat-attachments','assigned courier reads order and obtains proof ticket');
 SET LOCAL ROLE anon;
 UPDATE public.orders SET status='تم التسليم' WHERE id=oid;GET DIAGNOSTICS rows_changed=ROW_COUNT;
 RESET ROLE;
 report:=report||jsonb_build_object('courier_delivery','passed');
 PERFORM set_config('request.headers','{}',true);
 PERFORM pg_temp.expect(rows_changed=1,'courier delivers assigned order');
 SELECT stock_quantity INTO stock FROM public.local_products WHERE id=pid;PERFORM pg_temp.expect(stock=18,'delivery does not double deduct stock');
 PERFORM pg_temp.expect(EXISTS(SELECT FROM public.kinto_loyalty_ledger WHERE order_id=oid::text AND event_type='earn' AND eligible_product_total=36000 AND points=360),'delivery earns 1 percent on goods only');
 SET LOCAL ROLE anon;
 j:=public.customer_loyalty_summary_v310(ctoken);
 k:=public.kinto_request_settlements_session_v1('branch',btoken,'courier',bid::text,courierid,ARRAY[oid],'collection');settlementid:=(k->'settlements'->0->>'id')::bigint;
 k:=public.kinto_decide_settlement_session_v1('admin',atoken,settlementid,'approve');
 RESET ROLE;
 PERFORM pg_temp.expect((k->>'ok')::boolean AND EXISTS(SELECT FROM public.orders WHERE id=oid AND settlement_status='settled'),'branch requests settlement; admin verifies and approves');
 report:=report||jsonb_build_object('normal_order','passed','coupon','1000 IQD applied once; product subtotal preserved','shipping','4000 IQD; goods remain 36000','roles','customer/admin/employee/vendor/branch/courier authenticated','delivery','passed; stock 20 -> 18','loyalty','360 points on goods only','settlement','branch request and admin approval passed');
 -- Merchant campaign: draft -> submit -> approval -> publication -> direct gift order -> paid.
 SET LOCAL ROLE anon;
 j:=public.kinto_deals_v1_vendor_save_draft_g20(vtoken,null,null,jsonb_build_object('title','KINTO_WORKFLOW_TEST_GIFT_CAMPAIGN','description','Rollback-only verification','kind','buy_n','starts_at',now()-interval '5 minutes','ends_at',now()+interval '1 day','threshold_units',1,'gift_product_id',giftid,'gift_selected_options','{}'::jsonb,'max_uses_per_customer',1,'max_total_redemptions',10,'product_ids',jsonb_build_array(pid)),'{}');
 campaignid:=(j->>'campaign_id')::uuid;updated:=(j->>'updated_at')::timestamptz;
 j:=public.kinto_deals_v1_vendor_submit_g4(vtoken,campaignid,updated);submissionid:=(j->>'submission_id')::uuid;
 k:=public.kinto_deals_v1_admin_detail_g3(atoken,submissionid);
 j:=public.kinto_deals_v1_admin_decide_g3(atoken,submissionid,1,'approved',null);
 j:=public.kinto_deals_v1_admin_publication_g8(atoken,campaignid,'publish');
 RESET ROLE;
 PERFORM pg_temp.expect((j->>'ok')::boolean AND EXISTS(SELECT FROM public.kinto_deals_v1_publications_g7 WHERE campaign_id=campaignid AND published),'merchant submits; admin approves and publishes campaign');
 SET LOCAL ROLE anon;
 SELECT count(*) INTO rows_changed FROM public.kinto_deals_v1_public_feed_g7(sid) x WHERE x.campaign_id=campaignid;
 j:=public.kinto_deals_v1_direct_order_g20(ctoken,campaignid,gen_random_uuid(),shipping,jsonb_build_array(jsonb_build_object('store_id',sid,'product_id',pid,'quantity',1,'selected_options','{}'::jsonb)));
 dealorderid:=(j->>'campaign_order_id')::uuid;
 RESET ROLE;
 PERFORM set_config('app.checkout_customer_shipping','',true);
 PERFORM pg_temp.expect(rows_changed=1 AND dealorderid IS NOT NULL,'campaign is public and direct customer checkout succeeds');
 SELECT * INTO o FROM public.orders WHERE id=dealorderid;
 PERFORM pg_temp.expect(o.total_price=18000 AND (SELECT count(*) FROM jsonb_array_elements(o.details::jsonb->'items') x WHERE x->>'is_deal_gift'='true' AND (x->>'line_total_local')::numeric=0 AND x->>'product_id'=giftid::text)=1,'gift is inserted once, free, without increasing paid goods');
 SET LOCAL ROLE anon;
 PERFORM public.kinto_approve_paid_order_v1(etoken,'employee',dealorderid,o.status,'{"status":"تم التسديد"}');
 RESET ROLE;
 PERFORM pg_temp.expect((SELECT stock_quantity FROM public.local_products WHERE id=pid)=17 AND (SELECT stock_quantity FROM public.local_products WHERE id=giftid)=9,'campaign payment deducts paid product and gift exactly once');
 PERFORM pg_temp.expect(EXISTS(SELECT FROM public.kinto_deals_v1_redemptions WHERE campaign_id=campaignid AND order_id=dealorderid AND state='confirmed'),'campaign redemption confirms after payment');
 SET LOCAL ROLE anon;
 j:=public.kinto_deals_v1_customer_quote_g5(ctoken,campaignid,jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',1)));
 RESET ROLE;
 PERFORM pg_temp.expect((j->>'eligible')::boolean=false AND j->>'reason'='limit_reached','per-customer campaign usage limit is enforced');
 report:=report||jsonb_build_object('gift_campaign','draft/submission/admin approval/publication/direct order/payment passed','gift','one free gift; gift stock 10 -> 9; paid stock 18 -> 17','campaign_limit','second redemption denied');


 -- Coupon replay and automatic restoration on a customer's prepayment cancellation.
 SET LOCAL ROLE anon;
 j:=public.kinto_checkout_session_v1(ctoken,shipping,items);cancelorderid:=(j->'orders'->0->>'id')::uuid;
 RESET ROLE;
 PERFORM set_config('app.v161_finance_checkout','',true);PERFORM set_config('app.checkout_customer_shipping','',true);
 SELECT * INTO o FROM public.orders WHERE id=cancelorderid;
 SET LOCAL ROLE anon;
 PERFORM public.kinto_save_staff_order_session_v1('employee',etoken,cancelorderid,o.status,o.total_price,o.currency,'{"status":"بانتظار موافقة العميل"}');
 PERFORM public.admin_grant_loyalty_v310(atoken,cid::text,sid::text,'IQD',1000,'kinto','KINTO rollback cancellation test');
 j:=public.customer_apply_coupon_v310(ctoken,cancelorderid::text,1000);
 RESET ROLE;
 BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.customer_apply_coupon_v310(ctoken,cancelorderid::text,1000);
  RESET ROLE;
  RAISE EXCEPTION 'COUPON_REPLAY_UNEXPECTEDLY_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  RESET ROLE;IF SQLERRM<>'order already has reward discount' THEN RAISE;END IF;
 END;
 PERFORM set_config('request.headers',jsonb_build_object('x-kinto-role','customer','x-kinto-session',ctoken)::text,true);
 SET LOCAL ROLE anon;
 UPDATE public.orders SET status='ملغي من قبل العميل',rejection_reason='ملغي من قبل العميل' WHERE id=cancelorderid;GET DIAGNOSTICS rows_changed=ROW_COUNT;
 RESET ROLE;
 PERFORM set_config('request.headers','{}',true);
 PERFORM pg_temp.expect(rows_changed=1 AND EXISTS(SELECT FROM public.orders WHERE id=cancelorderid AND reward_discount_amount=0 AND loyalty_points_redeemed=0),'customer cancellation restores server coupon fields');
 PERFORM pg_temp.expect(EXISTS(SELECT FROM public.kinto_loyalty_ledger WHERE order_id=cancelorderid::text AND event_type='restore') AND NOT EXISTS(SELECT FROM public.kinto_loyalty_coupons WHERE used_order_id=cancelorderid::text),'coupon is restored with an audit event');
 PERFORM pg_temp.expect((SELECT stock_quantity FROM public.local_products WHERE id=pid)=17,'prepayment cancellation preserves exact stock');
 report:=report||jsonb_build_object('coupon_replay','denied','customer_cancellation','passed; coupon restored; stock unchanged');

 RAISE EXCEPTION USING ERRCODE='ZW001',MESSAGE='EXPECTED_TEST_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'ZW001' THEN
 PERFORM pg_temp.expect(NOT EXISTS(SELECT FROM public.customers WHERE id=cid) AND NOT EXISTS(SELECT FROM public.employees WHERE id IN (aid,eid)) AND NOT EXISTS(SELECT FROM public.branches WHERE id=bid) AND NOT EXISTS(SELECT FROM public.local_stores WHERE id=sid) AND NOT EXISTS(SELECT FROM public.orders WHERE customer_id=cid::text) AND NOT EXISTS(SELECT FROM public.kinto_loyalty_coupons WHERE customer_id=cid::text),'all synthetic records rolled back');
 RETURN report||jsonb_build_object('rollback_verified',true,'business_rows_remaining',0);
 END;
END $journey$;
SELECT pg_temp.kinto_workflow_run_v1() AS verification;
