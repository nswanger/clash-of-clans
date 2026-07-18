import { createManualRecommendationHandler } from "../../../packages/recommendations/src/portable-production.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const allowedOrigin = Deno.env.get("CWL_WEB_ORIGIN") ?? "https://nswanger.github.io";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase function environment is incomplete");
}

Deno.serve(createManualRecommendationHandler({
  supabaseUrl,
  supabaseAnonKey,
  allowedOrigin,
  fetch,
}));
