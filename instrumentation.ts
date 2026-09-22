/**
 * Runs once when the web server starts.
 *
 * Next calls `register()` itself; nothing imports this file.
 *
 * Its only job is to refuse to serve a catalog whose search is silently broken.
 * With `LC_CTYPE=C` the database accepts every query, returns results for Latin
 * text, and returns nothing for Russian typos — a failure with no error, no log
 * line and no symptom until a buyer gives up. Better to fail at boot with a
 * message naming the fix.
 */
export async function register() {
  // instrumentation.ts is also evaluated for the edge runtime, which has no
  // database driver.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertSearchHealth } = await import("@/server/db-health");

  try {
    await assertSearchHealth();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${message}\n`);
    // In development, keep the server up so the message stays on screen and the
    // rest of the app can still be worked on. In production a database that
    // cannot serve Russian search is not a degraded state worth running in.
    if (process.env.NODE_ENV === "production") throw error;
  }
}
