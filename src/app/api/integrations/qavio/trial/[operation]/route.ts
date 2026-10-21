import { z } from "zod";
import {
  authenticateTrial,
  readTrialBody,
  trialReply,
  TrialError,
  assertTrialEnabled,
} from "@/server/services/trial-security";
import {
  beginTrialGoogle,
  exchangeTrialTicket,
} from "@/server/services/trial-google-service";
import { registerTrial } from "@/server/services/trial-registration-service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: {
      operation: string;
    };
  },
) {
  try {
    assertTrialEnabled();
    const text = await readTrialBody(request),
      bucket = await authenticateTrial(request, text);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TrialError(400, "INVALID_JSON");
    }
    if (params.operation === "google-start") {
      const input = z
        .object({ flowHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(body);
      return trialReply(await beginTrialGoogle(input.flowHash, bucket));
    }
    if (params.operation === "google-exchange") {
      const input = z
        .object({
          ticket: z.string().regex(/^[a-f0-9]{64}$/),
          flowHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(body);
      return trialReply(
        await exchangeTrialTicket(input.ticket, input.flowHash),
      );
    }
    if (params.operation === "register")
      return trialReply(
        await registerTrial(
          body,
          request.headers.get("idempotency-key"),
          bucket,
        ),
      );
    return trialReply({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    const known = error instanceof TrialError;
    return trialReply(
      {
        ok: false,
        code: known
          ? error.code
          : error instanceof z.ZodError
            ? "TRIAL_VALIDATION_ERROR"
            : "TRIAL_UNAVAILABLE",
      },
      known ? error.status : error instanceof z.ZodError ? 422 : 503,
    );
  }
}
