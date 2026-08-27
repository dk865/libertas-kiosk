import { squareClient, unwrapSquareResult } from "./square.js";

export async function fetchCatalog(config) {
  const client = squareClient(config);
  const result = unwrapSquareResult(
    await client.catalog.searchCatalogObjects({
      objectTypes: ["CATEGORY", "ITEM", "MODIFIER", "MODIFIER_LIST", "IMAGE"],
      includeRelatedObjects: true
    })
  );

  const objects = [...(result.objects || []), ...(result.relatedObjects || [])];
  const byType = (type) => objects.filter((o) => o.type === type);

  const categoryMap = new Map();
  const imageMap = new Map();
  const modifierMap = new Map();
  const modifierListMap = new Map();

  byType("CATEGORY").forEach((category, index) => {
    categoryMap.set(category.id, {
      id: category.id,
      name: category.categoryData?.name || "Uncategorized",
      ordinal: category.categoryData?.ordinal ?? index
    });
  });

  byType("IMAGE").forEach((image) => {
    imageMap.set(image.id, image.imageData?.url || null);
  });

  byType("MODIFIER").forEach((modifier) => {
    modifierMap.set(modifier.id, {
      id: modifier.id,
      name: modifier.modifierData?.name || "Modifier",
      priceCents: Number(modifier.modifierData?.priceMoney?.amount || 0),
      available: !modifier.isDeleted
    });
  });

  byType("MODIFIER_LIST").forEach((list) => {
    const modifiers = (list.modifierListData?.modifiers || [])
      .map((modRef) => modifierMap.get(modRef.id) || null)
      .filter(Boolean);

    modifierListMap.set(list.id, {
      id: list.id,
      name: list.modifierListData?.name || "Options",
      minSelections: Number(list.modifierListData?.minSelectedModifiers || 0),
      maxSelections: Number(list.modifierListData?.maxSelectedModifiers || modifiers.length),
      modifiers
    });
  });

  const variationIds = [];
  const itemObjects = byType("ITEM");
  for (const item of itemObjects) {
    for (const variation of item.itemData?.variations || []) {
      if (variation.id) variationIds.push(variation.id);
    }
  }

  const inventoryMap = new Map();
  if (variationIds.length > 0) {
    try {
      const inventory = unwrapSquareResult(
        await client.inventory.batchRetrieveInventoryCounts({
          catalogObjectIds: variationIds,
          locationIds: [config.squareLocationId]
        })
      );
      for (const count of inventory.counts || []) {
        const current = Number(count.quantity || 0);
        inventoryMap.set(count.catalogObjectId, current > 0);
      }
    } catch {
      // inventory can be unavailable depending on account permissions
    }
  }

  const categories = [...categoryMap.values()].sort((a, b) => a.ordinal - b.ordinal);

  const items = itemObjects
    .map((item) => {
      const categoryId = item.itemData?.categories?.[0]?.id || item.itemData?.categoryId || null;
      const itemModifierLists = (item.itemData?.modifierListInfo || [])
        .filter((entry) => entry.enabled !== false)
        .map((entry) => {
          const base = modifierListMap.get(entry.modifierListId);
          if (!base) return null;
          return {
            ...base,
            minSelections: Number(entry.minSelectedModifiers ?? base.minSelections),
            maxSelections: Number(entry.maxSelectedModifiers ?? base.maxSelections)
          };
        })
        .filter(Boolean);

      const variations = (item.itemData?.variations || []).map((variation) => {
        const variationData = variation.itemVariationData || {};
        const trackedAvailable = inventoryMap.get(variation.id);
        const available = trackedAvailable ?? !variation.isDeleted;
        return {
          id: variation.id,
          name: variationData.name || item.itemData?.name || "Regular",
          priceCents: Number(variationData.priceMoney?.amount || 0),
          available
        };
      });

      return {
        id: item.id,
        name: item.itemData?.name || "Unnamed Item",
        description: item.itemData?.description || "",
        imageUrl: imageMap.get(item.itemData?.imageIds?.[0]) || null,
        categoryId,
        available: variations.some((variation) => variation.available),
        modifierLists: itemModifierLists,
        variations
      };
    })
    .filter((item) => item.variations.length > 0);

  return { categories, items };
}
