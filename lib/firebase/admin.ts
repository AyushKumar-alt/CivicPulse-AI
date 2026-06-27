import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { join } from "path";

function createAdminApp() {
  // 1. Production explicit key: set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return initializeApp({ credential: cert(sa) });
  }

  // 2. Production GCP Default Credentials: If running on GCP (Cloud Run / Firebase App Hosting)
  // we can initialize without explicit credentials using Application Default Credentials (ADC)
  try {
    return initializeApp();
  } catch (gcpError) {
    // 3. Local development fallback: service-account.json in project root (gitignored)
    try {
      const sa = JSON.parse(
        readFileSync(join(process.cwd(), "service-account.json"), "utf8")
      );
      return initializeApp({ credential: cert(sa) });
    } catch (readError) {
      console.error(
        "Failed to initialize Firebase Admin. Set FIREBASE_SERVICE_ACCOUNT_JSON, " +
        "run in a GCP environment, or place service-account.json in the project root."
      );
      throw readError;
    }
  }
}

function getAdminApp() {
  return getApps().length > 0 ? getApp() : createAdminApp();
}

// Database ID is standard (default) for Spark tier compatibility.
export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
