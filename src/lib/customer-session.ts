import crypto from "node:crypto";
import { cookies } from "next/headers";

export const CUSTOMER_SESSION_COOKIE = "customer_session";

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
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export function setCustomerSessionCookie(payload: CustomerSessionPayload) {
  cookies().set(CUSTOMER_SESSION_COOKIE, createCustomerSessionValue(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export function getCustomerSessionCookie() {
  return verifyCustomerSessionValue(cookies().get(CUSTOMER_SESSION_COOKIE)?.value);
}

export function clearCustomerSessionCookie() {
  cookies().delete(CUSTOMER_SESSION_COOKIE);
}
