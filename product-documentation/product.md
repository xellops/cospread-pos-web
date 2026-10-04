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
- Voew and manage orders as applicable (location can be a significant factor as the team-members of a business can be assigned to specific location)
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
