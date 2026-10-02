// Paste the web config from Firebase console > Project settings > Your apps.
// These values identify your project; they are not secrets. Access is protected by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyBiQOXkv17NNAF1WGlC8wRSNEh-LvLmh5M",
  authDomain: "giazonest.firebaseapp.com",
  projectId: "giazonest",
  storageBucket: "giazonest.firebasestorage.app",
  messagingSenderId: "534238372708",
  appId: "1:534238372708:web:375ea21fc6b80e4d8cd071"
};

// The one account allowed into the console. Must match the email in firestore.rules.
export const SUPER_ADMIN_EMAIL = "admin@giazonest.com";
