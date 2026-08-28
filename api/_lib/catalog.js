import { squareClient, unwrapSquareResult } from "./square.js";

export async function fetchCatalog(config) {
  const client = squareClient(config);
  const objectTypes = "CATEGORY,ITEM,ITEM_VARIATION,MODIFIER,MODIFIER_LIST,IMAGE";
  const objects = [];
  let cursor;
  do {
    const rawResult = await client.catalog.list({ types: objectTypes, cursor });

    if (rawResult?.[Symbol.asyncIterator]) {
      for await (const entry of rawResult) {
        if (entry?.type) objects.push(entry);
        else objects.push(...(entry?.objects ?? []));
      }
      cursor = undefined;
    } else {
      const result = unwrapSquareResult(rawResult);
      objects.push(...(result?.objects ?? []));
      cursor = result?.cursor;
    }
  } while (cursor);
  const byType = (type) => objects.filter((o) => o.type === type);

  const categoryMap = new Map();
  const imageMap = new Map();
  const modifierMap = new Map();
  const modifierListMap = new Map();
  const standaloneVariationsByItem = new Map();

  byType("ITEM_VARIATION").forEach((variation) => {
    const itemId = variation.itemVariationData?.itemId;
    if (!itemId) return;
    const variations = standaloneVariationsByItem.get(itemId) || [];
    variations.push(variation);
    standaloneVariationsByItem.set(itemId, variations);
  });

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
      available: !modifier.isDeleted,
      availabilityNote: modifier.isDeleted ? "Sold out" : null
    });
  });

  byType("MODIFIER_LIST").forEach((list) => {
    const modifiers = (list.modifierListData?.modifiers || [])
      .map((modRef) => modifierMap.get(modRef.id) || null)
      .filter(Boolean);

    modifierListMap.set(list.id, {
      id: list.id,
      name: list.modifierListData?.name || "Options",
      minSelections: Math.max(0, Number(list.modifierListData?.minSelectedModifiers ?? 0)),
      maxSelections: Number(list.modifierListData?.maxSelectedModifiers) >= 0
        ? Number(list.modifierListData.maxSelectedModifiers)
        : modifiers.length,
      modifiers
    });
  });

  const inventoryObjectIds = byType("MODIFIER").map((modifier) => modifier.id).filter(Boolean);
  const itemObjects = byType("ITEM");
  for (const item of itemObjects) {
    const variations = item.itemData?.variations?.length
      ? item.itemData.variations
      : standaloneVariationsByItem.get(item.id) || [];
    for (const variation of variations) {
      if (variation.id) inventoryObjectIds.push(variation.id);
    }
  }

  const inventoryMap = new Map();
  if (inventoryObjectIds.length > 0) {
    try {
      const inventory = unwrapSquareResult(
        await client.inventory.batchGetCounts({
          catalogObjectIds: inventoryObjectIds,
          locationIds: [config.squareLocationId]
        })
      );
      for await (const count of inventory) {
        const current = Number(count.quantity);
        const catalogObjectId = count.catalogObjectId || count.catalog_object_id;
        const available = count.state === "IN_STOCK" && Number.isFinite(current) && current > 0;
        if (catalogObjectId && !inventoryMap.has(catalogObjectId)) inventoryMap.set(catalogObjectId, available);
      }
    } catch (error) {
      console.error("Square inventory lookup failed", {
        category: error?.errors?.[0]?.category ?? error?.body?.errors?.[0]?.category,
        code: error?.errors?.[0]?.code ?? error?.body?.errors?.[0]?.code,
        detail: error?.errors?.[0]?.detail ?? error?.body?.errors?.[0]?.detail,
        operation: "BatchGetInventoryCounts",
        environment: config.squareEnvironment,
        locationIdConfigured: Boolean(config.squareLocationId)
      });
      // inventory can be unavailable depending on account permissions
    }
  }

  for (const modifier of modifierMap.values()) {
    if (!inventoryMap.has(modifier.id)) continue;
    modifier.available = inventoryMap.get(modifier.id);
    modifier.availabilityNote = modifier.available ? null : "Sold out";
  }

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
            minSelections: Math.max(0, Number(entry.minSelectedModifiers ?? base.minSelections)),
            maxSelections: Number(entry.maxSelectedModifiers) >= 0
              ? Number(entry.maxSelectedModifiers)
              : base.maxSelections
          };
        })
        .filter(Boolean);

      const catalogVariations = item.itemData?.variations?.length
        ? item.itemData.variations
        : standaloneVariationsByItem.get(item.id) || [];
      const variations = catalogVariations.map((variation) => {
        const variationData = variation.itemVariationData || {};
        const trackedAvailable = inventoryMap.get(variation.id);
        const locationExcluded = variationData.presentAtAllLocations === false
          && !(variationData.presentAtLocationIds || []).includes(config.squareLocationId);
        const locationBlocked = (variationData.absentAtLocationIds || []).includes(config.squareLocationId);
        const available = locationExcluded || locationBlocked
          ? false
          : trackedAvailable ?? (variationData.trackInventory ? false : !variation.isDeleted);
        return {
          id: variation.id,
          name: variationData.name || item.itemData?.name || "Regular",
          priceCents: Number(variationData.priceMoney?.amount || 0),
          available,
          availabilityNote: available ? null : "Sold out"
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

  const usedCategoryIds = new Set(items.map((item) => item.categoryId).filter(Boolean));
  const categories = [...categoryMap.values()]
    .filter((category) => usedCategoryIds.has(category.id))
    .sort((a, b) => a.ordinal - b.ordinal);

  return { categories, items };
}
