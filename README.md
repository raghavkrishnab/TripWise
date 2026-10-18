# TripWise — Smart Travel Planner

A full-stack travel-planning MVP built with React, Vite, Express, PostgreSQL, and the Geoapify API. Features a premium dark-mode UI with glassmorphism effects and smooth animations.

## Features
- Search real places around any city using Geoapify
- Filter by category (attractions, sights, restaurants, entertainment, hotels)
- Sort results by relevance or name
- View destination details with rich visual layout
- Add/remove destinations from a persistent itinerary
- Light/dark themes with system-preference detection and a saved manual toggle
- PostgreSQL persistence (Neon-compatible)
- Translucent glass surfaces, scroll reveals, and responsive layouts
- Loading skeletons, illustrated empty states, auto-dismissing notifications, and remove confirmation

## Requirements
- Node.js 20+
- PostgreSQL database (Neon is a convenient hosted option)
- Geoapify API key ([get one free](https://www.geoapify.com/))

## Run locally

1. Create a database on Neon or use local PostgreSQL.
2. Copy the example environment file and fill in your credentials:

   ```powershell
   Copy-Item server/.env.example server/.env
   notepad server/.env
   ```

3. Set `DATABASE_URL` and `GEOAPIFY_API_KEY` in `server/.env`.
4. Install dependencies, build the frontend, and start:

   ```powershell
   npm run install:all
   npm run build
   npm start
   ```

5. Open **http://localhost:4000** — the server serves both the API and the frontend from one origin.

For development with hot-reload, run the Vite dev server alongside the Express server:

```powershell
npm run dev
```

This starts the Express API on port 4000 and the Vite dev server on port 5173 with an API proxy. Open http://localhost:5173.

## Environment variables

`server/.env`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
GEOAPIFY_API_KEY=your_geoapify_key
```

- `CLIENT_ORIGIN` — **Optional**. Only set this if a separate frontend is hosted on another domain. Render's single-service setup does not need it.

Never commit `.env` or expose the Geoapify key in frontend code.

## API

- `GET /api/health` — server/database status and uptime
- `GET /api/destinations?city=Chennai&category=tourism.attraction&sort=name`
- `GET /api/destinations/:id?lat=13.08&lon=80.27&name=Chennai`
- `GET /api/itinerary`
- `POST /api/itinerary` with `{ "placeId": "...", "name": "...", "city": "...", "lat": 0, "lon": 0, "category": "...", "image": null }`
- `DELETE /api/itinerary/:id`

## Deployment on Render

TripWise deploys as a **single Render Web Service** — the Express server builds and serves the Vite frontend as static files. No separate frontend hosting needed.

### Option A: Render Blueprint (recommended)

1. Push this repo to GitHub.
2. In the Render Dashboard → **New → Blueprint**.
3. Connect your repo — Render reads `render.yaml` and creates the service.
4. Set the secret environment variables in the Render Dashboard:
   - `DATABASE_URL` — your Neon (or other) PostgreSQL connection string
   - `GEOAPIFY_API_KEY` — your Geoapify API key

### Option B: Manual setup

1. In the Render Dashboard → **New → Web Service**.
2. Connect your GitHub repo.
3. Configure:

   | Setting | Value |
   |---|---|
   | **Runtime** | Node |
   | **Build Command** | `npm run build` |
   | **Start Command** | `npm start` |

4. Add environment variables:
   - `DATABASE_URL`
   - `GEOAPIFY_API_KEY`
   - `NODE_ENV` = `production`

Render automatically sets `PORT`. The server creates database tables on startup, serves `client/dist`, and exposes `/api/health` as the service health check. Hashed assets receive long-lived cache headers while the HTML entry stays fresh between deployments. The API response includes uptime and application version.

Keep `DATABASE_URL` and `GEOAPIFY_API_KEY` in Render's Environment dashboard. Do not commit local `.env` files or put secrets in `render.yaml`.

## Submission screenshots

Screenshots captured from the locally running app are in `screenshots/`:
- `01-explore.png` — destination search and results
- `02-destination-details.png` — selected destination details
- `03-my-trip-empty.png` — empty itinerary state
- `04-my-trip-saved.png` — itinerary with a saved destination

## Important
This is an MVP without user accounts. The itinerary is shared by anyone who visits the same deployment. Mention this limitation in your demo and do not store personal or sensitive data.
