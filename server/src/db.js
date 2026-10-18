import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDirectory, "../.env") });
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "⚠  DATABASE_URL is not set. Configure server/.env before starting the app."
  );
}

/* ---------- pool configuration ---------- */
const isLocal =
  connectionString && /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : false,
  // Keep idle connections alive for 30 s (Render closes idle TCP after ~60 s)
  idleTimeoutMillis: 30_000,
  max: 10,
});

// Log pool-level errors (e.g. unexpected disconnects) without crashing
pool.on("error", (err) => {
  console.error("💥 Unexpected database pool error:", err.message);
});
pool.on("connect", () => {
  console.info(`Database pool connected (${pool.totalCount} total clients).`);
});
pool.on("remove", () => {
  console.info(`Database pool client removed (${pool.totalCount} total clients).`);
});

/* ---------- schema bootstrap with retry ---------- */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'My Trip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS itinerary_items (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    name TEXT NOT NULL,
    city TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    category TEXT,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (trip_id, place_id)
  );
  INSERT INTO trips (id, name)
  SELECT 1, 'My Trip'
  WHERE NOT EXISTS (SELECT 1 FROM trips WHERE id = 1);
`;

/**
 * Initialise the database schema.
 * Retries up to 3 times with exponential backoff so cold-start
 * connections on Neon / Render don't immediately crash the process.
 */
export async function initDb(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔌 Database connection attempt ${attempt}/${retries}…`);
      await pool.query(SCHEMA_SQL);
      console.log("✅ Database connected and schema ready.");
      return;
    } catch (err) {
      console.error(
        `❌ Database init attempt ${attempt} failed: ${err.message}`
      );
      if (attempt === retries) throw err;
      const delay = 1000 * 2 ** (attempt - 1); // 1 s, 2 s, 4 s
      console.log(`   Retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
