import { randomUUID } from "node:crypto";
import { getAuthConfig, getConfig } from "./_lib/config.js";
import { isAuthenticated } from "./_lib/auth.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { parseJson, handlePreflight, sendJson } from "./_lib/http.js";
import { squareClient, unwrapSquareResult } from "./_lib/square.js";
import { buildValidatedOrder, submitOrderSchema } from "./_lib/orderValidation.js";

const submissionCache = new Map();

function squareErrorDetails(error) {
  const firstError = error?.errors?.[0] ?? error?.body?.errors?.[0];
  return {
    category: firstError?.category,
    code: firstError?.code,
    detail: firstError?.detail,
    httpStatus: error?.statusCode ?? error?.status ?? error?.response?.status,
    name: error?.name,
    message: error?.message
  };
}

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
  if (handlePreflight(req, res)) return;
  const auth = getAuthConfig();
  if (!isAuthenticated(req, auth.sessionSecret)) return sendJson(req, res, 401, { error: "Authentication required." });

  if (req.method !== "POST") {
    return sendJson(req, res, 405, { error: "Method not allowed" });
  }

  try {
    const payload = submitOrderSchema.parse(await parseJson(req));

    if (submissionCache.has(payload.idempotencyKey)) {
      return sendJson(req, res, 200, submissionCache.get(payload.idempotencyKey));
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
        : `libertas café kiosk order - cash - customer: ${payload.customerName}`
    };

    if (validated.starCardDiscountCents > 0) {
      squareOrder.discounts = [
        {
          uid: "star-card-discount",
          name: "Star Card Redemption",
          amountMoney: {
            amount: BigInt(validated.starCardDiscountCents),
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
      await client.orders.create({
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
    return sendJson(req, res, 200, responsePayload);
  } catch (error) {
    const details = squareErrorDetails(error);
    const isSquareError = Boolean(details.category || details.code || details.httpStatus || error?.name === "SquareError");
    if (isSquareError) {
      console.error("Square order request failed", {
        ...details,
        operation: "CreateOrder",
        environment: config.squareEnvironment,
        locationIdConfigured: Boolean(config.squareLocationId),
        accessTokenConfigured: Boolean(config.squareAccessToken)
      });
      return sendJson(req, res, 502, { error: "Unable to submit order to Square." });
    }
    return sendJson(req, res, 400, {
      error: "Order validation failed. Please review your order and try again."
    });
  }
}
