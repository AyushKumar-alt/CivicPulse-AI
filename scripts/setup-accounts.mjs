/**
 * One-time setup script: creates demo accounts + sets authority custom claim.
 *
 * Prerequisites:
 *   1. Download your Firebase service account JSON from:
 *      Firebase Console → Project Settings → Service accounts → Generate new private key
 *   2. Save it as service-account.json in the project root (do NOT commit it)
 *   3. Run: node scripts/setup-accounts.mjs
 *
 * Run ONCE before your demo. Safe to re-run — it skips existing users.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "service-account.json");

if (!existsSync(serviceAccountPath)) {
  console.error(
    "\n❌  service-account.json not found.\n" +
    "    Download from Firebase Console → Project Settings → Service accounts\n" +
    "    and save as service-account.json in the project root.\n"
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = getAuth();
// Database ID is "default" (no parentheses) — created by new Firebase Console.
// If you ever see "5 NOT_FOUND" here, run: node scripts/detect-firestore-db.mjs
const db = getFirestore(app, "default");

const ACCOUNTS = [
  {
    email: "citizen@demo.com",
    password: "Demo1234!",
    displayName: "Demo Citizen",
    role: "citizen",
  },
  {
    email: "authority@demo.com",
    password: "Demo1234!",
    displayName: "Demo Authority",
    role: "authority",
  },
];

async function run() {
  console.log("\nSetting up demo accounts...\n");

  for (const account of ACCOUNTS) {
    let uid;

    try {
      const existing = await auth.getUserByEmail(account.email);
      uid = existing.uid;
      console.log(`  ✓  ${account.email} already exists (uid: ${uid})`);
    } catch {
      const created = await auth.createUser({
        email: account.email,
        password: account.password,
        displayName: account.displayName,
      });
      uid = created.uid;
      console.log(`  ✓  Created ${account.email} (uid: ${uid})`);
    }

    if (account.role === "authority") {
      await auth.setCustomUserClaims(uid, { role: "authority" });
      console.log(`  ✓  Set custom claim { role: "authority" } on ${account.email}`);
    }

    await db.collection("users").doc(uid).set(
      {
        uid,
        role: account.role,
        display_name: account.displayName,
        created_at: Timestamp.now(),
      },
      { merge: true }
    );
    console.log(`  ✓  users/${uid} document written`);
  }

  console.log("\nSetup complete.\n");
  console.log("Demo accounts:");
  console.log("  Citizen:   citizen@demo.com  /  Demo1234!");
  console.log("  Authority: authority@demo.com /  Demo1234!\n");
}

run().catch((err) => {
  console.error("\nFULL ERROR:");
  console.error(err);
  process.exit(1);
});