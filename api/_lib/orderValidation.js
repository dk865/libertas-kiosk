import { z } from "zod";
import {
  calculateLinePriceCents,
  calculateOrderTotalCents,
  chooseMostExpensiveItem,
  validateModifierSelection
} from "../../shared/business.js";

export const submitOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(64),
  paymentMethod: z.enum(["CASH", "STAR_CARDS"]),
  idempotencyKey: z.string().min(10),
  items: z.array(z.object({
    itemId: z.string().min(1),
    variationId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    modifierIds: z.array(z.string()).default([])
  })).min(1)
});

export function buildValidatedOrder(payload, catalog) {
  const lines = [];

  for (const requestLine of payload.items) {
    const item = catalog.items.find((entry) => entry.id === requestLine.itemId);
    if (!item) throw new Error("An item is no longer available. Please refresh and try again.");

    const variation = item.variations.find((entry) => entry.id === requestLine.variationId);
    if (!variation || !variation.available) {
      throw new Error(`${item.name} is currently unavailable.`);
    }

    const selectedModifierDetails = [];
    for (const modifierList of item.modifierLists) {
      const selectedInList = requestLine.modifierIds.filter((modifierId) =>
        modifierList.modifiers.some((modifier) => modifier.id === modifierId)
      );

      const validation = validateModifierSelection(modifierList, selectedInList);
      if (!validation.ok) {
        throw new Error(`${item.name}: ${validation.reason}`);
      }

      selectedModifierDetails.push(
        ...selectedInList.map((id) => {
          const modifier = modifierList.modifiers.find((entry) => entry.id === id);
          return modifier;
        })
      );
    }

    const lineTotalCents = calculateLinePriceCents(
      variation.priceCents,
      selectedModifierDetails.map((modifier) => modifier.priceCents),
      requestLine.quantity
    );

    lines.push({
      itemId: item.id,
      categoryId: item.categoryId,
      name: item.name,
      variationId: variation.id,
      variationName: variation.name,
      quantity: requestLine.quantity,
      unitPriceCents: variation.priceCents,
      lineTotalCents,
      selectedModifierDetails
    });
  }

  const subtotalCents = calculateOrderTotalCents(lines);
  const redemptionLine = payload.paymentMethod === "STAR_CARDS"
    ? chooseMostExpensiveItem(lines)
    : null;
  const starCardDiscountCents = redemptionLine ? redemptionLine.unitPriceCents : 0;

  return {
    lines,
    subtotalCents,
    starCardDiscountCents,
    totalCents: Math.max(0, subtotalCents - starCardDiscountCents),
    redemptionLine
  };
}
