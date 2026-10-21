// Local QA adapter only. It never contacts Google and refuses production databases.
import { readFile, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { trialHash } from "@/server/services/trial-security";
import {
  setTrialGoogleExchangeForTest,
  completeTrialGoogle,
} from "@/server/services/trial-google-service";
const u = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.NODE_ENV === "production" ||
  process.env.QUANPILOT_TRIAL_TEST_MODE !== "true" ||
  u.hostname !== "127.0.0.1" ||
  u.port !== "55432" ||
  u.pathname !== "/restaurant_trial_test"
)
  throw Error("ISOLATED_QA_ONLY");
async function main() {
  const data = JSON.parse(
    await readFile(".trial-runtime/identity-input.json", "utf8"),
  );
  if (
    !/^[a-f0-9]{64}$/.test(data.state) ||
    !data.email.endsWith("@example.test")
  )
    throw Error("QA_INPUT_REQUIRED");
  const row = await prisma.trialIdentityChallenge.findUniqueOrThrow({
    where: { stateHash: trialHash("state:" + data.state) },
  });
  setTrialGoogleExchangeForTest(async (code, verifier) => {
    if (code !== "isolated-google-code" || verifier !== row.pkceVerifier)
      throw Error("QA_PKCE");
    return {
      iss: "https://accounts.google.com",
      aud: process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID!,
      sub: data.subject,
      email: data.email,
      email_verified: true,
      hd: "example.test",
      name: "QA Trial Owner",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: row.nonce,
    };
  });
  const callback = await completeTrialGoogle(
    data.state,
    "isolated-google-code",
  );
  await writeFile(
    ".trial-runtime/identity-result.json",
    JSON.stringify({ callback, email: data.email }),
    { mode: 0o600 },
  );
  console.log("LOCAL_GOOGLE_IDENTITY_FIXTURE_READY");
}
main()
  .catch(() => {
    console.error("LOCAL_GOOGLE_FIXTURE_FAILED");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
