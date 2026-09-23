import { NextResponse } from "next/server";

import { prisma } from "@/server/db";

/**
 * Liveness for the container, not a status page.
 *
 * `docker compose` needs something to probe, and probing `/` would not do: the
 * home page is served from the cache and answers 200 perfectly well while the
 * database is unreachable — which is the one failure a health check exists to
 * notice. So this touches Postgres and nothing else.
 *
 * Deliberately says almost nothing. It is reachable without authentication,
 * because a health check runs before there is a session, so the body carries a
 * boolean and never a version, a hostname, a connection string or an error
 * message. «Which dependency is down» belongs in `pnpm deploy:check`, which is
 * run by a person on the server.
 *
 * Redis is not checked. The rate limiter fails open by design when its store is
 * unavailable, so a Redis outage is a degradation and not a reason to take the
 * catalog out of rotation and restart it in a loop.
 */
export async function GET() {
  try {
    // The cheapest round trip that proves the connection is real. `SELECT 1`
    // rather than a table read: a health check must not depend on the schema
    // being migrated, or a deploy would restart the container it is waiting on.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
