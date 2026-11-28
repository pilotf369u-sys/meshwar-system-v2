const test=require('node:test'),assert=require('node:assert/strict');
const {select}=require('../js/kinto-payment-brand-v1.js');
test('uses site settings admin logo, never a hardcoded logo',()=>{
 assert.equal(select({brand_logo_url:'https://shopkinto.com/assets/logo.png'},'https://shopkinto.com/'),
 'https://shopkinto.com/assets/logo.png');
});
test('unwraps common get_site_settings envelopes',()=>{
 assert.equal(select({settings:{brand_logo_url:'https://shopkinto.com/logo.webp'}},'https://shopkinto.com/'),
 'https://shopkinto.com/logo.webp');
 assert.equal(select({value:JSON.stringify({brand_logo_url:'https://shopkinto.com/logo.jpeg'})},'https://shopkinto.com/'),
 'https://shopkinto.com/logo.jpeg');
});
test('fails closed for missing, unsafe, or non-image URL',()=>{
 for(const item of [{},{brand_logo_url:'javascript:alert(1)'},{brand_logo_url:'http://shopkinto.com/logo.png'},
 {brand_logo_url:'https://shopkinto.com/logo.svg'},{brand_logo_url:'https://user:pass@shopkinto.com/logo.png'}])
 assert.equal(select(item,'https://shopkinto.com/'),null);
});
