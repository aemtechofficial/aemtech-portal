import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// Make database optional - portal uses Supabase, not local PostgreSQL
const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({ connectionString: databaseUrl }))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = pool ? drizzle(pool) : null;
