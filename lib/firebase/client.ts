import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB4-ed0rdvC0WBXk_hB72rzeU9RdF3nV4A",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "community-hero-ai-1d497.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "community-hero-ai-1d497",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "557926018360",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:557926018360:web:1be99ec1092a36c60765cd",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Explicitly target Enterprise database ID "default"
export const db =
  (globalThis as any)._firestoreDb ||
  initializeFirestore(app, {}, "default");
(globalThis as any)._firestoreDb = db;

const isEmulator =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" ||
  (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR ?? "").toLowerCase() === "true" ||
  Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (isEmulator) {
  if (!(globalThis as any)._authEmulatorConnected) {
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      (globalThis as any)._authEmulatorConnected = true;
      console.log("[Firebase Client] Connected to local Auth Emulator at 127.0.0.1:9099");
    } catch (err) {
      console.warn("[Firebase Client] Auth Emulator connection check:", err);
    }
  }

  if (!(globalThis as any)._firestoreEmulatorConnected) {
    try {
      const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
      const [h, p] = host.split(":");
      connectFirestoreEmulator(db, h || "127.0.0.1", Number(p) || 8080);
      (globalThis as any)._firestoreEmulatorConnected = true;
      console.log(`[Firebase Client] Connected to local Firestore Emulator at ${host}`);
    } catch (err) {
      console.warn("[Firebase Client] Firestore Emulator connection check:", err);
    }
  }
}

export default app;
