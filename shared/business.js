export function validateModifierSelection(modifierList, selectedModifierIds) {
  const selected = modifierList.modifiers.filter((m) => selectedModifierIds.includes(m.id));
  if (selected.some((m) => !m.available)) {
    return { ok: false, reason: "A selected modifier is unavailable." };
  }
  if (selected.length < modifierList.minSelections) {
    return { ok: false, reason: `Select at least ${modifierList.minSelections}.` };
  }
  if (selected.length > modifierList.maxSelections) {
    return { ok: false, reason: `Select at most ${modifierList.maxSelections}.` };
  }
  return { ok: true };
}

export function calculateLinePriceCents(basePriceCents, modifierPricesCents, quantity) {
  const modifierTotal = modifierPricesCents.reduce((sum, value) => sum + value, 0);
  return (basePriceCents + modifierTotal) * quantity;
}

export function calculateOrderTotalCents(lines) {
  return lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
}

export function chooseMostExpensiveEligibleItem(orderLines, eligibleCategoryIds) {
  const eligible = orderLines.filter((line) => eligibleCategoryIds.length === 0 || eligibleCategoryIds.includes(line.categoryId));
  if (eligible.length === 0) return null;
  return eligible.reduce((best, current) =>
    current.unitPriceCents > best.unitPriceCents ? current : best
  );
}
