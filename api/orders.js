import { randomUUID } from "node:crypto";
import { getConfig } from "./_lib/config.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { parseJson, handlePreflight, sendJson } from "./_lib/http.js";
import { squareClient, unwrapSquareResult } from "./_lib/square.js";
import { createStarCardProvider } from "./_lib/starCards.js";
import { buildValidatedOrder, submitOrderSchema } from "./_lib/orderValidation.js";
import { getOrderMetadata, upsertOrderMetadata } from "./_lib/orderStore.js";

const submissionCache = new Map();

function toViewOrder(squareOrder) {
  const metadata = getOrderMetadata(squareOrder.id);
  const lineItems = (squareOrder.lineItems || []).map((line) => ({
    name: line.name,
    quantity: Number(line.quantity || 0),
    modifiers: (line.modifiers || []).map((modifier) => modifier.name)
  }));

  const amountDue = Number(squareOrder.totalMoney?.amount || 0);
  const status = metadata.status || "submitted";
  const paymentStatus = metadata.paymentStatus || (amountDue === 0 ? "paid" : "awaiting_payment");

  return {
    orderId: squareOrder.id,
    customerName: metadata.customerName || "Guest",
    paymentMethod: metadata.paymentMethod || "CASH",
    paymentStatus,
    status,
    amountDueCents: amountDue,
    lineItems,
    note: squareOrder.note || ""
  };
}

async function listOrders(config) {
  const client = squareClient(config);
  const response = unwrapSquareResult(
    await client.orders.searchOrders({
      locationIds: [config.squareLocationId],
      query: {
        filter: {
          sourceFilter: {
            sourceNames: ["libertas-cafe-kiosk"]
          }
        },
        sort: {
          sortField: "CREATED_AT",
          sortOrder: "DESC"
        }
      },
      limit: 50
    })
  );

  return (response.orders || []).map(toViewOrder);
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
  if (handlePreflight(req, res, config.frontendOrigin)) return;

  if (req.method === "GET") {
    try {
      const orders = await listOrders(config);
      return sendJson(req, res, 200, { orders }, config.frontendOrigin);
    } catch {
      return sendJson(req, res, 502, { error: "Unable to load orders from Square." }, config.frontendOrigin);
    }
  }

  if (req.method !== "POST") {
    return sendJson(req, res, 405, { error: "Method not allowed" }, config.frontendOrigin);
  }

  try {
    const payload = submitOrderSchema.parse(await parseJson(req));

    if (submissionCache.has(payload.idempotencyKey)) {
      return sendJson(req, res, 200, submissionCache.get(payload.idempotencyKey), config.frontendOrigin);
    }

    if (payload.paymentMethod === "STAR_CARDS" && !payload.starCardStudentId) {
      return sendJson(req, res, 400, { error: "Star card ID is required for star-card payment." }, config.frontendOrigin);
    }

    const catalog = await fetchCatalog(config);
    const validated = buildValidatedOrder(payload, catalog, config);

    if (payload.paymentMethod === "STAR_CARDS") {
      const provider = createStarCardProvider(config);
      const balance = await provider.getBalance(payload.starCardStudentId);
      if (balance < 10) {
        return sendJson(req, res, 400, { error: "You need at least 10 star cards to redeem this order." }, config.frontendOrigin);
      }
      const redemption = await provider.redeem(payload.starCardStudentId, 10, payload.idempotencyKey);
      if (!redemption.ok) {
        return sendJson(req, res, 409, { error: redemption.reason }, config.frontendOrigin);
      }
    }

    const client = squareClient(config);
    const squareOrder = {
      locationId: config.squareLocationId,
      source: { name: "libertas-cafe-kiosk" },
      lineItems: lineItemsForSquare(validated),
      note: payload.paymentMethod === "STAR_CARDS"
        ? `libertas café star-card redemption for ${payload.customerName}`
        : `libertas café kiosk cash order for ${payload.customerName}`,
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

    const orderId = created.order?.id;
    const responsePayload = {
      orderId,
      status: "submitted",
      paymentStatus: payload.paymentMethod === "CASH" ? "awaiting_payment" : "paid",
      totalCents: validated.totalCents,
      confirmationCode: randomUUID().slice(0, 8)
    };

    submissionCache.set(payload.idempotencyKey, responsePayload);
    upsertOrderMetadata(orderId, {
      customerName: payload.customerName,
      paymentMethod: payload.paymentMethod,
      paymentStatus: responsePayload.paymentStatus,
      status: "submitted"
    });

    return sendJson(req, res, 200, responsePayload, config.frontendOrigin);
  } catch (error) {
    return sendJson(req, res, 400, {
      error: "Order validation failed. Please review your order and try again."
    }, config.frontendOrigin);
  }
}
