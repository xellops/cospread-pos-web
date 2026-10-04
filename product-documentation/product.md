# What is CoSpread

CoSpread is a multi-tenant business management solution with several capabilities for online and offline businesses as described on cospread.com.

# CoSpread POS

This project is a client-side point-of-sale application that will enable sales personnels create order records on-site with real-time updates. It is an offline-first solution that must then sync with the cospread cloud at every opportunity.

# References

- CoSpread Website: cospread.com
- CoSpread Dashboard: dashboard.dev.cospread.com
- CoSpread Dashboard Local Code Base: ../cospread-business-dashboard (This will contribute to current design/brand guides)
- CoSpread API Local Code Base: ../cospread-api

# Primary features

- View all products
- View and manage orders as applicable (location can be a significant factor as the team-members of a business can be assigned to specific location)
- Create an Order.
- Create multiple carts. This will enable the sales person attend to multiple customers at the same time.
- Manage invoices
- Forgot password feature

# Product requirements

- The user must enter the following fields to log in:
  - clientid: A unique ID that identifies the CoSpread user as a member of a particular business
  - email: The user's CoSpread email
  - password: The user's CoSpread password
- No account creation on CoSpread POS. Only for existing users
- The product list should support list and card views
- User should be able to select from the list of products (variants) when working on a cart.
- Carts can appear like tabs on a Chrome browser.
- User can search products by name, description, sku.

# V2 Plans

- QR and Bar code scanning to add an item to cart
- Desktop version release using ElectronJs

# Recommendations

These came out of building the first version of the POS against `../cospread-api`. They are listed in priority order.

## API changes needed for reliable offline sync

1. **Idempotency keys on create endpoints.**
   - `POST /v1/orders` and `POST /v1/invoices` should accept a client-generated key (for example an `Idempotency-Key` header or a `clientReference` field), and return the existing record when the key repeats.
   - Without this, a connection that drops after the server saves an order but before the response arrives can produce a duplicate on retry. The POS currently works around it by searching recent orders for a match, which is a heuristic and not a guarantee.
2. **Delta sync for products, customers, orders and invoices.**
   - Add an `updatedSince` filter, and include deleted or archived records in the response.
   - List endpoints are capped at 20 pages of 100 records, so the POS can cache at most 2,000 products, and it re-downloads everything on every sync.
3. **Real-time events.** Emit business-scoped socket events when orders or invoices are created or change status, and when stock changes. The socket server doesn't currently emit order or invoice events, so the POS polls every 60 seconds.
4. **Token refresh for non-cookie clients.**
   - `GET /v1/auth/refresh` only reads the refresh token from a cookie scoped to `COOKIE_DOMAIN`. That doesn't work for the POS on another domain or for the Electron app.
   - Accept the refresh token in the request body or a header.
5. **CORS for the POS origin.** Add the production POS domain, and the Electron origin when the desktop app ships, to `ALLOWED_ORIGINS`. Until then the POS goes through its own `/api` proxy.

## Product decisions to make

1. **A friendlier client ID.** The client ID is currently the business UUID, which is hard to type at a counter. Consider a short business code (for example 6–8 characters) or a QR code shown on the dashboard that staff can scan.
2. **Payment details.**
   - Orders only record a payment status (`UNPAID`/`PARTIAL`/`PAID`).
   - A POS needs the payment method (cash, transfer, card/POS terminal), the amount tendered and the change given, and support for split payments.
   - This needs new API fields.
3. **Discounts and tax.** The order and invoice APIs have no line-level or order-level discount or tax. These are common at a till and should be specified before launch.
4. **Selling stock you don't have while offline.**
   - An offline device can't see sales made on other devices, so it can sell more than is in stock.
   - Decide whether to allow this and reconcile afterwards (flag the oversold orders), or to reserve stock per device or location. See `../cospread-api/project-feature-sets/stock-reservation.md`.
5. **Receipts.** Define a receipt layout for 58mm/80mm thermal printers, and whether to send receipts by email or SMS. Today the POS only prints the browser page.
6. **Shared devices and shift changes.**
   - Sign-in currently needs a connection the first time.
   - Consider quick user switching on a shared till (for example a PIN set on the dashboard) so a new shift doesn't need a full sign-in, and so every order is attributed to the right staff member.
7. **Showing actions by permission.**
   - `GET /v1/profile/businesses/:id` already returns the member's permission claim.
   - The POS should hide actions the user isn't allowed to take, such as cancelling orders or marking them paid. Today it shows them and the API rejects them when they sync.
8. **Saving new customers.** Customer details entered at checkout are stored only on the order or invoice. Decide whether checkout should also create a customer record, so repeat customers can be found next time.
9. **Product types.** Only `PUBLISHED` products are shown. Confirm that's right, and decide how services (no stock) and products sold by weight or volume (units such as `KILOGRAM`) should behave in the cart, for example fractional quantities. Today quantities are whole numbers.
