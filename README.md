# GiaZoNest

Where selling meets shopping. This is the super admin console: sign in, change or reset the password, and see sellers and buyers by pin code or your current location.

It is a static website (HTML, CSS, JavaScript) that uses Firebase for login (Authentication) and data (Firestore).

## Files

- `public/index.html`: the login page and the landing page
- `public/app.js`: login, password change and reset, sellers and buyers
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

## Run it locally

Browsers block the Firebase modules from `file://`, so serve the folder:

```bash
npx serve public        # or: python3 -m http.server -d public 8080
```

Open the address it prints and sign in with the super admin account. On an empty database, click **Load example data** to fill in sample sellers and buyers.

## Put it online (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase use --add      # pick the GiaZoNest project
firebase deploy         # uploads public/ and firestore.rules
```

Your site will be at `https://<project-id>.web.app`. "Use my location" needs HTTPS, which Firebase Hosting gives you.

## Password reset emails

"Forgot password?" sends Firebase's reset email to the super admin. You can edit its wording under Authentication > Templates.
