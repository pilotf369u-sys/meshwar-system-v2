import { timingSafeEqual } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createExpiryHandler } from "./handler.mjs";

Deno.serve(createExpiryHandler({
  secret: Deno.env.get("KINTO_PAYMENT_EXPIRY_SECRET"),
  compare: timingSafeEqual,
  async expire() {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.rpc("kinto_payment_attempt_expire_p4", { p_limit: 200 });
    if (error) {
      console.error("KINTO_PAYMENT_EXPIRY_DB_ERROR", error.code);
      throw new Error("EXPIRY_RPC_FAILED");
    }
    return data;
  },
  report: (code: string) => console.error(code),
}));
