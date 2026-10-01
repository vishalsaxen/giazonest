// Paste the web config from Firebase console > Project settings > Your apps.
// These values identify your project; they are not secrets. Access is protected by firestore.rules.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// The one account allowed into the console. Must match the email in firestore.rules.
export const SUPER_ADMIN_EMAIL = "admin@giazonest.com";
