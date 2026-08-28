import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLinePriceCents,
  calculateOrderTotalCents,
  chooseMostExpensiveItem,
  validateModifierSelection
} from "../shared/business.js";

test("modifier validation enforces min/max and availability", () => {
  const list = {
    minSelections: 1,
    maxSelections: 2,
    modifiers: [
      { id: "a", available: true },
      { id: "b", available: true },
      { id: "c", available: false }
    ]
  };

  assert.equal(validateModifierSelection(list, []).ok, false);
  assert.equal(validateModifierSelection(list, ["a", "b"]).ok, true);
  assert.equal(validateModifierSelection(list, ["a", "b", "c"]).ok, false);
});

test("line and order totals are calculated in cents", () => {
  const lineA = calculateLinePriceCents(100, [25], 2);
  const lineB = calculateLinePriceCents(300, [], 1);
  assert.equal(lineA, 250);
  assert.equal(lineB, 300);
  assert.equal(calculateOrderTotalCents([{ lineTotalCents: lineA }, { lineTotalCents: lineB }]), 550);
});

test("most expensive item is selected for star-card discount", () => {
  const selected = chooseMostExpensiveItem([
    { unitPriceCents: 400, categoryId: "drinks" },
    { unitPriceCents: 300, categoryId: "snacks" }
  ]);

  assert.equal(selected.unitPriceCents, 400);
});
