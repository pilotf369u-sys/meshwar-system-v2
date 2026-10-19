const decode = (part) => {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
};

export async function verifyProtectedPreviewOidc(
  token,
  { owner = "kinto1", project = "meshwar-system-v2", now = Date.now(), fetchImpl = fetch } = {},
) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 10000) return false;
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    const teamIssuer = `https://oidc.vercel.com/${owner}`;
    const globalIssuer = "https://oidc.vercel.com";
    const issuer = claims.iss === teamIssuer ? teamIssuer : claims.iss === globalIssuer ? globalIssuer : "";
    if (!issuer || header.alg !== "RS256" || typeof header.kid !== "string") return false;

    const response = await fetchImpl(`${issuer}/.well-known/jwks`, { headers: { accept: "application/json" } });
    if (!response.ok) return false;
    const jwks = await response.json();
    const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((candidate) => candidate.kid === header.kid) : null;
    if (!jwk || jwk.kty !== "RSA") return false;
    const key = await crypto.subtle.importKey("jwk", jwk, {
      name: "RSASSA-PKCS1-v1_5", hash: "SHA-256",
    }, false, ["verify"]);
    const signaturePart = parts[2].replace(/-/g, "+").replace(/_/g, "/");
    const signature = Uint8Array.from(atob(signaturePart + "=".repeat((4 - signaturePart.length % 4) % 4)), (c) => c.charCodeAt(0));
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    const nowSeconds = Math.floor(now / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const notBefore = Number(claims.nbf ?? claims.nfb ?? 0);
    return verified && claims.iss === issuer && audience.includes(`https://vercel.com/${owner}`) &&
      claims.sub === `owner:${owner}:project:${project}:environment:preview` &&
      claims.owner === owner && claims.project === project && claims.environment === "preview" &&
      Number(claims.exp) > nowSeconds && notBefore <= nowSeconds + 30 && Number(claims.iat) <= nowSeconds + 30 &&
      nowSeconds - Number(claims.iat) <= 60 * 60;
  } catch {
    return false;
  }
}
