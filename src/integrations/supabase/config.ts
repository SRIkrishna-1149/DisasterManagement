/**
 * Public Supabase client configuration for the deployed Sentinel project.
 *
 * These values are intentionally client-safe Supabase credentials. Never add
 * a service-role key, Resend key, password, or auth token to this file.
 * SUPABASE_URL is the project root because the Supabase SDK appends /rest/v1,
 * /auth/v1, and /functions/v1 to it as needed.
 */
export const SUPABASE_URL = "https://zcxtzdzxojimvnwiwliq.supabase.co";
export const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/`;
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjeHR6ZHp4b2ppbXZud2l3bGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NzAyMjIsImV4cCI6MjEwMzU0NjIyMn0.DmPKNHxK3R_V6eMEouviwZQajKTcT6PcaDRJAGvIx70";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5R-2IbucgOlzCwgiEEXv3A_AnF62Eb8";
