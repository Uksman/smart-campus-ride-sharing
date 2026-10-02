# CampusRide — Smart Campus Ride Sharing

A Next.js App Router MVP based on the attached University of Uyo project proposal. It includes campus registration and admin verification, ride requests and offers, transparent match suggestions, mutual acceptance, trip status and location updates, notifications, trip history, ratings, and an admin view.

## Run locally

Requires Node.js 22.13 or later. It uses Node’s built-in SQLite API for local persistence. Install packages and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database and session secret are created in `.data/` on first start. Set `CAMPUS_RIDES_DB` to choose another SQLite file and `CAMPUS_RIDES_SECRET` to provide a stable signing key in a managed deployment.

## Install as an app

CampusRide includes a web app manifest, install icons, a service worker, and an in-app install control. The service worker is registered in production builds and provides an offline page when a navigation cannot reach the server. Sign-in, ride data, and API actions still require a network connection and are never cached. Deploy over HTTPS (or use `localhost`) to enable browser installation. On iPhone, open the site in Safari and use Share → Add to Home Screen.

## Demo accounts

All demo accounts use `CampusRide!23`:

- Student passenger: `amara@student.uniuyo.edu.ng`
- Student driver: `tunde.driver@student.uniuyo.edu.ng`
- Campus administrator: `admin@campus.local`

The demo starts with a suggested Main Gate → Shelter Afrique match. Log in as Amara and Tunde in separate browser sessions to experience the two-sided confirmation flow. The admin account can approve newly registered campus members.

## Current integration boundaries

- New accounts are marked pending. A campus administrator reviews the submitted matriculation or staff ID and approves access; no University of Uyo records API or credentials were supplied.
- Location sharing uses the browser’s Geolocation API and is limited to an active trip. Route cards show campus landmarks; Google Maps/geocoding is not connected because no API key was supplied.
- Notifications appear in the app. SMS and push delivery are not connected because no gateway credentials were supplied.
- No online payments are implemented, consistent with the proposal’s stated scope.
- SQLite is suitable for this local MVP. Node still marks its built-in SQLite API as experimental; a public multi-instance deployment should use a managed relational database and deployment-specific secrets, retention, rate limits, and campus verification integration.

## Project structure

- `src/app/page.tsx` — responsive CampusRide application interface
- `src/app/api/[[...path]]/route.ts` — Next.js route handlers for the application API
- `src/lib/store.ts` — SQLite schema, authentication, matching, ride lifecycle, and admin operations
