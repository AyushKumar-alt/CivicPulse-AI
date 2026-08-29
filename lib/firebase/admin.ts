import { initializeApp, getApps, getApp, deleteApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function createAdminApp() {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;

  // 1. Explicit production key: set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return initializeApp({ credential: cert(sa), projectId: sa.project_id || projectId });
    } catch (parseError) {
      console.error("[Firebase Admin] SyntaxError parsing FIREBASE_SERVICE_ACCOUNT_JSON environment variable:", parseError);
    }
  }

  // 2. Local development fallback: if service-account.json exists in root, prefer it locally
  let localSaPath = join(process.cwd(), "service-account.json");
  if (!existsSync(localSaPath)) {
    localSaPath = join(__dirname, "../../service-account.json");
  }
  if (!existsSync(localSaPath)) {
    localSaPath = join(process.cwd(), "OneDrive/Desktop/community-hero-ai/service-account.json");
  }

  if (existsSync(localSaPath)) {
    try {
      const sa = JSON.parse(readFileSync(localSaPath, "utf8"));
      return initializeApp({ credential: cert(sa), projectId: sa.project_id || projectId });
    } catch (readError) {
      console.warn("Failed to read local service-account.json at " + localSaPath + ", trying other methods...", readError);
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.warn("[Firebase Admin] WARNING: FIREBASE_SERVICE_ACCOUNT_JSON is missing in production environment. Admin SDK will initialize unauthenticated.");
  }

  // 3. Environment Variable Fallback for ID Token Verification
  if (!projectId) {
    throw new Error(
      "Firebase Admin Initialization Error: No Project ID or Service Account key found. " +
      "Please set NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID in .env.local."
    );
  }

  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIREBASE_PROJECT_ID = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  return initializeApp({ projectId });
}

function getAdminApp() {
  if (getApps().length > 0) {
    const existing = getApp();
    if (existing.options && existing.options.credential) {
      return existing;
    }
    try {
      deleteApp(existing);
    } catch {
      // Ignore cleanup error
    }
  }
  return createAdminApp();
}

let _adminDb: ReturnType<typeof getFirestore> | null = null;

export function getAdminDb() {
  if (!_adminDb) {
    _adminDb = getFirestore(getAdminApp(), "default");
    try {
      const isEmulator = (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR ?? "").toLowerCase() === "true";
      if (isEmulator && process.env.FIRESTORE_EMULATOR_HOST) {
        _adminDb.settings({ ignoreUndefinedProperties: true });
        console.log(`[Firebase Admin] Connected to local Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
      } else {
        _adminDb.settings({ preferRest: true, ignoreUndefinedProperties: true });
        console.log("[Firebase Admin] Connected to Live Cloud Firestore (community-hero-ai-1d497)");
      }
    } catch {
      // Settings already applied
    }
  }
  return _adminDb;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
