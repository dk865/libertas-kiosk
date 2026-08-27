export function applyCors(req, res, origin) {
  const requestOrigin = req.headers.origin;
  if (origin === "*" || !requestOrigin || requestOrigin === origin) {
    res.setHeader("Access-Control-Allow-Origin", origin === "*" ? "*" : requestOrigin || origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function handlePreflight(req, res, origin) {
  applyCors(req, res, origin);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(req, res, status, data, origin) {
  applyCors(req, res, origin);
  res.status(status).json(data);
}

export async function parseJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
