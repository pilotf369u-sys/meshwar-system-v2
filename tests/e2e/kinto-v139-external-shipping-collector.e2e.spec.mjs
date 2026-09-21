import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFile(path.join(root,file),'utf8');

test('external shipping collector migration is additive and order-scoped',async()=>{
  const sql=await read('supabase/migrations/20260921_v139_external_shipping_collector.sql');
  expect(sql).toContain('external_shipping_collector_segment_id uuid');
  expect(sql).toContain('v_segment_order_id is distinct from new.id');
  expect(sql).toContain('EXTERNAL_SHIPPING_COLLECTOR_NOT_IN_ORDER');
  expect(sql).toContain("case when o.external_shipping_collector_segment_id = s.id then coalesce(o.external_shipping_fee, 0) else 0 end");
  expect(sql).not.toMatch(/update public\.orders[\s\S]{0,300}\bstatus\s*=/i);
  expect(sql).not.toMatch(/update public\.orders[\s\S]{0,300}\bdetails\s*=/i);
});

test('customer store invoice references unified fee without charging it again',async()=>{
  const source=await read('js/kinto-bundle-ui-v93.js');
  expect(source).toContain('external_shipping_in_unified_invoice:hasUnifiedExternal');
  expect(source).toContain('محسوب ضمن فاتورة KINTO الموحدة وغير مضاف إلى إجمالي هذه الفاتورة');
  expect(source).toContain('t.externalInUnified?"":`<div><span>الشحن الخارجي (يدوي)');
});

test('collector vendor invoice separates store due from KINTO liability',async()=>{
  const source=await read('js/vendor-v94-multistore-orders.js');
  expect(source).toContain('isExternalCollector:Boolean(shippingDetails?.is_external_shipping_collector)');
  expect(source).toContain('مستحق المتجر');
  expect(source).toContain('عهدة الشحن الخارجي لصالح KINTO');
  expect(source).toContain('المبلغ المطلوب تحصيله من العميل');
  expect(source).toContain('vendorCollectionGrand(data)');
});

