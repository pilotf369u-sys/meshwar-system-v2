import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js=readFileSync(new URL('../js/customer-product-reviews-v135.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20260912_v149_review_image_optimization_retention.sql',import.meta.url),'utf8');
assert.match(js,/const MAX_IMAGES = 1/);assert.match(js,/COMPRESSED_MAX_BYTES = 320 \* 1024/);assert.match(js,/COMPRESSED_MAX_DIMENSION = 1280/);assert.match(js,/canvas\.toBlob/);assert.match(js,/state\.files = \[await compressReviewImage\(file\)\]/);assert.doesNotMatch(js,/MAX_FILE_BYTES = 5 \* 1024 \* 1024/);
assert.match(sql,/max_images smallint not null default 1/);assert.match(sql,/max_image_bytes integer not null default 350000/);assert.match(sql,/v_decision = 'rejected'/);assert.match(sql,/delete from public\.product_review_images where review_id = p_review_id/);assert.match(sql,/using public\.product_reviews r/);assert.doesNotMatch(sql,/(update|insert into|delete from) public\.(orders|customers|employees|invoices|local_products)/i);
console.log('Review image V149 optimization and retention contract: OK');
