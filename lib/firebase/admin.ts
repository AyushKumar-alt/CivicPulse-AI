import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function createAdminApp() {
  // 1. Explicit production key: set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return initializeApp({ credential: cert(sa) });
  }

  // 2. Local development fallback: if service-account.json exists in root, prefer it locally
  let localSaPath = join(process.cwd(), "service-account.json");
  if (!existsSync(localSaPath)) {
    // Fallback in case Next.js runs from the user home directory instead of project root
    localSaPath = join(__dirname, "../../service-account.json");
  }
  if (!existsSync(localSaPath)) {
    // Second fallback specifically for the OneDrive project path
    localSaPath = join(process.cwd(), "OneDrive/Desktop/community-hero-ai/service-account.json");
  }

  if (existsSync(localSaPath)) {
    try {
      const sa = JSON.parse(readFileSync(localSaPath, "utf8"));
      return initializeApp({ credential: cert(sa) });
    } catch (readError) {
      console.warn("Failed to read local service-account.json at " + localSaPath + ", trying other methods...", readError);
    }
  }

  // 3. GCP Production Environment: try default credentials (ADC)
  try {
    return initializeApp();
  } catch (gcpError) {
    console.error(
      "Failed to initialize Firebase Admin. Set FIREBASE_SERVICE_ACCOUNT_JSON, " +
      "run in a GCP environment, or place service-account.json in the project root."
    );
    throw gcpError;
  }
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
