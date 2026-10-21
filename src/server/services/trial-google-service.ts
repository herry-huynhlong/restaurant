import { randomBytes } from "node:crypto";
import {
  OAuth2Client,
  CodeChallengeMethod,
  type TokenPayload,
} from "google-auth-library";
import { prisma } from "@/lib/db/prisma";
import {
  TrialError,
  assertTrialEnabled,
  trialHash,
  safeEqual,
  consumeTrialRate,
} from "./trial-security";
function publicOrigin(name: string) {
  const raw = process.env[name];
  if (!raw) throw new TrialError(503, "TRIAL_NOT_CONFIGURED");
  const u = new URL(raw);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname))
    )
  )
    throw new TrialError(503, "TRIAL_NOT_CONFIGURED");
  return u.origin;
}
export const trialQuanpilotOrigin = () =>
  publicOrigin("QUANPILOT_TRIAL_PUBLIC_ORIGIN");
export const trialQavioOrigin = () =>
  publicOrigin("QUANPILOT_TRIAL_QAVIO_ORIGIN");
function googleClient() {
  if (
    !process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID ||
    !process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_SECRET
  )
    throw new TrialError(503, "GOOGLE_NOT_CONFIGURED");
  return new OAuth2Client(
    process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID,
    process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_SECRET,
    trialQuanpilotOrigin() + "/api/integrations/qavio/trial/google/callback",
  );
}
type GoogleExchange = (code: string, verifier: string) => Promise<TokenPayload>;
let testExchange: GoogleExchange | undefined;
export function setTrialGoogleExchangeForTest(
  exchange: GoogleExchange | undefined,
) {
  const u = new URL(process.env.DATABASE_URL || "http://invalid");
  if (
    process.env.QUANPILOT_TRIAL_TEST_MODE !== "true" ||
    process.env.NODE_ENV === "production" ||
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !/(^|_)test(_|$)/.test(u.pathname.slice(1))
  )
    throw new Error("TEST_DATABASE_REQUIRED");
  testExchange = exchange;
}
export function assertGoogleIdentity(payload: TokenPayload, nonce: string) {
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    !payload.email ||
    !payload.sub ||
    !["accounts.google.com", "https://accounts.google.com"].includes(
      payload.iss,
    ) ||
    payload.aud !== process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID ||
    payload.exp * 1000 <= Date.now() ||
    payload.iat * 1000 > Date.now() + 60000
  )
    throw new TrialError(403, "GOOGLE_IDENTITY_REJECTED");
  if (!payload.email.toLowerCase().endsWith("@gmail.com") && !payload.hd)
    throw new TrialError(403, "GOOGLE_EMAIL_NOT_AUTHORITATIVE");
}
export async function beginTrialGoogle(flowHash: string, bucket: string) {
  assertTrialEnabled();
  googleClient();
  if (!/^[a-f0-9]{64}$/.test(flowHash))
    throw new TrialError(422, "INVALID_FLOW");
  await consumeTrialRate("oauth:" + bucket, 10, 900000);
  const state = randomBytes(32).toString("hex"),
    nonce = randomBytes(32).toString("hex"),
    client = googleClient(),
    pkce = await client.generateCodeVerifierAsync();
  await prisma.trialIdentityChallenge.create({
    data: {
      stateHash: trialHash("state:" + state),
      flowHash,
      pkceVerifier: pkce.codeVerifier,
      nonce,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return {
    url: client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      response_type: "code",
      access_type: "online",
      prompt: "select_account",
      state,
      nonce,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  };
}
export async function completeTrialGoogle(state: string, code: string) {
  assertTrialEnabled();
  if (!/^[a-f0-9]{64}$/.test(state) || code.length > 4096)
    throw new TrialError(403, "INVALID_OAUTH_STATE");
  const row = await prisma.trialIdentityChallenge.findUnique({
    where: { stateHash: trialHash("state:" + state) },
  });
  if (!row || row.expiresAt <= new Date() || row.verifiedAt)
    throw new TrialError(403, "INVALID_OAUTH_STATE");
  const client = googleClient();
  let payload: TokenPayload | undefined;
  if (testExchange) payload = await testExchange(code, row.pkceVerifier);
  else {
    const { tokens } = await client.getToken({
      code,
      codeVerifier: row.pkceVerifier,
    });
    if (!tokens.id_token) throw new TrialError(403, "GOOGLE_IDENTITY_REJECTED");
    payload = (
      await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID,
      })
    ).getPayload();
  }
  if (!payload) throw new TrialError(403, "GOOGLE_IDENTITY_REJECTED");
  assertGoogleIdentity(payload, row.nonce);
  const ticket = randomBytes(32).toString("hex");
  const updated = await prisma.trialIdentityChallenge.updateMany({
    where: { id: row.id, verifiedAt: null, expiresAt: { gt: new Date() } },
    data: {
      email: payload.email!.trim().toLowerCase(),
      ownerName: (payload.name || "").slice(0, 120),
      googleSubject: payload.sub,
      verifiedAt: new Date(),
      pkceVerifier: "",
      ticketHash: trialHash("ticket:" + ticket),
    },
  });
  if (updated.count !== 1) throw new TrialError(403, "INVALID_OAUTH_STATE");
  return trialQavioOrigin() + "/api/trial/google/callback?ticket=" + ticket;
}
export const trialProof = (row: {
  id: string;
  email: string | null;
  googleSubject: string | null;
  verifiedAt: Date | null;
}) =>
  row.id +
  "." +
  trialHash(
    [
      "proof",
      row.id,
      row.email,
      row.googleSubject,
      row.verifiedAt?.toISOString(),
    ].join(":"),
  );
export async function exchangeTrialTicket(ticket: string, flowHash: string) {
  assertTrialEnabled();
  if (!/^[a-f0-9]{64}$/.test(ticket))
    throw new TrialError(403, "INVALID_OAUTH_TICKET");
  const row = await prisma.trialIdentityChallenge.findUnique({
    where: { ticketHash: trialHash("ticket:" + ticket) },
  });
  if (
    !row ||
    !row.email ||
    !row.googleSubject ||
    !row.verifiedAt ||
    row.expiresAt <= new Date() ||
    !safeEqual(row.flowHash, flowHash)
  )
    throw new TrialError(403, "INVALID_OAUTH_TICKET");
  return {
    email: row.email,
    ownerName: row.ownerName || "",
    verificationToken: trialProof(row),
    expiresAt: row.expiresAt.toISOString(),
  };
}
