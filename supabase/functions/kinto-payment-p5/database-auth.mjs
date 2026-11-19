// The separate override is for the project's existing legacy service_role JWT.
// This format check never replaces PostgREST signature and claim verification.
export function selectPaymentDatabaseKey(defaultKey, legacyOverride) {
  if (legacyOverride === undefined) return defaultKey;
  const parts = legacyOverride.split(".");
  if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return undefined;

  try {
    const decode = part => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    if (decode(parts[0])?.alg === "HS256" && decode(parts[1])?.role === "service_role") {
      return legacyOverride;
    }
  } catch {
    // Invalid configuration is reported without disclosing the secret.
  }
  return undefined;
}

export function paymentDatabaseFetch(key, send = fetch) {
  // supabase-js 2.57 adds its API key as Bearer when there is no session JWT.
  // Opaque keys belong only in apikey. Leave legacy JWTs and other headers intact.
  if (!key.startsWith("sb_secret_")) return send;

  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") === `Bearer ${key}`) headers.delete("authorization");
    return send(input, { ...init, headers });
  };
}
