import { getAuthConfig } from "./_lib/config.js";
import { passwordMatches, setSessionCookie } from "./_lib/auth.js";
import { handlePreflight, parseJson, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return sendJson(req, res, 405, { error: "Method not allowed" });

  try {
    const config = getAuthConfig();
    const payload = await parseJson(req);
    if (typeof payload.password !== "string" || !passwordMatches(payload.password, config.password)) {
      return sendJson(req, res, 401, { error: "Authentication failed." });
    }
    setSessionCookie(res, config.sessionSecret);
    return sendJson(req, res, 200, { authenticated: true });
  } catch {
    return sendJson(req, res, 500, { error: "Authentication is unavailable." });
  }
}