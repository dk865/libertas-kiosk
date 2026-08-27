const memoryBalances = new Map();
const redemptionSet = new Set();

function loadMemory(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {};
  }
  for (const [studentId, value] of Object.entries(parsed)) {
    if (!memoryBalances.has(studentId)) {
      memoryBalances.set(studentId, Number(value));
    }
  }
}

export function createStarCardProvider(config) {
  loadMemory(config.starCardMemoryJson);

  return {
    async getBalance(studentId) {
      return Number(memoryBalances.get(studentId) || 0);
    },
    async redeem(studentId, amount, redemptionId) {
      if (redemptionSet.has(redemptionId)) {
        return { ok: false, reason: "Duplicate redemption attempt." };
      }
      const balance = Number(memoryBalances.get(studentId) || 0);
      if (balance < amount) {
        return { ok: false, reason: "Insufficient star cards." };
      }
      memoryBalances.set(studentId, balance - amount);
      redemptionSet.add(redemptionId);
      return { ok: true, remaining: balance - amount };
    }
  };
}
