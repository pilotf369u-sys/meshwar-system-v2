import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });
const uuid = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (request.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(503, { ok: false, error: "PAYMENT_SERVICE_UNAVAILABLE" });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "INVALID_JSON" }); }
  const token = typeof body.session_token === "string" ? body.session_token.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  const origin = request.headers.get("origin") || "";
  const previewOrigin = "https://meshwar-system-v2-git-feature-kinto-payment-p5-kinto1.vercel.app";
  const isTestProject = new URL(url).hostname === "udtegahgxgqvflodjkjt.supabase.co";
  if (action !== "preview_login" && (token.length < 24 || token.length > 512))
    return json(401, { ok: false, error: "CUSTOMER_SESSION_REQUIRED" });
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-kinto-payment-channel": "p5-server" } },
  });
  if (action === "preview_login") {
    if (!isTestProject || origin !== previewOrigin) return json(404, { ok: false, error: "TEST_PREVIEW_ONLY" });
    const identity = typeof body.identity === "string" ? body.identity.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identity || identity.length > 320 || !password || password.length > 512)
      return json(400, { ok: false, error: "INVALID_TEST_LOGIN" });
    const { data: login, error: loginError } = await db.rpc("customer_review_login_v132", {
      p_identity: identity, p_password: password,
    });
    if (loginError || login?.ok !== true || typeof login.session_token !== "string")
      return json(401, { ok: false, error: login?.error === "REVIEW_LOGIN_RATE_LIMITED" ? "TEST_LOGIN_RATE_LIMITED" : "TEST_LOGIN_INVALID" });
    const { data: expiresAt, error: ttlError } = await db.rpc("kinto_payment_p5_test_session_bound_v1", {
      p_session_token: login.session_token,
    });
    if (ttlError || !expiresAt) {
      await db.rpc("customer_review_logout_v132", { p_session_token: login.session_token });
      return json(503, { ok: false, error: "TEST_SESSION_SETUP_FAILED" });
    }
    return json(200, { ok: true, data: { session_token: login.session_token, expires_at: expiresAt, customer: login.customer } });
  }
  if (action === "preview_logout") {
    if (!isTestProject || origin !== previewOrigin) return json(404, { ok: false, error: "TEST_PREVIEW_ONLY" });
    const { data, error } = await db.rpc("customer_review_logout_v132", { p_session_token: token });
    if (error) return json(503, { ok: false, error: "TEST_SESSION_CLOSE_FAILED" });
    return json(200, { ok: true, data: { revoked: data === true } });
  }
  let rpc: string;
  let args: Record<string, unknown>;
  switch (action) {
    case "mode": rpc = "kinto_payment_p5_mode_read_v1"; args = { p_session_token: token }; break;
    case "quote":
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 ||
          (body.coupon_points !== undefined && (!body.coupon_points || typeof body.coupon_points !== "object" || Array.isArray(body.coupon_points))))
        return json(400, { ok: false, error: "INVALID_CART" });
      rpc = "kinto_payment_p5_quote_v1";
      args = { p_session_token: token, p_items: body.items, p_coupon_points: body.coupon_points ?? {} };
      break;
    case "reserve":
      if (!uuid(body.idempotency_key) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100)
        return json(400, { ok: false, error: "INVALID_RESERVATION" });
      rpc = "kinto_payment_p5_reserve_v1";
      args = { p_session_token: token, p_idempotency_key: body.idempotency_key, p_items: body.items, p_coupon_points: body.coupon_points ?? {} };
      break;
    case "campaign_reserve":
      if (!uuid(body.idempotency_key) || !uuid(body.campaign_id) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 ||
          (body.coupon_points !== undefined && (!body.coupon_points || typeof body.coupon_points !== "object" || Array.isArray(body.coupon_points) || Object.keys(body.coupon_points).length > 0)))
        return json(400, { ok: false, error: "DIRECT_CAMPAIGN_COUPONS_FORBIDDEN_OR_INVALID_RESERVATION" });
      rpc = "kinto_payment_p5_campaign_reserve_v1";
      args = { p_session_token: token, p_idempotency_key: body.idempotency_key, p_campaign_id: body.campaign_id,
        p_items: body.items, p_coupon_points: {} };
      break;
    case "start":
      if (!uuid(body.attempt_id)) return json(400, { ok: false, error: "INVALID_ATTEMPT" });
      rpc = "kinto_payment_p5_start_v1"; args = { p_session_token: token, p_attempt_id: body.attempt_id }; break;
    case "simulate":
      if (!uuid(body.attempt_id) || !["success", "failure", "cancel", "unknown", "disconnect"].includes(String(body.scenario)))
        return json(400, { ok: false, error: "INVALID_SIMULATION" });
      rpc = "kinto_payment_p5_simulate_dispatch_v1";
      args = { p_session_token: token, p_attempt_id: body.attempt_id, p_scenario: body.scenario,
        p_event_key: crypto.randomUUID(), p_shipping: body.shipping && typeof body.shipping === "object" ? body.shipping : {} };
      break;
    case "status":
      if (!uuid(body.attempt_id)) return json(400, { ok: false, error: "INVALID_ATTEMPT" });
      rpc = "kinto_payment_p5_status_v1"; args = { p_session_token: token, p_attempt_id: body.attempt_id }; break;
    case "list":
      if (!Number.isInteger(body.page) || Number(body.page) < 1 || Number(body.page) > 100000)
        return json(400, { ok: false, error: "INVALID_PAGE" });
      rpc = "kinto_payments_p5_list_v1"; args = { p_session_token: token, p_page: body.page }; break;
    default: return json(400, { ok: false, error: "UNKNOWN_ACTION" });
  }
  const { data, error } = await db.rpc(rpc, args);
  if (error) {
    const status = error.code === "28000" ? 401 : error.code === "P0002" ? 404 : 409;
    return json(status, { ok: false, error: String(error.message || "PAYMENT_REQUEST_FAILED").slice(0, 240), code: error.code || null });
  }
  return json(200, { ok: true, data });
});
