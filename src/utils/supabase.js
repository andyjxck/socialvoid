import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rsmuxpoaabdzgfyjmvwf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzbXV4cG9hYWJkemdmeWptdndmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNjc4MTMsImV4cCI6MjA3MjY0MzgxM30.cPVVRISCpGl4YpmZ75wK5MoPaOKIYky2popSk_v1XPE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
