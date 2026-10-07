# GiaZoNest

Where selling meets shopping. There are two pages:

- **Admin console** (`index.html`): the super admin signs in, changes or resets the password, adds sellers, reviews KYC, selects and deletes sellers or buyers, and sees sellers and buyers by pin code or current location. The **Partners KYC** tab approves or rejects partners. The **KYC list** tab shows every seller's state, city and pin code with approved and pending KYC counts, by state.
- **Seller page** (`seller.html`): sellers create an account, fill in their shop details and KYC (ticking "Not available" for a PAN, GSTIN or bank account they don't have), and add products with up to 10 photos, a short description, price, discount, stock and category-specific details. "Sold 1" lowers the stock by one and counts the sale.
- **Shop** (`shop.html`): shoppers create an account (name, user ID, mobile, email, pin code, password), sign in with email or user ID, search sellers by state, then city, then pin code (or use their live location), and find KYC-verified sellers with WhatsApp, email and website contact buttons. Shoppers can give each seller a star rating with optional feedback.

The seller page and the shop first show their Terms & Conditions (`public/terms/seller.md`, `public/terms/buyer.md`), and open only after the person accepts. Sellers also agree to the ₹100 per month subscription paid by UPI. Acceptance is remembered on that device and saved on the person's profile; to ask everyone again after editing the terms, change `TERMS_VERSION` in `public/terms.js`. Support email: gizee@giazonest.com.

It is a static website (HTML, CSS, JavaScript) that uses Firebase for login (Authentication) and data (Firestore).

## Files

- `public/index.html`: the login page and the landing page
- `public/app.js`: login, password change and reset, sellers and buyers
- `public/shop.html`, `public/shop.js`: the shopper sign-up, sign-in and seller search
- `public/contacts.js`: seller email, WhatsApp and website checks, and the public seller record
- `public/categories.js`: seller categories, sub-categories and types
- `public/seller.html`, `public/seller.js`: seller sign-up, shop details, KYC and products
- `public/kyc.js`: KYC number checks and the "Not available" option, shared by the admin console and the seller page; sellers type the full 12-digit Aadhaar but only its last 4 digits are saved
- `public/formats.js`: keeps mobile, Aadhaar, pin code and bank account boxes to digits, and PAN, GSTIN and IFSC in capitals, as people type
- `public/product-fields.js`: the extra product details asked for in each category, and price helpers
- `public/photos.js`: shrinks product photos in the browser before saving
- `public/places.js`: Indian states, and the state and city for a pin code (city from the free India Post lookup at api.postalpincode.in)
- `public/terms.js`, `public/terms/`: the Terms & Conditions screen and texts
- `public/ratings.js`: star rating helpers
- `public/partners.html`, `public/partners.js`: the Partners page, where GiZee partners sign up and fill in their details, the super admin approves their KYC, and approved partners enroll sellers
- `public/partner-fields.js`: the Partner ID and the partner and discount checks
- `public/firebase-config.js`: your Firebase project's web config and the super admin email
- `public/pincodes.js`: pin code locations and the example data
- `firestore.rules`: who may read and write the database
- `firebase.json`: hosting and rules settings for the Firebase CLI

## One-time Firebase setup

1. Open https://console.firebase.google.com and create a project named **GiaZoNest**.
2. **Authentication** > Get started > enable **Email/Password**.
3. **Authentication** > Users > **Add user**: enter the super admin email and a strong password.
4. **Firestore Database** > Create database (production mode, region `asia-south1` for India).
5. **Project settings** > Your apps > add a **Web** app. Copy the `firebaseConfig` values into `public/firebase-config.js`.
6. To change the super admin email, edit it in both `public/firebase-config.js` and `firestore.rules`.
7. Publish the rules: paste `firestore.rules` into Firestore > Rules and click Publish, or run `firebase deploy --only firestore:rules`.

## How shoppers see sellers

Seller records hold KYC numbers, so shoppers can never read the `sellers` collection. Instead, each time the admin console loads it copies every **Verified** seller (name, category, pin code, location, email, WhatsApp, website, but no KYC numbers) into `publicSellers`, and removes sellers who are no longer verified. After approving or rejecting KYC, the shop shows the change the next time the console loads.

Products of verified sellers are marked `live`, and the shop shows only live products. A seller's product can only be marked live while their shop is verified, and the admin console turns products on or off when it syncs. Product photos are shrunk in the browser (to about 200 KB each) and stored in Firestore as `productImages`, one document per photo, so the project stays on Firebase's free Spark plan. A seller who signs up keeps their record at `sellers/{uid}`: they can edit it, but can't approve themselves, and their KYC numbers lock once verified.

Shopper profiles are saved in `buyers/{uid}`, so they appear in the admin Buyers list. `usernames/{userId}` maps each user ID to its email for sign-in.

Ratings live in `reviews/{sellerId}_{shopperUid}`, one per shopper per seller. Shoppers can rate only verified sellers and can edit or delete their own rating; the admin can remove any rating from the seller's Review KYC window.

## Partners

A partner opens **Partners** (on the login page) and taps **Create a partner account** (email and password). Next they fill in their details: partner type (GiZee), name, date of birth (DD/MM/YYYY), mobile, PAN, Aadhaar and an optional address. The page builds the Partner ID from the first three letters of the name, the last four Aadhaar digits and the sign-up date (DDMMYY), like `RAV-1234-071026`; `partnerIds/{id}` records which partner holds each ID, so a taken ID gets `-2`, `-3` and so on. Only the last four Aadhaar digits are saved.

Their record is at `partners/{uid}`, readable only by the super admin and the partner. Until it's approved the partner can edit their details (not the Aadhaar, Partner ID or email); saving after a rejection sends it back for review. The super admin approves or rejects on the Partners page or in the console's **Partners KYC** tab. Once approved, the partner can enroll sellers with a discount in rupees off the ₹100 monthly fee. Those sellers land in `sellers` as Pending KYC with `partnerId` and `feeDiscount`, and the partner can see the sellers they enrolled.

## Run it locally

Browsers block the Firebase modules from `file://`, so serve the folder:

```bash
npx serve public        # or: python3 -m http.server -d public 8080
```

Open the address it prints and sign in with the super admin account. On an empty database, click **Load example data** to fill in sample sellers and buyers.

## Put it online (GitHub Pages)

Every push to `main` publishes `public/` to https://vishalsaxen.github.io/giazonest/ through `.github/workflows/pages.yml`.

One-time setup:
1. GitHub repo **Settings > Pages > Source**: choose **GitHub Actions**.
2. Firebase **Authentication > Settings > Authorized domains**: add `vishalsaxen.github.io`, so sign-in works from that address.

## Or use Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add      # pick the GiaZoNest project
firebase deploy         # uploads public/ and firestore.rules
```

Your site will be at `https://<project-id>.web.app`. "Use my location" needs HTTPS, which Firebase Hosting gives you.

## Password reset emails

"Forgot password?" sends Firebase's reset email to the super admin. You can edit its wording under Authentication > Templates.
