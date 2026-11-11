import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Database = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __classroombridgePool?: Pool;
  __classroombridgeDb?: Database;
};

// The connection is created lazily (on first real use) instead of at import
// time, so the app can build, start, and serve its landing page even before
// DATABASE_URL exists — e.g. during the very first Vercel deploy. Once the
// variable is set, everything works; until then, requests fail with a clear
// message instead of breaking the build.
export function getPool(): Pool {
  if (!globalForDb.__classroombridgePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Add it in your hosting dashboard (see DEPLOY.md) and redeploy."
      );
    }
    globalForDb.__classroombridgePool = new Pool({ connectionString });
  }
  return globalForDb.__classroombridgePool;
}

export function getDb(): Database {
  if (!globalForDb.__classroombridgeDb) {
    globalForDb.__classroombridgeDb = drizzle(getPool());
  }
  return globalForDb.__classroombridgeDb;
}

// Drop-in replacement for the old eager `db` export — all routes keep working
// unchanged (`db.select(...)`, `db.insert(...)`, `db.execute(...)` etc.).
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = (real as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: never[]) => unknown).bind(real)
      : value;
  },
});
