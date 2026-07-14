# SavePoint Backend — Architecture Guide

How the backend works, module by module, and how the Next.js frontend talks to it. A personal reference, not the README.

## Stack

| Concern | Tech | Where |
|---|---|---|
| Framework | NestJS 11 (modular DI) | `src/*/*.module.ts` |
| DB | PostgreSQL via TypeORM (migrations, `synchronize: false`) | `src/database`, `app.module.ts` |
| Background jobs | BullMQ queues on Redis | `*.processor.ts` |
| Auth | JWT (Passport) + bcrypt | `src/auth` |
| Game metadata | RAWG API | `src/rawg` |
| Library import | Steam Web API, PSN (`psn-api`) | `src/steam`, `src/psn` |
| Avatars | Cloudinary (signed REST upload) | `src/users/cloudinary.service.ts` |

`main.ts` bootstraps a global `ValidationPipe` (`whitelist` strips unknown fields, `transform` coerces DTO types) and CORS locked to `FRONTEND_URL`.

## Core wiring (`app.module.ts`)

- **TypeORM** → `DATABASE_URL`. Entities registered explicitly; `synchronize: false`, so schema changes only via migrations in `src/database/migrations`.
- **BullMQ** → `REDIS_URL`. One connection powers every queue; feature modules attach a queue with `BullModule.registerQueue({ name })`.
- **ConfigModule** is global — inject `ConfigService` for env access. No hardcoded secrets.

## Redis

Not a read cache. It only backs three BullMQ job queues:

- `steam-sync` — one job per Steam import.
- `psn-sync` — one job per PSN import.
- `rawg-enrich` — background metadata backfill.

Services (producers) call `queue.add(...)`; `WorkerHost` processors (consumers) run the jobs off the request thread, keeping slow third-party calls out of the request/response cycle.

---

## Auth (`src/auth`)

1. **Register** — check email + username uniqueness → `bcrypt.hash(password, 10)` → create user → return signed JWT.
2. **Login** — look up by email → `bcrypt.compare` → sign JWT. Failures throw `UnauthorizedException` with a generic `"Invalid credentials"` (no user enumeration).
3. **Token** — `signToken` embeds `{ sub, email, username }`, signed with `JWT_SECRET`, expires in `JWT_EXPIRES_IN` (default `7d`). Stateless, no refresh endpoint, no server-side revocation.
4. **Protecting routes** — `JwtStrategy` reads the `Authorization: Bearer` header, verifies signature + expiry, and puts `{ userId, email }` on `req.user`. Controllers use `@UseGuards(JwtAuthGuard)`.

The user id **always** comes from the verified token, never the request body.

| Method | Route | Guard | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ email, username, password }` | `{ accessToken, user }` (201) |
| POST | `/auth/login` | — | `{ email, password }` | `{ accessToken, user }` (200) |
| GET | `/users/me` | JWT | — | current profile |

Validation (400 on failure): `email` valid; `username` 3–20 chars `[a-zA-Z0-9_]`; `password` min 8. Login returns `200` explicitly (`@HttpCode`); register uses the default `201`.

---

## Frontend integration (`frontend/src`)

The frontend is **Next.js (App Router) + NextAuth**. Two token layers, kept separate:

- **NextAuth session** — the browser-facing session, a JWT stored in an httpOnly cookie. Managed entirely by NextAuth; the browser never touches the backend token directly.
- **Backend `accessToken`** — the JWT the Nest API issues. It's tucked *inside* the NextAuth token and surfaced to server code as `session.accessToken`.

**Login** (`src/auth.ts`) — a NextAuth `Credentials` provider whose `authorize()` calls `POST /auth/login`, then stashes the backend `accessToken` (+ id, username) into the NextAuth JWT via the `jwt` callback. The `session` callback re-exposes them. So `signIn("credentials", …)` is the only login entry point; the backend call is an implementation detail behind it.

**Register** (`src/app/actions/auth.ts`) — a server action `POST`s `/auth/register`, then immediately calls `signIn("credentials", …)` to auto-login (no second manual step).

**Authenticated requests** — the central client `src/lib/api-client.ts` is the *only* place that calls the API. Every function takes the backend `token` and sets `Authorization: Bearer <token>`; it also normalizes error bodies (Nest's `message` string/array) into thrown `Error`s. Callers get the token from `auth()` (server) and pass it in — no scattered `fetch`, no header duplication.

**Session lifecycle** — NextAuth owns it: cookie persistence, expiry, and the `/login` redirect on missing/invalid sessions. When the backend token expires (7d), API calls 401 and the user re-authenticates. Logout is `signOut()` (clears the cookie); there's no server-side revocation. A username change calls NextAuth `update()` so the session reflects it without re-login (`jwt` callback `trigger === "update"`).

```
Register form  → server action → POST /auth/register → signIn("credentials") → /home
Login form     → signIn("credentials") → authorize() → POST /auth/login → session holds accessToken
Any data call  → api-client fn(token) → Authorization: Bearer → Nest
```

---

## Steam import (`src/steam` + `src/platform-connections`)

Fully asynchronous.

```
POST /platform-connections/steam
  → connectSteam
      → SteamApiService.resolveToSteamId64   (vanity/profile URL/raw id → SteamID64)
      → upsert PlatformConnection (status = PENDING)
      → steamSyncQueue.add("sync", …)
  ← returns immediately (PENDING)

[worker] SteamSyncProcessor.process
      → status = SYNCING
      → SteamApiService.getOwnedGames(steamId64)
      → per game: GamesService.upsertBySteamAppId → UserGamesService.upsert (playtime, lastPlayedAt)
      → status = DONE  (or "profile may be private" if 0 games)
      → if games imported: rawgEnrichQueue.add("enrich")
```

- **Status** — `PlatformConnection.syncStatus` (`PENDING → SYNCING → DONE/FAILED`); frontend polls `GET /platform-connections/steam/status`.
- **Cover art** — Steam's store header initially; RAWG upgrades it later.
- **Playtime** — `playtime_forever` (minutes) + `rtime_last_played` (unix → `Date`) on `UserGame`.
- **Resync** re-enqueues with the stored `steamId64`. Errors are written to `syncError` — never a silent failure.

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/platform-connections/steam` | `{ profileUrlOrId }` | status (PENDING) |
| POST | `/platform-connections/steam/resync` | — | status |
| GET | `/platform-connections/steam/status` | — | status, or `{ connected: false }` |

---

## PlayStation import (`src/psn` + `src/platform-connections`)

Mirrors Steam; differs only in auth. Steam uses a **public** profile id; PSN has no public API, so the user supplies a **private** NPSSO token (64-char value from their `ca.account.sony.com/api/v1/ssocookie` session).

```
POST /platform-connections/psn { npsso }
  → connectPsn
      → PsnApiService.authenticateWithNpsso   (npsso → accessCode → tokens → profile)
      → upsert PlatformConnection (PENDING; stores refreshToken + accountId + onlineId)
      → psnSyncQueue.add("sync", …)
  ← returns sanitized status (NEVER the refresh token)

[worker] PsnSyncProcessor.process
      → refreshAccessToken(refreshToken) → getPlayedGames(accessToken) (paginated)
      → per title: GamesService.upsertByPsnTitleId → UserGamesService.upsert(…, PLAYSTATION)
      → status = DONE  (or "no games / hidden history")
      → if games imported: rawgEnrichQueue.add("enrich")
```

- **No NPSSO re-entry on resync** — the long-lived `psnRefreshToken` is stored once and exchanged for a fresh access token each sync. When it expires, the sync fails and the user reconnects via the same endpoint.
- **Secret handling** — `psnRefreshToken` is never returned; the controller shapes every response through `toPsnStatus` (`connected`, `onlineId`, `syncStatus`, `syncError` only).
- **Playtime** — `playDuration` (ISO 8601, e.g. `PT228H56M33S`) → whole minutes.
- **Identity key** — reconciles onto the shared `Game` catalog via `psnTitleId` (e.g. `CUSA01433_00`).

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/platform-connections/psn` | `{ npsso }` | sanitized status |
| POST | `/platform-connections/psn/resync` | — | sanitized status |
| GET | `/platform-connections/psn/status` | — | sanitized status, or `{ connected: false }` |

`ConnectPsnDto` requires a non-empty `npsso`; the 64-char check lives in `authenticateWithNpsso` (400 on malformed/expired).

---

## RAWG (`src/rawg` + `GamesService`)

Enriches bare game rows (often imported with just a name) with genres, cover, release date, metacritic, description. `RawgApiService.request()` injects the key, returns `null` on 404, throws `ServiceUnavailableException` otherwise; `isConfigured` gates every call so the app runs without a key.

**Synchronous (in-request):**
- `search(query)` — queries local DB (`ILike`) **and** RAWG, upserts hits into the local cache, merges + dedupes. Falls back to local cache if RAWG is down.
- `browse()` — RAWG popular list (`ordering=-added`, `metacritic 75-100`), cached; falls back to cached rows by metacritic.
- `getById()` — lazy-loads full description on first detail view.

**Asynchronous (`RawgEnrichProcessor`, queue `rawg-enrich`):**

```
process()
  → findMissingRawgData(40)   (rawgId IS NULL AND rawgEnrichedAt IS NULL)
  → per game: searchGames(cleanedName) → isPlausibleMatch picks best hit
        match    → enrichGame(game, match)
        no match → markEnrichmentAttempted()   (sets rawgEnrichedAt so it isn't retried forever)
  → if batch full (40): re-enqueue to keep draining
```

Matching (`rawg-enrich.processor.ts`): `normalize()` strips trademark symbols, punctuation, edition suffixes (`Deluxe`, `GOTY`, …); `isPlausibleMatch()` accepts on equal names, containment, or ≥50% token overlap; `enrichGame()` applies data onto the **existing** row (by job, not name) and deletes any duplicate RAWG-only row a prior run created.

**Triggers:** after a successful Steam sync, and on app boot (`GamesService.onApplicationBootstrap` backfills anything unenriched).

---

## Domain modules

**Games (`src/games`)** — the shared catalog. Three identity keys: `steamAppId`, `psnTitleId`, `rawgId`. `GamesService` owns all upsert/merge logic so Steam, PSN, and RAWG data converge onto one row per game.

**User library (`src/user-games`)** — `UserGame` joins user↔game↔platform (unique on `userId + gameId + platform`). Status `BACKLOG → PLAYING → FINISHED/DROPPED` (default `BACKLOG`). `setStatus` auto-writes a diary entry on any real change; `changePlatform` guards the unique index with a `ConflictException`; `addManual` adds non-Steam games. Reads allow viewing another user's library (`?userId=`); writes are always scoped to `req.user.userId`.

**Ratings & Reviews (`src/ratings`, `src/reviews`)** — ratings: one value per user+game (upsert); `summary()` returns average, count, and the viewer's own rating. Reviews: reviews + likes + comments; `findViews()` builds one query with a `leftJoinAndMapOne` for the author's rating, batched like/comment counts (no N+1), and a per-viewer "liked by me" set. Edit/delete enforce ownership (`ForbiddenException`).

**Diary (`src/diary`)** — time-stamped play log (`playedOn`, `platform`, optional `status` + `note`). Written by users and automatically by `setStatus`. Feed helpers (`findRecentByAuthors`, `findRecentForUser`) feed Social and profile stats.

**Lists (`src/lists`)** — `List` + ordered `ListItem`. `addItem` computes next `position` via `MAX(position)+1` and dedupes; counts aggregated in one grouped query.

**Social (`src/social`)** — aggregation layer over Reviews, Diary, Lists (+ the `PlatformConnection` repo). `Follow` is a self-referential user↔user edge.
- `activityFeed` — recent reviews + diary + lists from followed users (parallel `Promise.all`), tagged with a discriminated `type`, merged, sorted, paginated in memory.
- `playingFeed` — what followed users are currently `PLAYING`.
- `profile` / `profileStats` — follower/following/game counts + curated favorites, with fallbacks to most-played/most-tagged. Genres aggregated via raw SQL `unnest(g.genres)`.
- `profile.connections` — completed imports (`syncStatus = DONE`) shown as platform badges. Badge label is the editable `steamUsername`/`psnUsername` (or `null` → client omits it). Steam's numeric `steamId64` is returned only to build the community link, never shown as a label. Secrets excluded.

**Stats (`src/stats`)** — computed on demand. `overview`: totals, per-status counts (`COUNT(*) FILTER`), completion rate, top genres/platforms by playtime. `wrapped` (year/month recap): derives "played in period" from diary entries + Steam `lastPlayedAt`, falls back to all-time most-played. Steam only exposes total playtime + last-played date, so period playtime is an approximation.

**Recommendations (`src/recommendations`)** — genre-overlap scoring, no ML. Seeds = games rated ≥4 (fallback: most-played) → build genre weights → score unowned candidates whose genres intersect (Postgres `&&`) → return top 12. RAWG only tops up a thin local cache.

**Users & Cloudinary (`src/users`)** — profile CRUD + curated favorites (`displayName`, `favoriteGameId`, `topGameIds`, `favoriteGenres`, `topFranchise`, `steamUsername`/`psnUsername`), all patched through `PATCH /users/me`. `PATCH /users/me/password` verifies the current password before re-hashing. `POST /users/me/avatar` (multipart, 5 MB cap, JPEG/PNG/WebP/GIF) uploads via `CloudinaryService` — signed server-side (secret never reaches the browser), raw REST (no SDK), keyed by `userId` with `overwrite=true`. `isConfigured` gates the feature.

---

## Cross-cutting patterns

- **Graceful degradation** — every external service (RAWG, Cloudinary) has an `isConfigured` gate and try/catch fallback. The app never hard-fails on a missing key or a down third party.
- **Async off-loading** — anything slow or rate-limited runs in a BullMQ worker, not the request.
- **Ownership checks in services**, not controllers — services throw `NotFound`/`Forbidden`; controllers guard auth and pass `req.user.userId`.
- **No secrets in code** — all via `ConfigService`; sanitized responses never leak `psnRefreshToken` or the Cloudinary secret.
- **One reconciliation point** — `GamesService` is the only place that merges Steam/PSN/RAWG identities into a single row.
