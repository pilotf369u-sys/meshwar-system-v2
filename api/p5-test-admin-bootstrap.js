const PREVIEW_HOST = /^meshwar-system-v2-(?:git-feature-kinto-payment-p5|[a-z0-9-]+)-kinto1\.vercel\.app$/i;
const SUPABASE_URL = "https://udtegahgxgqvflodjkjt.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_KOdceuz9V-tRoIoxD3FjUA_4FoXbBNT";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  const host = String(req.headers.host || "").toLowerCase();
  const origin = String(req.headers.origin || "");
  if (process.env.VERCEL_ENV !== "preview" || !PREVIEW_HOST.test(host) || origin !== `https://${host}`)
    return send(res, 404, { ok: false, error: "PROTECTED_TEST_PREVIEW_ONLY" });

  const oidc = String(req.headers["x-vercel-oidc-token"] || "");
  if (oidc.length < 100 || oidc.length > 10000)
    return send(res, 503, { ok: false, error: "PREVIEW_IDENTITY_NOT_CONFIGURED" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body.action !== "bootstrap_test_admin_and_customer")
    return send(res, 400, { ok: false, error: "ACTION_NOT_AVAILABLE" });

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/kinto-payment-p5`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${PUBLISHABLE_KEY}`,
        "x-vercel-oidc-token": oidc,
      },
      body: JSON.stringify({
        action: body.action,
        admin_password: body.admin_password,
        customer_password: body.customer_password,
      }),
      cache: "no-store",
    });
    const result = await upstream.json().catch(() => null);
    if (!result || typeof result !== "object") return send(res, 502, { ok: false, error: "TEST_SETUP_UNAVAILABLE" });
    return send(res, upstream.status, result);
  } catch {
    return send(res, 502, { ok: false, error: "TEST_SETUP_UNAVAILABLE" });
  }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}
