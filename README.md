# Pagewise Books

A front-end e-commerce book store (HTML, CSS, JavaScript). Data is kept in the browser's localStorage, so no backend is needed.

## Features
- Book covers (looked up from Open Library, or set an image link in the admin panel)
- Search, category filter, sort, wishlist, cart with stock checks
- Customer sign-in with Gmail and a separate admin portal
- Checkout with Cash on delivery or UPI (opens a UPI app on phones, QR code on computers)
- Parcel tracking (Placed, Packed, Shipped, Out for delivery, Delivered) on the Orders and Cart pages
- Admin panel to manage books and update tracking
- Book Buddy, a built-in shopping assistant

## Setup (edit `CONFIG` at the top of `js/data.js`)
1. `UPI_ID`: your real UPI ID, where payments are sent.
2. `GOOGLE_CLIENT_ID`: create an OAuth Client ID (Web application) in Google Cloud Console and add your site address as an authorized JavaScript origin. Leave it empty to use the demo Gmail sign-in.
3. `ADMIN_HASH`: the SHA-256 hash of `username:password` (lowercase username). To make a new one, open the site, press F12, open the Console, and run `sha256('username:password').then(console.log)`. Paste the result into `ADMIN_HASH`.

## Run locally
Open the folder in VS Code and use the "Live Server" extension.

## Deploy with GitHub Pages
Push to GitHub, then go to Settings > Pages, choose the `main` branch and `/ (root)`, and save.

## Limitations
Everything is stored in each visitor's own browser, so an order placed on one device is not visible to an admin on another. UPI payments are confirmed by the customer and are not verified by a server. Client-side checks are not real security. A production version needs a server, a database and a payment gateway.

## License
MIT. See `LICENSE`.
