import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  const path = join(__dirname, "..", "service-account.json");
  if (existsSync(path)) serviceAccount = JSON.parse(readFileSync(path, "utf8"));
}

if (!serviceAccount) {
  console.error("No service account JSON found.");
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app, "default");

async function fix() {
  console.log("Fixing existing Firestore issue department assignments...");
  const snap = await db.collection("issues").get();
  let updatedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const raw = (data.raw_description || "").toLowerCase();
    const issueType = (data.ai?.issue_type || "").toLowerCase();
    const respAuth = (data.ai?.responsible_authority || "").toLowerCase();
    const summary = (data.ai?.summary || "").toLowerCase();
    const text = `${raw} ${issueType} ${respAuth} ${summary}`;

    const isElectricity = /pole|electric|power|cable|wire|bescom/i.test(text);

    if (isElectricity) {
      await doc.ref.update({
        assigned_department: "electricity",
        assigned_department_name: "Electricity Distribution (BESCOM)",
        assigned_agency_id: "bengaluru_bescom",
        city_code: "bengaluru",
      });
      console.log(`✓ Updated issue [${doc.id}] (${data.ai?.issue_type || "Electricity Issue"}) -> Electricity Distribution (BESCOM)`);
      updatedCount++;
    }
  }

  console.log(`\nUpdated ${updatedCount} issue documents successfully!`);
}

fix().catch(console.error);
