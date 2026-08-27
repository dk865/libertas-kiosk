import { getConfig } from "./_lib/config.js";
import { handlePreflight, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res, config.frontendOrigin)) return;
  sendJson(req, res, 200, { ok: true, service: "libertas café backend" }, config.frontendOrigin);
}
