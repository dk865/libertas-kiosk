import { getAuthConfig, getConfig } from "./_lib/config.js";
import { isAuthenticated } from "./_lib/auth.js";
import { fetchCatalog } from "./_lib/catalog.js";
import { handlePreflight, sendJson } from "./_lib/http.js";

function getSquareErrorDetails(error) {
  const firstError = error?.errors?.[0] ?? error?.body?.errors?.[0];

  return {
    category: firstError?.category,
    code: firstError?.code,
    detail: firstError?.detail,
    httpStatus:
      error?.statusCode ??
      error?.status ??
      error?.response?.status,
    name: error?.name,
    message: error?.message
  };
}

export default async function handler(req, res) {
  const config = getConfig();

  if (handlePreflight(req, res)) return;

  const auth = getAuthConfig();

  if (!isAuthenticated(req, auth.sessionSecret)) {
    return sendJson(req, res, 401, {
      error: "Authentication required."
    });
  }

  if (req.method !== "GET") {
    return sendJson(req, res, 405, {
      error: "Method not allowed"
    });
  }

  try {
    const catalog = await fetchCatalog(config);

    return sendJson(req, res, 200, catalog);
  } catch (error) {
    const details = getSquareErrorDetails(error);

    console.error("Square catalog request failed", {
      ...details,
      operation: "ListCatalog",
      environment: config.squareEnvironment,
      locationIdConfigured: Boolean(config.squareLocationId),
      accessTokenConfigured: Boolean(config.squareAccessToken)
    });

    return sendJson(req, res, 502, {
      error: "Unable to fetch menu data from Square.",
      code: details.code ?? "SQUARE_REQUEST_FAILED"
    });
  }
}