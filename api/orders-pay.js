import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getConfig } from "./_lib/config.js";
import { parseJson, handlePreflight, sendJson } from "./_lib/http.js";
import { squareClient, unwrapSquareResult } from "./_lib/square.js";
import { upsertOrderMetadata } from "./_lib/orderStore.js";

const schema = z.object({
  orderId: z.string().min(1),
  amountCents: z.number().int().min(0)
});

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res, config.frontendOrigin)) return;
  if (req.method !== "POST") {
    return sendJson(req, res, 405, { error: "Method not allowed" }, config.frontendOrigin);
  }

  try {
    const payload = schema.parse(await parseJson(req));
    const client = squareClient(config);

    await client.payments.createPayment({
      idempotencyKey: randomUUID(),
      sourceId: "CASH",
      amountMoney: {
        amount: payload.amountCents,
        currency: config.currency
      },
      orderId: payload.orderId,
      locationId: config.squareLocationId,
      autocomplete: true
    });

    upsertOrderMetadata(payload.orderId, { paymentStatus: "paid" });
    return sendJson(req, res, 200, { ok: true }, config.frontendOrigin);
  } catch {
    return sendJson(req, res, 400, { error: "Unable to mark order paid." }, config.frontendOrigin);
  }
}
