import { optionalEnv, requiredEnv } from "@/lib/env";

export type SportsbookApi2Config = {
  rapidApiKey: string;
  rapidApiHost: string;
};

export function sportsbookApi2Config(): SportsbookApi2Config {
  return {
    rapidApiKey: requiredEnv("RAPIDAPI_KEY"),
    rapidApiHost: optionalEnv("RAPIDAPI_HOST", "sportsbook-api2.p.rapidapi.com")!,
  };
}

export async function fetchArbitrageAdvantages(): Promise<unknown> {
  const cfg = sportsbookApi2Config();

  const url = new URL("https://sportsbook-api2.p.rapidapi.com/v0/advantages/");
  url.searchParams.set("type", "ARBITRAGE");

  const res = await fetch(url.toString(), {
    // Prevent caching; this is live market data.
    cache: "no-store",
    headers: {
      "x-rapidapi-host": cfg.rapidApiHost,
      "x-rapidapi-key": cfg.rapidApiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sportsbook API error (${res.status}): ${body}`);
  }

  return res.json();
}
