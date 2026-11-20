# HackMate AI — Autonomous Hackathon Discovery Agent

HackMate AI is a full-stack hackathon discovery, matching, and deadline-tracking application built with React, TypeScript, Tailwind CSS, Express, SQLite, and the Google Gemini API (`@google/genai`).

## Project Folder Structure

- `server.ts` — Unified Express + Vite server (port 3000) exposing REST APIs and serving the React SPA.
- `server/db.ts` — SQLite schema (`better-sqlite3`), connection setup, and typed query helpers.
- `server/discovery.ts` — Live multi-platform discovery connectors for Devpost, Unstop, Devfolio, HackerEarth, MLH, and Hack2Skill with retry, timeout, and deduplication logic.
- `server/geo.ts` — City coordinate lookup and Haversine distance calculator for location-based filtering.
- `server/ai.ts` — Transparent weighted compatibility engine + server-side Gemini AI (`gemini-4-hydrogen`) recommendation analysis and natural language query parser.
- `server/scheduler.ts` — Background scheduler for periodic platform synchronization and 7d/3d/24h deadline notifications.
- `src/App.tsx` — Main dashboard shell with 9 navigation sections and slide-over inspection modal.
- `src/types.ts` — Shared TypeScript interfaces.
- `src/api.ts` — Typed frontend API client.
- `src/components/` — `HackathonCard`, `HackathonDetailModal`, `NaturalLanguageSearch`.
- `src/views/` — `DashboardView`, `DiscoverView`, `RecommendationsView`, `SavedView`, `DeadlinesView`, `NotificationsView`, `AnalyticsView`, `PreferencesView`, `SettingsView`.

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini API key (configured server-side via Secrets/environment).
- `APP_URL` — Public application URL.
- `DATABASE_PATH` — Path to SQLite database file (default `./hackmate.db`).
- `PORT` — HTTP port (default `3000`).

## API Endpoints

- `GET /api/health` — Database & Gemini configuration check
- `GET /api/dashboard` — Dashboard metrics, recommended, newly discovered, closing soon, recently viewed
- `GET /api/hackathons` — Search & filter hackathons by query, city, state, distance, format, domain, platform, status
- `POST /api/hackathons/discover` — Trigger live sync across all 6 platforms
- `GET /api/discovery/platforms` — Platform health & last sync timestamps
- `POST /api/search/nl` — Gemini natural language & voice query parser
- `GET /api/recommendations` — Transparent weighted compatibility recommendations
- `POST /api/recommendations/analyze` — Generate Gemini AI deep explanations and preparation checklists
- `GET /api/saved`, `POST /api/saved/:id`, `PATCH /api/saved/:id`, `DELETE /api/saved/:id` — Saved tracker & reminders
- `GET /api/deadlines` — Categorized deadline tracker (`closing_today`, `closing_soon`, `upcoming`, `expired`)
- `GET /api/notifications/history`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`
- `GET /api/analytics` — Live database analytics
- `GET /api/profile`, `PUT /api/profile` — Developer profile
- `GET /api/matching-weights`, `PUT /api/matching-weights` — Configurable 7-factor weights
- `GET /api/preferences`, `PUT /api/preferences` — Scheduler & notification preferences

## Local Startup & Testing

```bash
npm install
npm run dev
```

Verify types and production build:

```bash
npm run lint
npm run build
```
