import { getConfig } from "./_lib/config.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { handlePreflight, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res, config.frontendOrigin)) return;

  if (req.method !== "GET") {
    return sendJson(req, res, 405, { error: "Method not allowed" }, config.frontendOrigin);
  }

  try {
    const catalog = await fetchCatalog(config);
    return sendJson(req, res, 200, catalog, config.frontendOrigin);
  } catch {
    return sendJson(req, res, 502, { error: "Unable to fetch menu data from Square." }, config.frontendOrigin);
  }
}
