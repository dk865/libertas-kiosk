export function getConfig() {
  const required = ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    squareAccessToken: process.env.SQUARE_ACCESS_TOKEN,
    squareLocationId: process.env.SQUARE_LOCATION_ID,
    squareEnvironment: (process.env.SQUARE_ENVIRONMENT || "sandbox").toLowerCase(),
    currency: process.env.SQUARE_CURRENCY || "USD",
    frontendOrigin: process.env.FRONTEND_ORIGIN || "*"
  };
}
