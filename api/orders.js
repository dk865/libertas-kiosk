import { randomUUID } from "node:crypto";
import { getConfig } from "./_lib/config.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { parseJson, handlePreflight, sendJson } from "./_lib/http.js";
import { squareClient, unwrapSquareResult } from "./_lib/square.js";
import { buildValidatedOrder, submitOrderSchema } from "./_lib/orderValidation.js";

const submissionCache = new Map();

function lineItemsForSquare(validated) {
  return validated.lines.map((line) => ({
    catalogObjectId: line.variationId,
    quantity: String(line.quantity),
    modifiers: line.selectedModifierDetails.map((modifier) => ({
      catalogObjectId: modifier.id
    }))
  }));
}

export default async function handler(req, res) {
  const config = getConfig();
  if (handlePreflight(req, res, config.frontendOrigin)) return;

  if (req.method !== "POST") {
    return sendJson(req, res, 405, { error: "Method not allowed" }, config.frontendOrigin);
  }

  try {
    const payload = submitOrderSchema.parse(await parseJson(req));

    if (submissionCache.has(payload.idempotencyKey)) {
      return sendJson(req, res, 200, submissionCache.get(payload.idempotencyKey), config.frontendOrigin);
    }

    const catalog = await fetchCatalog(config);
    const validated = buildValidatedOrder(payload, catalog);

    const client = squareClient(config);
    const squareOrder = {
      locationId: config.squareLocationId,
      source: { name: "libertas-cafe-kiosk" },
      lineItems: lineItemsForSquare(validated),
      note: payload.paymentMethod === "STAR_CARDS"
        ? `libertas café kiosk order - star cards (offline) - customer: ${payload.customerName}`
        : `libertas café kiosk order - cash - customer: ${payload.customerName}`,
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickupDetails: {
            recipient: {
              displayName: payload.customerName
            }
          }
        }
      ]
    };

    if (validated.starCardDiscountCents > 0) {
      squareOrder.discounts = [
        {
          uid: "star-card-discount",
          name: "Star Card Redemption",
          amountMoney: {
            amount: validated.starCardDiscountCents,
            currency: config.currency
          },
          scope: "ORDER"
        }
      ];
      squareOrder.lineItems = squareOrder.lineItems.map((line) => ({
        ...line,
        appliedDiscounts: [{ discountUid: "star-card-discount" }]
      }));
    }

    const created = unwrapSquareResult(
      await client.orders.createOrder({
        idempotencyKey: payload.idempotencyKey,
        order: squareOrder
      })
    );

    const responsePayload = {
      orderId: created.order?.id,
      status: "awaiting_payment",
      totalCents: validated.totalCents,
      confirmationCode: randomUUID().slice(0, 8),
      squareOrderVersion: created.order?.version
    };

    submissionCache.set(payload.idempotencyKey, responsePayload);
    return sendJson(req, res, 200, responsePayload, config.frontendOrigin);
  } catch {
    return sendJson(req, res, 400, {
      error: "Order validation failed. Please review your order and try again."
    }, config.frontendOrigin);
  }
}
