-- KINTO global stores: REVIEW BEFORE EXECUTION. NOT APPLIED TO PRODUCTION.
-- Source: global-stores.html (50 stores), preserve Farmasi and all existing records.
-- Farmasi is existing with sort_order 0; 50 new rows use sort_order 1..50.\n-- Existing records are never overwritten. This script is not executed automatically.
-- PREVIEW:
SELECT id,name,sort_order,is_active FROM public.global_stores ORDER BY sort_order,id;
-- SEED (run separately only after reviewing PREVIEW and admin sort-order collisions):
/*
BEGIN;
WITH incoming(name,logo_url,store_url,category,sort_order) AS (VALUES
  ('Trendyol', 'images/trendyol.png', 'https://www.trendyol.com', 'comprehensive', 1),
  ('Hepsiburada', 'images/hepsiburada.png', 'https://www.hepsiburada.com', 'comprehensive', 2),
  ('N11', 'images/N11.png', 'https://www.n11.com', 'comprehensive', 3),
  ('Boyner', 'images/boyner.png', 'https://www.boyner.com.tr/', 'comprehensive', 4),
  ('Beymen', 'images/beymen.png', 'https://www.beymen.com/tr/', 'comprehensive', 5),
  ('LC Waikiki', 'images/waikiki.png', 'https://www.lcwaikiki.com', 'fashion', 6),
  ('Defacto', 'images/defacto.png', 'https://www.defacto.com.tr', 'fashion', 7),
  ('Koton', 'images/KOTON.png', 'https://www.koton.com', 'fashion', 8),
  ('Mavi', 'images/mavi.png', 'https://www.mavi.com/', 'fashion', 9),
  ('Colin''s', 'images/colins.png', 'https://www.colins.com.tr/', 'fashion', 10),
  ('LTB', 'images/ltb.png', 'https://www.ltbjeans.com/', 'fashion', 11),
  ('U.S. Polo Assn.', 'images/uspolo.png', 'https://tr.uspoloassn.com/', 'fashion', 12),
  ('Zara', 'images/zara.png', 'https://www.zara.com/tr/', 'fashion', 13),
  ('H&M', 'images/hm.png', 'https://www2.hm.com/tr_tr/index.html', 'fashion', 14),
  ('Mango', 'images/mango.png', 'https://shop.mango.com/tr/tr', 'fashion', 15),
  ('Bershka', 'images/bershka.png', 'https://www.bershka.com/tr/', 'fashion', 16),
  ('Pull&Bear', 'images/pullandbear.png', 'https://www.pullandbear.com/tr/en/', 'fashion', 17),
  ('Stradivarius', 'images/stradivarius.png', 'https://www.stradivarius.com/tr/', 'fashion', 18),
  ('Oysho', 'images/oysho.png', 'https://www.oysho.com/tr/', 'fashion', 19),
  ('Massimo Dutti', 'images/massimodutti.png', 'https://www.massimodutti.com/tr/', 'fashion', 20),
  ('Marks & Spencer', 'images/marksandspencer.png', 'https://www.marksandspencer.com.tr/', 'fashion', 21),
  ('İpekyol', 'images/ipekyol.png', 'https://www.ipekyol.com.tr/', 'fashion', 22),
  ('Twist', 'images/twist.png', 'https://www.twist.com.tr/', 'fashion', 23),
  ('D''S Damat', 'images/dsdamat.png', 'https://www.dsdamat.com/', 'fashion', 24),
  ('Lacoste', 'images/lacoste.png', 'https://www.lacoste.com.tr/', 'fashion', 25),
  ('Esswaap', 'images/esswaap.png', 'https://www.esswaap.com/', 'fashion', 26),
  ('Kayra', 'images/kayra.png', 'https://www.kayra.com/', 'fashion', 27),
  ('Nike', 'images/nike.png', 'https://www.nike.com/tr/', 'sports', 28),
  ('Adidas', 'images/adidas.png', 'https://www.adidas.com.tr/', 'sports', 29),
  ('Puma', 'images/puma.png', 'https://tr.puma.com/', 'sports', 30),
  ('FLO', 'images/flo.png', 'https://www.flo.com.tr/', 'sports', 31),
  ('SuperStep', 'images/superstep.png', 'https://www.superstep.com.tr/', 'sports', 32),
  ('Luvi Shoes', 'images/luvishoes.png', 'https://www.luvishoes.com/', 'sports', 33),
  ('Gratis', 'images/gratis.png', 'https://www.gratis.com', 'beauty', 34),
  ('Watsons', 'images/watsons.png', 'https://www.watsons.com.tr', 'beauty', 35),
  ('Eve Shop', 'images/eveshop.png', 'https://www.eveshop.com.tr/', 'beauty', 36),
  ('Sephora', 'images/sephora.png', 'https://www.sephora.com.tr/', 'beauty', 37),
  ('MAD Parfumeur', 'images/madparfum.png', 'https://www.madparfum.com/', 'beauty', 38),
  ('Golden Rose', 'images/goldenrose.png', 'https://shop.goldenrose.com.tr/', 'beauty', 39),
  ('Penti', 'images/penti.png', 'https://www.penti.com/tr/', 'beauty', 40),
  ('Madame Coco', 'images/madamecoco.png', 'https://www.madamecoco.com/', 'home', 41),
  ('English Home', 'images/englishhome.png', 'https://www.englishhome.com/', 'home', 42),
  ('ebebek', 'images/ebebek.png', 'https://kurumsal.ebebek.com/', 'home', 43),
  ('Kanz', 'images/kanz.png', 'https://www.kanzcocuk.com/', 'home', 44),
  ('Toyzz Shop', 'images/toyzzshop.png', 'https://www.toyzzshop.com/', 'home', 45),
  ('Getir', 'images/getir.png', 'https://getir.com/', 'home', 46),
  ('Migros', 'images/migros.png', 'https://www.migros.com.tr/', 'home', 47),
  ('A101', 'images/a101.png', 'https://www.a101.com.tr/', 'home', 48),
  ('BİM', 'images/bim.png', 'https://www.bim.com.tr/', 'home', 49),
  ('Şok Market', 'images/sok.png', 'https://kurumsal.sokmarket.com.tr/', 'home', 50)
)
INSERT INTO public.global_stores(name,logo_url,store_url,category,sort_order,is_active)
SELECT i.name,i.logo_url,i.store_url,i.category,i.sort_order,true FROM incoming i
WHERE NOT EXISTS (SELECT 1 FROM public.global_stores g WHERE lower(trim(g.name))=lower(trim(i.name)));
COMMIT;
*/
-- NOTE: Uncomment entire seed statement (including CTE) only after review.
