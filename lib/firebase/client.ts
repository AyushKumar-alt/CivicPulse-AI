import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB4-ed0rdvC0WBXk_hB72rzeU9RdF3nV4A",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "community-hero-ai-1d497.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "community-hero-ai-1d497",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "557926018360",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:557926018360:web:1be99ec1092a36c60765cd",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = (globalThis as any)._firestoreDb || getFirestore(app);
(globalThis as any)._firestoreDb = db;

const isEmulator = (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR ?? "").toLowerCase() === "true";

if (
  isEmulator &&
  !(globalThis as any)._firestoreEmulatorConnected
) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    (globalThis as any)._firestoreEmulatorConnected = true;
    console.log("[Firebase Client] Connected to local Firestore Emulator at 127.0.0.1:8080");
  } catch (err) {
    console.warn("[Firebase Client] Firestore Emulator connection check:", err);
  }
}

export default app;
