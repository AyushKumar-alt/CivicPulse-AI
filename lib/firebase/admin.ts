import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { join } from "path";

function createAdminApp() {
  // Production: set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return initializeApp({ credential: cert(sa) });
  }

  // Local development: service-account.json in project root (gitignored)
  const sa = JSON.parse(
    readFileSync(join(process.cwd(), "service-account.json"), "utf8")
  );
  return initializeApp({ credential: cert(sa) });
}

function getAdminApp() {
  return getApps().length > 0 ? getApp() : createAdminApp();
}

// Database ID is "default" (no parentheses) — specific to this project's Firestore instance.
export function getAdminDb() {
  return getFirestore(getAdminApp(), "default");
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
