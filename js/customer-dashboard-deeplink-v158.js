(()=>{'use strict';
const allowed=new Set(['activeOrders','orderHistory','chatHelp','notifications','drafts','productReviews','customerFavorites']);
function target(){const value=String(new URLSearchParams(location.search).get('tab')||'').trim();return value==='favorites'?'customerFavorites':value}
function revealProfile(id){const input=document.getElementById(id);if(!input)return false;const section=input.closest('.address-section')||input;section.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{if(!input.readOnly&&!input.disabled)input.focus({preventScroll:true})},350);return true}
function reveal(){const value=target();if(!value)return true;if(value==='address')return revealProfile('userAddress');if(value==='secondaryPhone')return revealProfile('userSecondaryPhone');if(!allowed.has(value))return true;const button=document.querySelector(`.tabs-nav [data-tab="${value}"]`);if(!button)return false;button.click();setTimeout(()=>document.getElementById(value)?.scrollIntoView({behavior:'smooth',block:'start'}),80);return true}
function start(){let attempts=0;if(reveal())return;const timer=setInterval(()=>{attempts+=1;if(reveal()||attempts>=40)clearInterval(timer)},125)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
