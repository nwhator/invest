import { requiredEnv } from "@/lib/env";

export function requireAdminSecret(): string {
  return requiredEnv("ADMIN_SECRET");
}
