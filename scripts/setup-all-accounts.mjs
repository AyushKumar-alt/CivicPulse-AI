import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  const serviceAccountPath = join(__dirname, "..", "service-account.json");
  if (existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  }
}

if (!serviceAccount) {
  console.error("No service account found");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = getAuth(app);
const db = getFirestore(app, "default");

const DEMO_PASSWORD = "Demo1234!";

const ACCOUNTS = [
  // Core default accounts
  { email: "citizen@demo.com", password: DEMO_PASSWORD, name: "Demo Citizen", role: "citizen" },
  { email: "authority@demo.com", password: DEMO_PASSWORD, name: "Demo Authority", role: "authority", dept: "publicworks" },
  { email: "commandcenter@demo.com", password: DEMO_PASSWORD, name: "Command Centre Admin", role: "commandcenter" },

  // Department accounts
  { email: "bescom@demo.com", password: DEMO_PASSWORD, name: "BESCOM Power Dispatch", role: "authority", dept: "electricity" },
  { email: "electricity@demo.com", password: DEMO_PASSWORD, name: "Electricity Distribution", role: "authority", dept: "electricity" },
  { email: "bwssb@demo.com", password: DEMO_PASSWORD, name: "BWSSB Water Board", role: "authority", dept: "water" },
  { email: "water@demo.com", password: DEMO_PASSWORD, name: "Water Supply & Sewerage", role: "authority", dept: "water" },
  { email: "cmwssb@demo.com", password: DEMO_PASSWORD, name: "CMWSSB Chennai Water", role: "authority", dept: "water" },
  { email: "djb@demo.com", password: DEMO_PASSWORD, name: "Delhi Jal Board", role: "authority", dept: "water" },
  { email: "bbmp@demo.com", password: DEMO_PASSWORD, name: "BBMP Sanitation", role: "authority", dept: "sanitation" },
  { email: "sanitation@demo.com", password: DEMO_PASSWORD, name: "Solid Waste & Sanitation", role: "authority", dept: "sanitation" },
  { email: "roads@demo.com", password: DEMO_PASSWORD, name: "Roads & Highways Division", role: "authority", dept: "roads" },
  { email: "traffic@demo.com", password: DEMO_PASSWORD, name: "Traffic Management", role: "authority", dept: "traffic" },
  { email: "publicworks@demo.com", password: DEMO_PASSWORD, name: "Public Works Department", role: "authority", dept: "publicworks" },
];

async function setup() {
  console.log("Setting up all demo accounts in Firebase Auth...");

  for (const acc of ACCOUNTS) {
    let uid;
    try {
      const existing = await auth.getUserByEmail(acc.email);
      uid = existing.uid;
      await auth.updateUser(uid, { password: acc.password, displayName: acc.name });
      console.log(`✓ Updated password for ${acc.email}`);
    } catch {
      const created = await auth.createUser({
        email: acc.email,
        password: acc.password,
        displayName: acc.name,
      });
      uid = created.uid;
      console.log(`✓ Created ${acc.email}`);
    }

    const claims = acc.role === "commandcenter"
      ? { role: "commandcenter" }
      : acc.role === "authority"
      ? { role: "authority", dept: acc.dept }
      : { role: "citizen" };

    await auth.setCustomUserClaims(uid, claims);

    await db.collection("users").doc(uid).set(
      {
        uid,
        email: acc.email,
        role: acc.role,
        display_name: acc.name,
        dept: acc.dept ?? null,
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );
  }

  console.log("\nALL DEMO ACCOUNTS CREATED WITH PASSWORD: Demo1234!");
}

setup().catch(console.error);
