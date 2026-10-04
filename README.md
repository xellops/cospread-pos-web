# CoSpread POS

An offline-first point of sale for CoSpread businesses. Sales staff sign in with their business's **client ID**, email and password. They can then:

- browse and search products by name, description or SKU, in card or list view
- serve several customers at once using cart tabs
- place orders and create invoices
- manage existing orders and invoices

Everything works without a connection. Changes are stored on the device and synced to CoSpread automatically.

The product spec is in [`product-documentation/product.md`](product-documentation/product.md).

## Getting started

```bash
cp .env.example .env.local   # then adjust
npm install
npm run dev
```

Open http://localhost:3000.

| Variable | Purpose |
| --- | --- |
| `API_PROXY_TARGET` | CoSpread API the `/api/*` rewrite forwards to (default `https://api.dev.cospread.com`; use `http://localhost:7000` for a local `../cospread-api`). |
| `NEXT_PUBLIC_API_URL` | Optional. Calls the API directly from the browser instead of through `/api`. The API must allow this app's origin in CORS (`ALLOWED_ORIGINS`). |
| `NEXT_PUBLIC_FILE_BASE_URL` | Prefix for product image keys (same value as the dashboard's `VITE_PUBLIC_FILE_BASE_URL`). |
| `NEXT_PUBLIC_CURRENCY` | Display currency, default `NGN`. |

## Offline behaviour

- Products, customers, locations and recent orders and invoices are cached in IndexedDB, with one database per business.
- Orders, invoices and status changes made offline are queued and replayed in order when the connection returns. The header shows sync status.
- If CoSpread rejects a queued change (for example, invalid customer details), the record is flagged with the API's message and can be retried or discarded.
- In production builds, a service worker caches the app shell so the POS also reloads while offline.

See `CLAUDE.md` for the architecture.
