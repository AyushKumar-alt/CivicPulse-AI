import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  const serviceAccountPath = path.resolve("./service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  }
}

if (!serviceAccount) {
  console.error("❌ ERROR: No service account found.");
  process.exit(1);
}

const app = !getApps().length
  ? initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
  : getApps()[0];

const db = getFirestore(app, "default");

async function purgeAllData() {
  console.log("==================================================================");
  console.log("          PURGING ALL FIRESTORE ISSUES & AUDIT LOGS");
  console.log("==================================================================");

  // 1. Purge issues collection
  const issuesSnap = await db.collection("issues").get();
  console.log(`Found ${issuesSnap.docs.length} issue documents to delete...`);
  
  const issueBatch = db.batch();
  issuesSnap.docs.forEach((doc) => {
    issueBatch.delete(doc.ref);
  });
  if (issuesSnap.docs.length > 0) {
    await issueBatch.commit();
    console.log(`✓ Deleted ${issuesSnap.docs.length} issue documents.`);
  }

  // 2. Purge audit_logs collection
  const auditSnap = await db.collection("audit_logs").get();
  console.log(`Found ${auditSnap.docs.length} audit log documents to delete...`);
  
  const auditBatch = db.batch();
  auditSnap.docs.forEach((doc) => {
    auditBatch.delete(doc.ref);
  });
  if (auditSnap.docs.length > 0) {
    await auditBatch.commit();
    console.log(`✓ Deleted ${auditSnap.docs.length} audit log documents.`);
  }

  console.log("==================================================================");
  console.log("          PURGE COMPLETE — FIRESTORE IS FRESH & CLEAN");
  console.log("==================================================================");
}

purgeAllData().catch((err) => {
  console.error("Purge error:", err);
  process.exit(1);
});
