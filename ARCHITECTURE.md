# SavePoint Backend — Developer Flow Guide

A technical walkthrough of how the backend works, module by module. This is a personal reference, not the README.

## Stack at a glance

| Concern | Tech | Where |
|---|---|---|
| Framework | NestJS 11 (modular DI) | `src/*/*.module.ts` |
| DB | PostgreSQL via TypeORM (migrations, `synchronize: false`) | `src/database`, `app.module.ts` |
| Background jobs | BullMQ queues backed by Redis | `@nestjs/bullmq`, `*.processor.ts` |
| Cache/queue store | Redis (via `ioredis`, wired through BullMQ) | `REDIS_URL` |
| Auth | JWT (Passport) + bcrypt | `src/auth` |
| External: game metadata | RAWG API | `src/rawg` |
| External: library import | Steam Web API, PlayStation Network (`psn-api`) | `src/steam`, `src/psn` |
| External: image hosting | Cloudinary (signed REST upload) | `src/users/cloudinary.service.ts` |

Everything is bootstrapped in `main.ts`: a global `ValidationPipe` (`whitelist: true` strips unknown fields, `transform: true` coerces DTO types) and CORS locked to `FRONTEND_URL`.

---

## Core wiring (`app.module.ts`)

Two async root modules matter:

- **TypeORM** connects to `DATABASE_URL`. All entities are registered explicitly. `synchronize: false` means schema changes only happen through migrations in `src/database/migrations`.
- **BullMQ** connects to `REDIS_URL`. This single connection powers every queue. Feature modules then call `BullModule.registerQueue({ name })` to attach a specific queue.

`ConfigModule` is global, so `ConfigService` is injectable anywhere for env access (never hardcode secrets).

---

## Redis — what it actually does here

Redis is **not** used as a read cache. Its only role is to be the **BullMQ backing store** for two job queues:

- `steam-sync` — one job per Steam library import.
- `psn-sync` — one job per PlayStation library import.
- `rawg-enrich` — background metadata backfill.

Producers (services) call `queue.add(...)`; consumers (`WorkerHost` processors) pick jobs up and run them off the request thread. This keeps slow third-party HTTP calls out of the user's request/response cycle.

---

## Auth flow (`src/auth`)

### Backend mechanics

1. **Register** (`AuthService.register`): checks email + username uniqueness → `bcrypt.hash(password, 10)` → creates user → returns a signed JWT.
2. **Login**: look up by email → `bcrypt.compare` → sign JWT. Failures throw `UnauthorizedException` with a generic `"Invalid credentials"` message (no user enumeration — same response whether the email or the password is wrong).
3. **Token**: `signToken` embeds `{ sub: userId, email, username }`. Signed with `JWT_SECRET`, expires in `JWT_EXPIRES_IN` (default `7d`) — both from `AuthModule`'s `JwtModule.registerAsync`.
4. **Protecting routes**: `JwtStrategy` (Passport) extracts the token from the `Authorization: Bearer` header, verifies signature + expiry against `JWT_SECRET`, and returns `{ userId: payload.sub, email }`. Nest attaches that to `req.user`. Controllers guard with `@UseGuards(JwtAuthGuard)` and read `req.user.userId`.

The user id **always** comes from the verified token, never from the request body — a client cannot act as another user by changing a payload field.

### The endpoints

| Method | Route | Guard | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ email, username, password }` | `{ accessToken, user }` |
| POST | `/auth/login` | — | `{ email, password }` | `{ accessToken, user }` |
| GET | `/users/me` | JWT | — | current user profile |

**Validation** (enforced by the global `ValidationPipe` + DTO decorators, returns `400` on failure):
- `email` — valid email.
- `username` — 3–20 chars, `[a-zA-Z0-9_]` only.
- `password` — min 8 chars.

**Success response shape** (both register and login):
```json
{
  "accessToken": "eyJhbGci...",
  "user": { "id": "uuid", "email": "a@b.com", "username": "andi" }
}
```

### How the frontend uses it

**1. On register/login** — store the token and hydrate the user:
```ts
const res = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) throw new Error("Invalid credentials"); // 401
const { accessToken, user } = await res.json();
// persist the token (see storage note below)
```

**2. On every authenticated request** — attach the token as a Bearer header:
```ts
fetch(`${API}/users/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```
A central API client (per the frontend guidelines — don't scatter `fetch` calls) should inject this header automatically and handle `401` globally.

**3. Session bootstrap on app load** — the token is the source of truth, `/users/me` rehydrates the profile:
- On mount, if a token exists, call `GET /users/me`.
- `200` → user is logged in; populate auth state with the returned profile.
- `401` → token missing/expired/invalid → clear it and redirect to login.

**4. Handling expiry** — there is **no refresh-token endpoint**. Tokens are long-lived (7d) and stateless. When any request returns `401`, treat the session as dead: clear the token and route to login. (If you later want silent refresh or logout-all, that's a backend addition — right now logout is purely client-side: drop the token.)

**5. Logout** — client-side only. Delete the stored token; there's no server call and no server-side revocation (a stolen token stays valid until it expires — keep that in mind for storage).

**Token storage note (FE decision, security-relevant):** `localStorage` is simplest but is readable by any XSS. A `httpOnly` cookie is safer against XSS but needs CSRF handling and a backend change (the API currently reads the `Authorization` header, and CORS is already set with `credentials: true`). Pick deliberately.

### Typical FE flow, end to end

```
[Register/Login form]
    → POST /auth/register | /auth/login
    → { accessToken, user }
    → store token + set auth state → redirect to app

[Any protected page/action]
    → API client adds `Authorization: Bearer <token>`
    → 2xx: proceed
    → 401: clear token → redirect to login

[App reload / refresh]
    → token in storage?  → GET /users/me
        → 200: restore session
        → 401/none: show login
```

Note: `/auth/login` intentionally returns `200` (not `201`) via `@HttpCode(HttpStatus.OK)`, while `/auth/register` returns the default `201`. Register also does **not** auto-check for existing sessions — the FE decides whether to auto-login after register (the token is already returned, so no second call is needed).

---

## Steam import flow (`src/steam` + `src/platform-connections`)

This is the most involved flow. It's fully asynchronous.

```
POST /platform-connections/steam
  → PlatformConnectionsService.connectSteam
      → SteamApiService.resolveToSteamId64   (vanity URL / profile URL / raw ID → SteamID64)
      → upsert PlatformConnection (status = PENDING)
      → steamSyncQueue.add("sync", { connectionId, userId, steamId64 })
  ← returns immediately (status PENDING)

[worker] SteamSyncProcessor.process
      → status = SYNCING
      → SteamApiService.getOwnedGames(steamId64)     (Steam Web API)
      → for each owned game:
            GamesService.upsertBySteamAppId(...)      (create/update Game row)
            UserGamesService.upsert(...)              (link user ↔ game, playtime, lastPlayedAt)
      → status = DONE (or "profile may be private" if 0 games)
      → if games imported: rawgEnrichQueue.add("enrich")   (hand off to metadata backfill)
```

Key details:
- **Status tracking**: `PlatformConnection.syncStatus` (`PENDING → SYNCING → DONE/FAILED`) is how the frontend polls progress via `GET /platform-connections/steam/status` (`getStatus`).
- **Cover art**: Steam's store header image (`coverUrl`) is used initially; RAWG later upgrades it.
- **Playtime**: `playtime_forever` (minutes) and `rtime_last_played` (unix → `Date`) are stored on `UserGame`.
- **Resync** re-enqueues the same job with the stored `steamId64`.
- Errors are caught and written to `syncError` — the job never silently fails.

---

## PlayStation import flow (`src/psn` + `src/platform-connections`)

Mirrors the Steam flow, differing only in authentication. Steam identifies a user by a
**public** profile id; PSN has no public API, so the user supplies a **private** NPSSO token
(the 64-char value from their logged-in `ca.account.sony.com/api/v1/ssocookie` session).

```
POST /platform-connections/psn   { npsso }
  → PlatformConnectionsService.connectPsn
      → PsnApiService.authenticateWithNpsso   (npsso → accessCode → auth tokens → profile)
      → upsert PlatformConnection (status = PENDING, stores refreshToken + accountId + onlineId)
      → psnSyncQueue.add("sync", { connectionId, userId, refreshToken })
  ← returns a sanitized status (NEVER the refresh token)

[worker] PsnSyncProcessor.process
      → status = SYNCING
      → PsnApiService.refreshAccessToken(refreshToken)   (mint a fresh access token)
      → PsnApiService.getPlayedGames(accessToken)        (paginated getUserPlayedGames("me"))
      → for each played title:
            GamesService.upsertByPsnTitleId(...)          (create/update Game row)
            UserGamesService.upsert(..., PLAYSTATION)     (link user ↔ game, playtime, lastPlayedAt)
      → status = DONE (or "no games / hidden history" if 0 titles)
      → if games imported: rawgEnrichQueue.add("enrich")
```

Key details:
- **No NPSSO re-entry on resync**: the long-lived `psnRefreshToken` is stored once at connect
  time and exchanged for a fresh access token on every sync. When it eventually expires, the sync
  fails and the user reconnects (re-supplies NPSSO) via the same endpoint.
- **Secret handling**: `psnRefreshToken` is never returned by any endpoint — the controller shapes
  responses through `toPsnStatus` (only `onlineId` + sync state).
- **Playtime**: PSN reports `playDuration` as an ISO 8601 duration (e.g. `PT228H56M33S`), converted
  to whole minutes in `PsnApiService`.
- **Identity key**: PSN games reconcile onto the shared `Game` catalog via `psnTitleId` (e.g.
  `CUSA01433_00`), alongside `steamAppId` and `rawgId`.

### Endpoints

The whole `PlatformConnectionsController` is behind `@UseGuards(JwtAuthGuard)`, so the user id
always comes from the verified token, never the body. `ConnectPsnDto` requires `npsso` to be a
non-empty string; the 64-character length check lives in `PsnApiService.authenticateWithNpsso`
(throws `400` on a malformed or expired token).

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/platform-connections/psn` | `{ npsso }` | sanitized status (`toPsnStatus`) |
| POST | `/platform-connections/psn/resync` | — | sanitized status (re-runs sync with stored refresh token) |
| GET | `/platform-connections/psn/status` | — | sanitized status, or `{ connected: false }` if never connected |

Every response is shaped by `toPsnStatus`, which deliberately omits the secret `psnRefreshToken`:

```json
{
  "connected": true,
  "onlineId": "andi_psn",
  "syncStatus": "done",
  "syncError": null
}
```

`syncStatus` (`pending → syncing → done/failed`) is what the frontend polls on `GET .../psn/status`
to track import progress — same pattern as Steam.

---

## RAWG integration (`src/rawg` + `GamesService`)

RAWG enriches bare game rows (often imported from Steam with just a name) with genres, cover art, release date, metacritic, and description. Two access patterns:

### 1. Synchronous (inside request) — search & browse

`GamesService` calls `RawgApiService` directly when the user searches or browses:
- `search(query)` — queries local DB (`ILike`) **and** RAWG, upserts RAWG hits into the local cache, merges, dedupes by id. If RAWG is down or unconfigured, it silently serves the local cache (graceful degradation).
- `browse()` — pulls RAWG's popular list (`ordering=-added`, `metacritic 75-100`), caches locally, falls back to cached rows ordered by metacritic.
- `getById()` — lazy-loads the full description from RAWG on first detail view.

`RawgApiService.request()` centralizes: injects the API key, returns `null` on 404, throws `ServiceUnavailableException` on other failures. `isConfigured` gates every call so the app runs fine without a RAWG key.

### 2. Asynchronous (background) — bulk enrichment

`RawgEnrichProcessor` (queue `rawg-enrich`) drains games missing RAWG data:

```
process()
  → GamesService.findMissingRawgData(40)        (rawgId IS NULL AND rawgEnrichedAt IS NULL)
  → for each: RawgApiService.searchGames(cleanedName)
        → isPlausibleMatch() picks the best hit  (normalized fuzzy match)
        → match  → GamesService.enrichGame(game, match)
        → no match → markEnrichmentAttempted()   (sets rawgEnrichedAt so it isn't retried forever)
  → if batch was full (40): re-enqueue to keep draining
```

The matching logic (`rawg-enrich.processor.ts`) is the clever part:
- `normalize()` strips trademark symbols, punctuation, and edition suffixes (`Deluxe`, `GOTY`, `Director's Cut`, …).
- `toSearchQuery()` produces a cleaner query than the raw Steam title for better RAWG hit rates.
- `isPlausibleMatch()` accepts a hit if names are equal, one contains the other, or token overlap ≥ 50%.
- `enrichGame()` applies RAWG data onto the **existing** row (identified by job, not name lookup) and deletes any duplicate RAWG-only row that a prior run created — avoids duplicate games when Steam and RAWG names differ.

**Triggers for enrichment**: (a) after a successful Steam sync, (b) on app boot (`GamesService.onApplicationBootstrap` backfills anything left unenriched — e.g. games synced before the RAWG key existed).

---

## Games (`src/games`)

The `Game` entity is the shared catalog. Three identity keys: `steamAppId` (from Steam), `psnTitleId` (from PlayStation), and `rawgId` (from RAWG). `GamesService` is the reconciliation hub — it owns all the upsert/merge logic so Steam, PSN, and RAWG data converge onto one row per game instead of duplicating.

---

## User library (`src/user-games`)

`UserGame` = the join between a user and a game on a specific platform (unique on `userId + gameId + platform`).

- **Status**: `BACKLOG → PLAYING → FINISHED / DROPPED`. Default is `BACKLOG`.
- **`setStatus`**: on any *actual* status change, it auto-writes a diary entry (`"Marked as Finished"`, etc.) — the library and diary stay in sync automatically.
- **`changePlatform`**: guarded against the unique-index collision with a clear `ConflictException`.
- **`addManual`**: lets users add games not owned on Steam.
- Reads allow viewing *another* user's library (`?userId=`), writes are always scoped to `req.user.userId`.

---

## Ratings & Reviews (`src/ratings`, `src/reviews`)

- **Ratings** (`RatingsService`): one value per `user + game` (upsert). `summary()` returns average, count, and the viewer's own rating in one shot.
- **Reviews** (`ReviewsService`): reviews + likes + comments. The interesting bit is `findViews()`, which builds a single query with:
  - a `leftJoinAndMapOne` to attach each author's rating for that game onto the review,
  - batched like-count / comment-count aggregation (avoids N+1),
  - a per-viewer "liked by me" set.
  Ownership is enforced on edit/delete (`getOwnReview` → `ForbiddenException`).

---

## Diary (`src/diary`)

Simple time-stamped log of play sessions (`playedOn`, `platform`, optional `status` + `note`). Written manually by the user **and** automatically by `UserGamesService.setStatus`. Provides feed helpers (`findRecentByAuthors`, `findRecentForUser`) consumed by Social and profile stats.

---

## Lists (`src/lists`)

User-curated game lists (`List` + ordered `ListItem`). `addItem` computes the next `position` via `MAX(position)+1` and dedupes. Item counts are aggregated in a single grouped query (`itemCounts`) rather than per-list.

---

## Social (`src/social`)

The aggregation layer. `Follow` is a self-referential user↔user edge.

- **`activityFeed`**: pulls recent reviews, diary entries, and lists from everyone you follow (in parallel via `Promise.all`), tags each with a discriminated `type`, merges, sorts by `createdAt`, and paginates the merged result in memory.
- **`playingFeed`**: what followed users are currently `PLAYING`.
- **`profile` / `profileStats`**: follower/following/game counts + curated favorites (games, genres, franchise) with automatic fallbacks to most-played / most-tagged when the user hasn't curated. Raw SQL (`unnest(g.genres)`) is used to aggregate genres from the Postgres array column.
- **Profile connections**: `profile` also returns a `connections` array so a user's profile can display which platforms they've linked. `syncedConnections` reads `PlatformConnection` rows filtered to `syncStatus = DONE` (only *completed* imports show as badges). The badge **label** is the user's editable `steamUsername` / `psnUsername` (see Users below), not the raw synced identifier — when the user has set a name it's shown, and when it's unset we send `null` and the client omits the label (there is no separate visibility toggle). Steam only exposes a numeric `steamId64`, so its label falls back to the platform name on the client (never the number) while `steamId64` is still returned solely to build the public Steam community link. PSN's `psnOnlineId` is human-readable, so it's the fallback there. Secrets (e.g. `psnRefreshToken`) are never included, mirroring the `toPsnStatus` discipline in `PlatformConnectionsController`. This is why `SocialModule` registers `PlatformConnection` in `TypeOrmModule.forFeature`.

Social depends on Reviews, Diary, and Lists services (and the `PlatformConnection` repository) — it composes them rather than re-querying.

---

## Stats (`src/stats`)

Analytics computed on demand (noted as a candidate for a precompute job later).

- **`overview`**: totals, per-status counts (`COUNT(*) FILTER (WHERE ...)`), completion rate, top genres/platforms by playtime. Genre breakdown again uses `unnest()` on the array column.
- **`wrapped`** (year/month recap): derives "played in period" from two real signals — diary entries in range and Steam's `lastPlayedAt`. Falls back to all-time most-played so the recap is never empty. Honest caveat in the code: Steam only exposes *total* playtime + *last* played date, so period playtime is an approximation.

---

## Recommendations (`src/recommendations`)

Genre-overlap scoring — deliberately no ML.

```
forUser(userId)
  → seed games = games rated ≥ 4  (fallback: most-played)
  → build genreWeights map (genre → frequency across seeds)
  → score local candidates: sum of genreWeights for each unowned game whose
    genres intersect (Postgres array `&&` operator), sorted by score
  → if < 12 results and RAWG configured: fetch top-3 genres from RAWG,
    cache them, re-score
  → return top 12
```

Owned games are excluded; RAWG is only used to top up a thin local cache.

---

## Users & Cloudinary (`src/users`)

`UsersService` handles profile CRUD and curated favorites. Curated fields on the `User` row include `displayName`, `favoriteGameId`, `topGameIds`, `favoriteGenres`, `topFranchise`, and the editable platform labels `steamUsername` / `psnUsername` (nullable, trimmed to `null` when blank — shown on the profile next to synced connections, see Social). All are patched through the single `PATCH /users/me` (`UpdateProfileDto`) endpoint. Avatar uploads go through `CloudinaryService`:
- Signed **server-side** so the API secret never reaches the browser.
- Uses Cloudinary's raw REST endpoint (no SDK). Builds the SHA-1 signature over alphabetically-sorted signed params + secret.
- Avatars are keyed by `userId` with `overwrite=true`, so re-uploads replace the old image.
- `isConfigured` gates the feature — the app runs without Cloudinary.

---

## Cross-cutting patterns worth remembering

- **Graceful degradation**: every external service (RAWG, Cloudinary) has an `isConfigured` gate and try/catch fallbacks. The app never hard-fails because a third party is down or a key is missing.
- **Async off-loading**: anything slow or rate-limited (Steam import, RAWG bulk enrich) runs in a BullMQ worker, not in the request.
- **Ownership checks live in services**, not controllers — services throw `NotFound`/`Forbidden`; controllers just guard auth and pass `req.user.userId`.
- **No secrets in code** — all via `ConfigService`.
- **Dedup/merge discipline** — `GamesService` is the single place that reconciles Steam vs RAWG identities into one row.
