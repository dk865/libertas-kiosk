const orderMetadata = new Map();

export function upsertOrderMetadata(orderId, value) {
  orderMetadata.set(orderId, { ...(orderMetadata.get(orderId) || {}), ...value });
}

export function getOrderMetadata(orderId) {
  return orderMetadata.get(orderId) || {};
}

export function listOrderMetadata() {
  return orderMetadata;
}
