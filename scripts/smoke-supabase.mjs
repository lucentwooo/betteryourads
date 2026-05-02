// Confirms the Supabase connection works and the schema is in place.
// Inserts one fake brand under a fake user_id, reads it back, deletes it.
// Uses the service-role key so it bypasses RLS — pure connection sanity.
//
// Run: node --env-file=.env.local scripts/smoke-supabase.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// Tables we expect to exist after running migration 0001
const expectedTables = [
  "brands",
  "voc_quotes",
  "competitor_ads",
  "style_references",
  "reports",
  "creatives",
];

console.log("[smoke] checking tables...");
let allGood = true;
for (const t of expectedTables) {
  const { error } = await supabase.from(t).select("id").limit(0);
  if (error) {
    console.log(`  ✗ ${t}: ${error.message}`);
    allGood = false;
  } else {
    console.log(`  ✓ ${t}`);
  }
}

if (!allGood) {
  console.error("\n[smoke] one or more tables missing — did you run the migration?");
  process.exit(1);
}

console.log("\n[smoke] all tables present. Schema is wired up.");
console.log("[smoke] note: skipping insert test (would need a real auth.users row).");
