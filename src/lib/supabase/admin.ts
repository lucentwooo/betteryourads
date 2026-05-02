/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * USE ONLY in server-side code that's allowed to act on any user's
 * data — currently the analyze pipeline, which is triggered by an
 * authenticated user but runs in a background job context.
 *
 * NEVER import this from a client component or any code path that
 * accepts user-controlled input without a server-side authz check.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cached = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
