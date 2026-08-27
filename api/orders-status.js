import { z } from "zod";
import { getConfig } from "./_lib/config.js";
import { parseJson, handlePreflight, sendJson } from "./_lib/http.js";
import { upsertOrderMetadata } from "./_lib/orderStore.js";

const schema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["submitted", "awaiting_payment", "paid", "preparing", "completed", "cancelled"])
});

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res, config.frontendOrigin)) return;
  if (req.method !== "POST") {
    return sendJson(req, res, 405, { error: "Method not allowed" }, config.frontendOrigin);
  }

  try {
    const payload = schema.parse(await parseJson(req));
    upsertOrderMetadata(payload.orderId, { status: payload.status });
    return sendJson(req, res, 200, { ok: true }, config.frontendOrigin);
  } catch {
    return sendJson(req, res, 400, { error: "Invalid status update." }, config.frontendOrigin);
  }
}
