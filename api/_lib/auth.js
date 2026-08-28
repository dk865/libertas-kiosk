import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "libertas_kiosk_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieValue(req) {
  const cookies = (req.headers.cookie || "").split(";");
  const entry = cookies.find((part) => part.trim().startsWith(`${COOKIE_NAME}=`));
  return entry?.trim().slice(COOKIE_NAME.length + 1) || "";
}

export function isAuthenticated(req, secret) {
  const [expires, providedSignature] = cookieValue(req).split(".");
  if (!expires || !providedSignature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expectedBuffer = Buffer.from(signature(expires, secret));
  const provided = Buffer.from(providedSignature);
  return provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
}

export function passwordMatches(providedPassword, configuredPassword) {
  const provided = Buffer.from(providedPassword);
  const configured = Buffer.from(configuredPassword);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export function setSessionCookie(res, secret) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const value = `${expires}.${signature(String(expires), secret)}`;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${value}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`);
}