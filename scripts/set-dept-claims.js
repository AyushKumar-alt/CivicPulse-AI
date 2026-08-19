// One-time script: sets role + dept claims for all department accounts, and role=commandcenter for CC.
// Run: node scripts/set-dept-claims.js
// Requires FIREBASE_SERVICE_ACCOUNT_JSON in your environment, OR service-account.json in project root.

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  try {
    serviceAccount = require("../service-account.json");
  } catch {
    console.error("ERROR: No service account found.");
    console.error("Either set FIREBASE_SERVICE_ACCOUNT_JSON env var, or place service-account.json in the project root.");
    process.exit(1);
  }
}

initializeApp({ credential: cert(serviceAccount) });

// H3 Fix: each department account now gets role=authority AND dept=<key>
// The Firestore rule checks request.auth.token.dept == resource.data.assigned_department
// so departments can only update their own assigned issues.
const DEPARTMENT_ACCOUNTS = [
  { email: "roads@demo.com",       dept: "roads"       },
  { email: "water@demo.com",       dept: "water"       },
  { email: "cmwssb@demo.com",      dept: "water"       },
  { email: "electricity@demo.com", dept: "electricity" },
  { email: "sanitation@demo.com",  dept: "sanitation"  },
  { email: "traffic@demo.com",     dept: "traffic"     },
  { email: "publicworks@demo.com", dept: "publicworks" },
];

const COMMANDCENTER_ACCOUNTS = [
  "commandcenter@demo.com",
  "commandcentre@demo.com",
];

async function setDeptClaim(email, dept) {
  try {
    const user = await getAuth().getUserByEmail(email);
    await getAuth().setCustomUserClaims(user.uid, { role: "authority", dept });
    console.log(`✓  ${email} → role=authority, dept=${dept}`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log(`⚠  ${email} — not found in Firebase Auth (create it first)`);
    } else {
      console.error(`✗  ${email} — ${e.message}`);
    }
  }
}

async function setCCClaim(email) {
  try {
    const user = await getAuth().getUserByEmail(email);
    await getAuth().setCustomUserClaims(user.uid, { role: "commandcenter" });
    console.log(`✓  ${email} → role=commandcenter`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log(`⚠  ${email} — not found in Firebase Auth (create it first)`);
    } else {
      console.error(`✗  ${email} — ${e.message}`);
    }
  }
}

async function main() {
  console.log("Setting department claims (role=authority + dept=<key>)...");
  for (const { email, dept } of DEPARTMENT_ACCOUNTS) {
    await setDeptClaim(email, dept);
  }
  console.log("\nSetting command centre claims...");
  for (const email of COMMANDCENTER_ACCOUNTS) {
    await setCCClaim(email);
  }
  console.log("\nDone. Department users must sign out and back in for new claims to take effect.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
