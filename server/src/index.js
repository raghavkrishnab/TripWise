import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import fs from "fs";
import { pool, initDb } from "./db.js";

/* ---------- configuration ---------- */
const app = express();
const PORT = process.env.PORT || 4000;
const GEO_KEY = process.env.GEOAPIFY_API_KEY;
const isProd = process.env.NODE_ENV === "production";
const APP_VERSION = process.env.npm_package_version || "1.0.0";

/* ---------- middleware ---------- */

// Security headers — relaxed CSP so Vite's inline scripts/styles work
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

// HTTP request logging
app.use(morgan(isProd ? "combined" : "dev"));

// Gzip / Brotli compression for all responses
app.use(compression());

// CORS — only needed when the frontend is hosted on a different origin
if (process.env.CLIENT_ORIGIN) {
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN.split(",").map((x) => x.trim()),
    })
  );
}

app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  delete _req.headers["if-none-match"];
  delete _req.headers["if-modified-since"];
  next();
});

/* ---------- helpers ---------- */
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ================================================
   API ROUTES
   ================================================ */

// Health check — also returns uptime for monitoring
app.get(
  "/api/health",
  asyncRoute(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      database: "connected",
      uptime: process.uptime(),
      version: APP_VERSION,
    });
  })
);

// Search destinations via Geoapify
app.get(
  "/api/destinations",
  asyncRoute(async (req, res) => {
    if (!GEO_KEY) {
      return res.status(503).json({
        error:
          "Places API is not configured. Add GEOAPIFY_API_KEY to server/.env.",
      });
    }

    const city = String(req.query.city || "Chennai")
      .trim()
      .slice(0, 100);
    const category = String(
      req.query.category || "tourism.attraction"
    ).trim();
    const sort = String(req.query.sort || "relevance");
    const allowedCategories = new Set([
      "tourism.attraction",
      "tourism.sights",
      "catering.restaurant",
      "entertainment",
      "accommodation.hotel",
    ]);
    const safeCategory = allowedCategories.has(category)
      ? category
      : "tourism.attraction";

    // Geocode the city name to coordinates
    const geoUrl = new URL("https://api.geoapify.com/v1/geocode/search");
    geoUrl.searchParams.set("text", city);
    geoUrl.searchParams.set("limit", "1");
    geoUrl.searchParams.set("apiKey", GEO_KEY);
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok)
      throw new Error(`Geocoding provider returned ${geoResponse.status}`);
    const geoData = await geoResponse.json();
    const centre = geoData.features?.[0];
    if (!centre) return res.json({ city, results: [] });

    // Search for places around the centre
    const [lon, lat] = centre.geometry.coordinates;
    const placesUrl = new URL("https://api.geoapify.com/v2/places");
    placesUrl.searchParams.set("categories", safeCategory);
    placesUrl.searchParams.set("filter", `circle:${lon},${lat},15000`);
    placesUrl.searchParams.set("bias", `proximity:${lon},${lat}`);
    placesUrl.searchParams.set("limit", "30");
    placesUrl.searchParams.set("apiKey", GEO_KEY);

    const placesResponse = await fetch(placesUrl);
    if (!placesResponse.ok)
      throw new Error(`Places provider returned ${placesResponse.status}`);
    const placesData = await placesResponse.json();

    let results = (placesData.features || []).map((feature) => {
      const p = feature.properties || {};
      const coords = feature.geometry?.coordinates || [];
      const name =
        p.name || p.address_line1 || p.formatted || "Unnamed place";
      return {
        id: String(p.place_id || `${name}-${coords[1]}-${coords[0]}`),
        name,
        city: p.city || p.town || p.village || city,
        address: p.formatted || p.address_line2 || p.address_line1 || city,
        lat: coords[1] ?? null,
        lon: coords[0] ?? null,
        category:
          (p.categories || [safeCategory]).at(-1) || safeCategory,
        image: null,
        website: p.website || null,
        openingHours: p.opening_hours || null,
      };
    });

    if (sort === "name")
      results.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "name-desc")
      results.sort((a, b) => b.name.localeCompare(a.name));
    res.json({ city, results });
  })
);

// Single destination details
app.get(
  "/api/destinations/:id",
  asyncRoute(async (req, res) => {
    const { name, city, lat, lon, category } = req.query;
    if (!name || String(name).length > 200) {
      return res
        .status(400)
        .json({ error: "A valid destination name is required." });
    }
    res.json({
      id: req.params.id,
      name: String(name),
      city: String(city || ""),
      lat: lat === undefined ? null : Number(lat),
      lon: lon === undefined ? null : Number(lon),
      category: String(category || "Place"),
    });
  })
);

// Itinerary CRUD
app.get(
  "/api/itinerary",
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      'SELECT id, place_id AS "placeId", name, city, lat, lon, category, image, created_at AS "createdAt" FROM itinerary_items WHERE trip_id = 1 ORDER BY created_at DESC'
    );
    res.json({ items: result.rows });
  })
);

app.post(
  "/api/itinerary",
  asyncRoute(async (req, res) => {
    const {
      placeId,
      name,
      city = "",
      lat = null,
      lon = null,
      category = "",
      image = null,
    } = req.body || {};
    if (
      !placeId ||
      !name ||
      typeof placeId !== "string" ||
      typeof name !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "placeId and name are required strings." });
    }
    if (name.length > 200 || placeId.length > 300) {
      return res
        .status(400)
        .json({ error: "Destination name or ID is too long." });
    }
    const result = await pool.query(
      `INSERT INTO itinerary_items (trip_id, place_id, name, city, lat, lon, category, image)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (trip_id, place_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, place_id AS "placeId", name, city, lat, lon, category, image, created_at AS "createdAt"`,
      [
        placeId,
        name,
        String(city).slice(0, 100),
        Number.isFinite(Number(lat)) ? Number(lat) : null,
        Number.isFinite(Number(lon)) ? Number(lon) : null,
        String(category).slice(0, 150),
        image,
      ]
    );
    res.status(201).json({ item: result.rows[0] });
  })
);

app.delete(
  "/api/itinerary/:id",
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res
        .status(400)
        .json({ error: "Invalid itinerary item ID." });
    const result = await pool.query(
      "DELETE FROM itinerary_items WHERE id = $1 AND trip_id = 1 RETURNING id",
      [id]
    );
    if (!result.rowCount)
      return res
        .status(404)
        .json({ error: "Itinerary item not found." });
    res.json({ deleted: true });
  })
);

/* ================================================
   STATIC FRONTEND (production)
   The Vite-built client/dist is served by Express
   so backend + frontend run as a single Render service.
   ================================================ */
const distPath = path.join(process.cwd(), "client", "dist");
const indexHtml = path.join(distPath, "index.html");

if (fs.existsSync(indexHtml)) {
  console.log("📦 Serving static frontend from client/dist");
  app.use(express.static(distPath, {
    maxAge: isProd ? "1y" : 0,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      } else if (isProd) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // SPA fallback — any non-API GET returns index.html for client-side routing
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found." });
    }
    res.sendFile(indexHtml);
  });
} else {
  console.log(
    "ℹ  No client/dist found — run `npm run build --prefix client` to build the frontend."
  );
}

/* ---------- global error handler ---------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

/* ---------- start ---------- */
initDb()
  .then(() => {
    const server = app.listen(PORT, () =>
      console.log(`🚀 TripWise API listening on port ${PORT}`)
    );

    // Graceful shutdown — Render sends SIGTERM before stopping a service
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`🛑 ${signal} received — shutting down gracefully…`);
      server.close(async () => {
        await pool.end();
        console.log("👋 Connections closed. Goodbye.");
        process.exit(0);
      });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error(
      "Could not initialize database. Check DATABASE_URL.",
      err.message
    );
    process.exit(1);
  });
