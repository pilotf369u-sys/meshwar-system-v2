import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function handle(req:Request,clientFactory=createClient,env=(key:string)=>Deno.env.get(key)){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 let p;try{p=await req.json()}catch{return new Response(null,{status:400,headers})}
 if(!p||typeof p!=='object'||!['customer','admin','employee','branch','courier'].includes(p.role)||typeof p.session_token!=='string'||p.session_token.length<8||p.session_token.length>4096||!Array.isArray(p.paths)||p.paths.length<1||p.paths.length>100||p.paths.some((x:unknown)=>typeof x!=='string'||x.length>1000||x.includes('..')||x.startsWith('/')))return new Response(null,{status:400,headers});
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return new Response(null,{status:503,headers});
 const sb=clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Custom application sessions are verified by the database before the service client signs any path.
 const {data:allowed,error}=await sb.rpc('kinto_attachment_read_session_v1',{p_role:p.role,p_session_token:p.session_token,p_paths:p.paths});
 if(error||!Array.isArray(allowed))return new Response(null,{status:403,headers});
 const paths=[...new Set(p.paths)].filter(x=>allowed.includes(x));if(!paths.length)return new Response(null,{status:403,headers});
 const {data:links,error:signError}=await sb.storage.from('chat-attachments').createSignedUrls(paths,900);
 if(signError||!links)return new Response(null,{status:503,headers});
 return new Response(JSON.stringify({urls:Object.fromEntries(links.filter(x=>x.path&&x.signedUrl).map(x=>[x.path,x.signedUrl])),expires_in:900}),{status:200,headers:{...headers,'Content-Type':'application/json'}});
}
if(import.meta.main)Deno.serve(req=>handle(req));
