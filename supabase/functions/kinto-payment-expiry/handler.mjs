const hexSecret = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

export function createExpiryHandler({ secret, compare, expire, report }) {
  return async function handle(request) {
    const json = (status, body) => Response.json(body, { status });
    if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

    const supplied = request.headers.get("x-kinto-expiry-secret") ?? "";
    if (!hexSecret.test(secret ?? "")) return json(503, { error: "EXPIRY_NOT_CONFIGURED" });
    if (!hexSecret.test(supplied) || !compare(encoder.encode(supplied), encoder.encode(secret))) {
      return json(401, { error: "UNAUTHORIZED" });
    }

    try {
      const expired = await expire();
      if (!Number.isSafeInteger(expired) || expired < 0) throw new Error("INVALID_EXPIRY_RESULT");
      return json(200, { expired_unstarted: expired });
    } catch {
      report("KINTO_PAYMENT_EXPIRY_RPC_FAILED");
      return json(503, { error: "EXPIRY_RPC_FAILED" });
    }
  };
}
