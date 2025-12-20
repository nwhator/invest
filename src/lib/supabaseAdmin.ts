import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

export function supabaseAdmin() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
