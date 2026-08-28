import { getAuthConfig, getConfig } from "./_lib/config.js";
import { isAuthenticated } from "./_lib/auth.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { handlePreflight, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res)) return;
  const auth = getAuthConfig();
  if (!isAuthenticated(req, auth.sessionSecret)) return sendJson(req, res, 401, { error: "Authentication required." });

  if (req.method !== "GET") {
    return sendJson(req, res, 405, { error: "Method not allowed" });
  }

  try {
    const catalog = await fetchCatalog(config);
    return sendJson(req, res, 200, catalog);
  } catch (error) {
    console.error("Square catalog request failed", {
      category: error?.errors?.[0]?.category,
      code: error?.errors?.[0]?.code,
      detail: error?.errors?.[0]?.detail,
      httpStatus: error?.statusCode || error?.status,
      operation: "ListCatalog",
      environment: config.squareEnvironment,
      locationIdConfigured: Boolean(config.squareLocationId)
    });
    return sendJson(req, res, 502, { error: "Unable to fetch menu data from Square." });
  }
}
