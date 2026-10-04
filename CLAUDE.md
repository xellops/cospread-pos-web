# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev`: dev server at http://localhost:3000
- `npm run build`: production build (also runs type-checking)
- `npm run lint`: ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)
- `npx tsc --noEmit`: type-check without building

No test framework is set up yet. The service worker (`public/sw.js`) only registers in production builds, so test offline reloads with `npm run build && npm start`.

## Stack

- Next.js 16 (App Router) with React 19. APIs differ from older Next.js; check `node_modules/next/dist/docs/` before using framework APIs. Layouts use the globally generated `LayoutProps<"/">` type.
- Tailwind CSS v4, configured in `app/globals.css` (`@theme inline`) with no `tailwind.config.*`. Brand tokens (`brand`, `brand-soft`, …) mirror the dashboard's `src/index.css`.
- Dexie (IndexedDB) with `dexie-react-hooks`, plus `lucide-react` icons and `sonner` toasts.
- The path alias `@/*` maps to the repo root.

## Product context

The product spec is `product-documentation/product.md`. This is a client-only, offline-first point of sale for the multi-tenant CoSpread platform. Login takes a client ID, email and password, and there is no sign-up. Staff use multiple carts as Chrome-style tabs, create orders and invoices, and manage existing ones. Planned for v2: barcode scanning and an Electron desktop build.

## Architecture

Every page is a client component. Nothing renders data on the server.

**Data flow.** The UI reads only from IndexedDB, through `useLiveQuery`, and writes only to IndexedDB. Network I/O happens in `lib/sync.ts`.

- `lib/db.ts`: Dexie schema. There is **one database per business** (`cospread-pos-<businessId>`), opened via `getDb(businessId)`. Tables: `products`, `customers`, `locations` (pulled caches), `carts` (local only), `orders` and `invoices` (merged local and server records), `outbox` (queued writes) and `meta`.
- `lib/actions.ts`: all user mutations (cart operations, `placeOrder`, `createInvoice`, `changeOrderStatus`, `changeInvoiceStatus`, `retrySync`, `discardUnsynced`). Each one writes the optimistic record and its outbox entry in a single Dexie transaction, then calls `syncNow()`.
- `lib/sync.ts`: the sync engine. `syncNow()` first pushes the outbox in FIFO order, then pulls (locations, published products, customers, and the latest 300 orders and invoices), then pushes again. Concurrent calls coalesce. `startSync()` runs it on mount, on the `online` event, when the tab becomes visible, and every 60 seconds.

**Order and invoice record identity.**

- `localId` is the stable primary key. For records pulled from the server it equals the server id. For records created offline it is `local-<uuid>` until the API assigns a `serverId`.
- Records start with `reference: null`. Use `displayReference()` to show a short local code until then.
- `pendingOps` counts the record's outbox entries. Pulls skip records with `pendingOps > 0` so they don't overwrite optimistic changes.

**Outbox rules.**

- Entries for the same record replay in order. A status change on a record that hasn't been created on the server yet waits (`BlockedError`).
- On a network error or a 401, the push stops and the entry stays queued.
- 5xx responses are retried up to 5 times.
- A 4xx response marks the entry and its record `failed` and stores the API's message. The UI then offers Try again or Discard.
- `POST /v1/orders` has no idempotency key. To avoid creating an order twice, a retried create first checks the 20 most recent orders for a match (`sameOrder`).

**Auth and session** (`lib/session.ts`, `lib/auth.ts`, `lib/api/client.ts`).

- The client ID is the business UUID. Sign-in calls `POST v1/auth/signin`, then `GET v1/profile/businesses/:clientId` to confirm the user is a member.
- The session (token, business, assigned and active location) is kept in localStorage and read through `useSyncExternalStore`.
- Requests send `Authorization: Bearer` and `x-business-id`. The API silently renews tokens through the `x-token` response header.
- A 401 sets `needsReauth` instead of signing the user out, so carts and unsynced work survive. The app shell then asks for the password again.
- Signing out keeps the business's local database.

**API access.** `lib/config.ts` defaults the API base to the same-origin `/api`. `next.config.ts` rewrites `/api/*` to `API_PROXY_TARGET`, so the browser needs no CORS allowance. Setting `NEXT_PUBLIC_API_URL` makes the browser call the API directly, which only works if the API's CORS policy allows this app's origin. The deployed API allows `*.cospread.com` plus `ALLOWED_ORIGINS`. Rewrites don't work with static export, so the Electron build will need `NEXT_PUBLIC_API_URL` and a CORS allowance.

**Locations.**

- A member pinned to a location (`businessLocationId` on their membership) gets orders and invoices filtered by that location in the pull, and the location picker is locked.
- Other members choose an active location in the header. New orders and invoices are recorded against it.

**Routes.**

- `app/(auth)`: `/login` and `/forgot-password` (OTP request, then reset).
- `app/(app)`: the signed-in shell. `layout.tsx` guards the session, provides `PosContext` (`usePos()` returns `{ session, db }`) and starts sync. Pages are `/pos` (catalog plus cart tabs), `/orders` and `/invoices` (list and detail).

## Facts about the CoSpread API that the code relies on

- Responses are wrapped as `{ success, message, data }`, and paginated data as `{ total, limit, page, records }`. Page is capped at 20 and limit at 100.
- Error bodies are `{ statusCode, message }`, where `message` may be an array of validation errors.
- `ValidationPipe` rejects unknown properties (`forbidNonWhitelisted`), so payloads must match the DTOs exactly: no extra fields such as client ids or metadata.
- Recipient names need at least 2 characters. Phone numbers must be E.164 (`+234…`). `checkout-dialog.tsx` checks both before saving so offline orders don't fail when they sync.
- Order status moves through `PUT v1/orders/:id/status/{confirm|process|ready|dispatch|deliver|cancel|paid}`. The allowed transitions are copied into `ORDER_NEXT_ACTIONS` from `STATUS_TRANSITIONS` in the API's `order.service.ts`. Status endpoints return `{ order, event }`, so the engine fetches the order again afterwards.
- Variant `price` is a plain decimal amount. Item prices come from the server's variant price; local totals are provisional until the record syncs.
- Product images are `NEXT_PUBLIC_FILE_BASE_URL + attachment.file.key`. The default image is the attachment whose `reference` matches `defaultAttachmentReference`.
- The API's socket server emits no order or invoice events, so updates arrive by polling.

## Related codebases (sibling directories)

- `../cospread-api`: NestJS API. Treat it as the source of truth for DTOs, permissions and endpoints.
- `../cospread-business-dashboard`: Vite/React dashboard. Use it as the reference for design and brand (Poppins font, `#141414` text, brand blue `oklch(42% 0.176 265)`, `#EFF3FF` tint).
