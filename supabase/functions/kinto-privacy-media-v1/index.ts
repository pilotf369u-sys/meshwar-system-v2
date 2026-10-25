import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {handle} from './worker.mjs';
// Deployment and runtime enabling require separate authorization; never enable on checkout.
if(import.meta.main)Deno.serve(req=>handle(req,createClient,(key:string)=>Deno.env.get(key)));
