import { NextRequest } from "next/server";
import { optionalEnv } from "@/lib/env";

export function assertCronAuthorized(req: NextRequest) {
  // On Vercel Cron, this header is present.
  // Docs: https://vercel.com/docs/cron-jobs
  const vercelCron = req.headers.get("x-vercel-cron");
  if (vercelCron) return;

  // For local/manual triggering.
  const expected = optionalEnv("CRON_SECRET");
  if (!expected) {
    throw new Error(
      "Unauthorized cron request (missing x-vercel-cron). Set CRON_SECRET to allow local triggering."
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("bearer ".length).trim();
    if (token === expected) return;
  }

  const secretQuery = req.nextUrl.searchParams.get("secret");
  if (secretQuery && secretQuery === expected) return;

  throw new Error("Unauthorized cron request");
}
