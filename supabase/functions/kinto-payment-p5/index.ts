import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { isKintoSimulatorCard, isSimulatorFailureScenario } from "../_shared/kinto-simulator-card.mjs";

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
  if (action !== "preview_login" && action !== "preview_create_customer" && (token.length < 24 || token.length > 512))
    return json(401, { ok: false, error: "CUSTOMER_SESSION_REQUIRED" });
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-kinto-payment-channel": "p5-server" } },
  });
  const requireTestAccess = async () => {
    const { data, error } = await db.rpc("kinto_payment_p5_test_access_check_v1", { p_session_token: token });
    if (error) {
      if (error.code === "P0001" && /REVIEW_SESSION_(INVALID|REQUIRED)/.test(String(error.message || "")))
        throw new Error("CUSTOMER_SESSION_REQUIRED");
      throw new Error("PAYMENT_P5_TEST_ACCESS_CHECK_UNAVAILABLE");
    }
    if (data !== true) throw new Error("PAYMENT_P5_TEST_ACCESS_REQUIRED");
  };
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
  if (action === "preview_create_customer") {
    if (!isTestProject || origin !== previewOrigin) return json(404, { ok: false, error: "TEST_PREVIEW_ONLY" });
    const adminIdentity = typeof body.admin_identity === "string" ? body.admin_identity.trim() : "";
    const adminPassword = typeof body.admin_password === "string" ? body.admin_password : "";
    const customerPassword = typeof body.customer_password === "string" ? body.customer_password : "";
    if (!adminIdentity || adminIdentity.length > 320 || !adminPassword || adminPassword.length > 512 ||
        customerPassword.length < 12 || customerPassword.length > 128)
      return json(400, { ok: false, error: "INVALID_TEST_CUSTOMER_SETUP" });

    let adminSessionToken = "";
    let adminSessionRevoked = true;
    let status = 401;
    let result: Record<string, unknown> = { ok: false, error: "TEST_ADMIN_LOGIN_INVALID" };
    let customerSessionToken = "";
    try {
      const { data: adminLogin, error: adminLoginError } = await db.rpc("admin_login_v147", {
        p_identity: adminIdentity, p_password: adminPassword,
      });
      if (adminLoginError || adminLogin?.ok !== true || typeof adminLogin.session_token !== "string") {
        result = { ok: false, error: adminLogin?.error === "ADMIN_LOGIN_RATE_LIMITED" ? "TEST_ADMIN_LOGIN_RATE_LIMITED" : "TEST_ADMIN_LOGIN_INVALID" };
      } else {
        adminSessionToken = adminLogin.session_token;
        const customerCode = `P5T-${crypto.randomUUID()}`;
        const { data: created, error: createError } = await db.rpc("admin_save_account_v300", {
          p_admin_session_token: adminSessionToken,
          p_account_type: "customer",
          p_account_id: null,
          p_name: "KINTO Payment-P5 Test Customer",
          p_phone: customerCode,
          p_password: customerPassword,
          p_email: null,
          p_code: customerCode,
          p_country: "TEST",
          p_state: "Isolated test project",
          p_address: "KINTO-Payment-Test only",
          p_secondary_phone: null,
        });
        if (createError || created?.ok !== true || typeof created.id !== "string") {
          status = 409;
          result = { ok: false, error: created?.error === "SAME_ROLE_PHONE_EXISTS" ? "TEST_CUSTOMER_ID_COLLISION" : "TEST_CUSTOMER_CREATE_FAILED" };
        } else {
          const { data: customerLogin, error: customerLoginError } = await db.rpc("customer_review_login_v132", {
            p_identity: customerCode, p_password: customerPassword,
          });
          if (customerLoginError || customerLogin?.ok !== true || typeof customerLogin.session_token !== "string") {
            status = 503;
            result = { ok: false, error: "TEST_CUSTOMER_LOGIN_FAILED", customer_id: created.id, customer_code: customerCode };
          } else {
            customerSessionToken = customerLogin.session_token;
            const { data: expiresAt, error: ttlError } = await db.rpc("kinto_payment_p5_test_session_bound_v1", {
              p_session_token: customerSessionToken,
            });
            if (ttlError || !expiresAt) {
              await db.rpc("customer_review_logout_v132", { p_session_token: customerSessionToken });
              customerSessionToken = "";
              status = 503;
              result = { ok: false, error: "TEST_SESSION_SETUP_FAILED", customer_id: created.id, customer_code: customerCode };
            } else {
              status = 201;
              result = { ok: true, data: { customer_id: created.id, customer_code: customerCode,
                session_token: customerSessionToken, expires_at: expiresAt, customer: customerLogin.customer } };
            }
          }
        }
      }
    } catch {
      status = 503;
      result = { ok: false, error: "TEST_CUSTOMER_SETUP_FAILED" };
      if (customerSessionToken) {
        await db.rpc("customer_review_logout_v132", { p_session_token: customerSessionToken });
        customerSessionToken = "";
      }
    } finally {
      if (adminSessionToken) {
        try {
          const { data: revoked, error: revokeError } = await db.rpc("admin_logout_v147", { p_session_token: adminSessionToken });
          adminSessionRevoked = !revokeError && revoked === true;
        } catch {
          adminSessionRevoked = false;
        }
      }
      adminSessionToken = "";
    }
    if (!adminSessionRevoked) {
      if (customerSessionToken) {
        try { await db.rpc("customer_review_logout_v132", { p_session_token: customerSessionToken }); } catch { /* expiry remains capped at 15 minutes */ }
        customerSessionToken = "";
      }
      return json(503, { ok: false, error: "TEST_ADMIN_SESSION_CLOSE_FAILED",
        customer_id: result.customer_id ?? (result.data as Record<string, unknown> | undefined)?.customer_id,
        customer_code: result.customer_code ?? (result.data as Record<string, unknown> | undefined)?.customer_code });
    }
    return json(status, result);
  }
  if (action === "preview_logout") {
    if (!isTestProject || origin !== previewOrigin) return json(404, { ok: false, error: "TEST_PREVIEW_ONLY" });
    const { data, error } = await db.rpc("customer_review_logout_v132", { p_session_token: token });
    if (error) return json(503, { ok: false, error: "TEST_SESSION_CLOSE_FAILED" });
    return json(200, { ok: true, data: { revoked: data === true } });
  }
  if (action === "mode") {
    let allowed = true;
    if (isTestProject) {
      try {
        const { data, error } = await db.rpc("kinto_payment_p5_test_access_check_v1", { p_session_token: token });
        if (error) {
          const invalidSession = error.code === "P0001" && /REVIEW_SESSION_(INVALID|REQUIRED)/.test(String(error.message || ""));
          return json(invalidSession ? 401 : 503, { ok: false, error: invalidSession ? "CUSTOMER_SESSION_REQUIRED" : "PAYMENT_P5_MODE_UNAVAILABLE" });
        }
        allowed = data === true;
      } catch {
        return json(503, { ok: false, error: "PAYMENT_P5_MODE_UNAVAILABLE" });
      }
    }
    const { data, error } = await db.rpc("kinto_payment_p5_mode_read_v1", { p_session_token: token });
    if (error) {
      const status = error.code === "28000" ? 401 : 503;
      return json(status, { ok: false, error: String(error.message || "PAYMENT_MODE_UNAVAILABLE").slice(0, 240) });
    }
    const result = data && typeof data === "object" ? { ...(data as Record<string, unknown>) } : {};
    if (result.effective_mode === "electronic" && !allowed) {
      result.checkout_available = false;
      result.test_access_required = true;
    }
    return json(200, { ok: true, data: result });
  }
  // The isolated P5 project keeps its explicit test-account allowlist. On the
  // original project, the P6 database admission guards authorize all customer
  // sessions only while the admin has opened the no-charge simulator safely.
  if (isTestProject && ["quote", "reserve", "start", "simulate", "pay"].includes(action)) {
    try { await requireTestAccess(); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "PAYMENT_P5_TEST_ACCESS_CHECK_UNAVAILABLE";
      const status = reason === "PAYMENT_P5_TEST_ACCESS_REQUIRED" ? 403 : reason === "CUSTOMER_SESSION_REQUIRED" ? 401 : 503;
      return json(status, { ok: false, error: reason });
    }
  }
  if (!isTestProject && ["quote", "reserve", "start", "simulate", "pay"].includes(action)) {
    try {
      const { data, error } = await db.rpc("kinto_payment_p6_customer_admit_v1", { p_session_token: token });
      if (error) {
        const invalidSession = error.code === "P0001" && /REVIEW_SESSION_(INVALID|REQUIRED)/.test(String(error.message || ""));
        return json(invalidSession ? 401 : 503, { ok: false, error: invalidSession ? "CUSTOMER_SESSION_REQUIRED" : "PAYMENT_P6_ADMISSION_UNAVAILABLE" });
      }
      if (data !== true) return json(409, { ok: false, error: "PAYMENT_P6_SIMULATOR_CLOSED" });
    } catch {
      return json(503, { ok: false, error: "PAYMENT_P6_ADMISSION_UNAVAILABLE" });
    }
  }
  let rpc: string;
  let args: Record<string, unknown>;
  switch (action) {
    case "mode": return json(500, { ok: false, error: "PAYMENT_MODE_ROUTING_ERROR" });
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
      if (!uuid(body.attempt_id) || !isSimulatorFailureScenario(body.scenario))
        return json(400, { ok: false, error: "INVALID_SIMULATION" });
      rpc = "kinto_payment_p5_simulate_dispatch_v1";
      args = { p_session_token: token, p_attempt_id: body.attempt_id, p_scenario: body.scenario,
        p_event_key: crypto.randomUUID(), p_shipping: body.shipping && typeof body.shipping === "object" ? body.shipping : {} };
      break;
    case "pay": {
      if (!uuid(body.attempt_id)) return json(400, { ok: false, error: "INVALID_ATTEMPT" });
      // Only the published simulator card is accepted. Card inputs are checked
      // in memory and never written, forwarded to a gateway, or returned.
      const acceptedCard = isKintoSimulatorCard(body.card);
      rpc = "kinto_payment_p5_simulate_dispatch_v1";
      args = { p_session_token: token, p_attempt_id: body.attempt_id, p_scenario: acceptedCard ? "success" : "failure",
        p_event_key: crypto.randomUUID(), p_shipping: body.shipping && typeof body.shipping === "object" ? body.shipping : {} };
      break;
    }
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
    const status = error.code === "28000" ? 401 : error.code === "P0002" ? 404 : error.code === "42501" ? 403 : 409;
    return json(status, { ok: false, error: String(error.message || "PAYMENT_REQUEST_FAILED").slice(0, 240), code: error.code || null });
  }
  return json(200, { ok: true, data });
});
