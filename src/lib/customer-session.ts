import crypto from "node:crypto";
import { cookies } from "next/headers";
import { normalizeCustomerName } from "@/lib/customer-name";

export const CUSTOMER_SESSION_COOKIE = "customer_session";

export function customerSessionCookieName(restaurantSlug: string) {
  const safeSlug = restaurantSlug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return safeSlug ? `${CUSTOMER_SESSION_COOKIE}_${safeSlug}` : CUSTOMER_SESSION_COOKIE;
}

export type CustomerSessionPayload = {
  restaurantId: string;
  restaurantSlug: string;
  tableId: string;
  tableName: string;
  qrToken: string;
  diningSessionId: string;
  customerName: string;
  createdAt: number;
};

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for customer session signing.");
  }
  return secret;
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(encodedPayload: string) {
  return crypto.createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function createCustomerSessionValue(payload: CustomerSessionPayload) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyCustomerSessionValue(value: string | undefined) {
  if (!value) return null;
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (signature.length !== expectedSignature.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<CustomerSessionPayload>;
    if (
      typeof parsed.restaurantId !== "string"
      || typeof parsed.restaurantSlug !== "string"
      || typeof parsed.tableId !== "string"
      || typeof parsed.tableName !== "string"
      || typeof parsed.qrToken !== "string"
      || typeof parsed.diningSessionId !== "string"
      || typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return {
      ...parsed,
      customerName: normalizeCustomerName(parsed.customerName) ?? ""
    } as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export function setCustomerSessionCookie(payload: CustomerSessionPayload) {
  const customerName = normalizeCustomerName(payload.customerName);
  if (!customerName) throw new Error("A valid customer name is required.");

  cookies().set(customerSessionCookieName(payload.restaurantSlug), createCustomerSessionValue({ ...payload, customerName }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  cookies().delete(CUSTOMER_SESSION_COOKIE);
}

export function getCustomerSessionCookie(restaurantSlug?: string) {
  const cookieStore = cookies();
  const scopedValue = restaurantSlug
    ? cookieStore.get(customerSessionCookieName(restaurantSlug))?.value
    : undefined;
  return verifyCustomerSessionValue(scopedValue ?? cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
}

export function clearCustomerSessionCookie(restaurantSlug?: string) {
  if (restaurantSlug) cookies().delete(customerSessionCookieName(restaurantSlug));
  cookies().delete(CUSTOMER_SESSION_COOKIE);
}
