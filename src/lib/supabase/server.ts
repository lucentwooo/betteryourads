/**
 * Supabase server client (Server Components, Server Actions, Route
 * Handlers). Reads + refreshes the user's session via cookies. RLS
 * applies — this client only sees data the user owns.
 *
 * For backend-only writes that should bypass RLS (e.g. the analyze
 * pipeline writing on behalf of a user), use ./admin.ts instead.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Setting cookies from a Server Component throws; that's fine
            // when the middleware is refreshing the session anyway.
          }
        },
      },
    },
  );
}
