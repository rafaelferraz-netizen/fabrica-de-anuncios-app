export function isDemoMode() {
  return (
    process.env.APP_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
