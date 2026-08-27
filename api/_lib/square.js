import { SquareClient, SquareEnvironment } from "square";

let cachedClient;

function getEnvironment(value) {
  return value === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
}

export function squareClient(config) {
  if (!cachedClient) {
    cachedClient = new SquareClient({
      token: config.squareAccessToken,
      environment: getEnvironment(config.squareEnvironment)
    });
  }
  return cachedClient;
}

export function unwrapSquareResult(response) {
  return response?.result || response;
}
