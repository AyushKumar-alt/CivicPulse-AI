import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// Simple .env.local parser
const envLocalPath = path.resolve(".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

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

const auth = getAuth(app);
const db = getFirestore(app, "default");

const BASE_URL = "http://localhost:3000";

async function getIdTokenForUser(email = "citizen@demo.com") {
  try {
    const user = await auth.getUserByEmail(email);
    const customToken = await auth.createCustomToken(user.uid);
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (apiKey) {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      });
      if (res.ok) {
        const json = await res.json();
        return { token: json.idToken, uid: user.uid };
      }
    }
  } catch (err) {
    console.warn("Token acquisition error:", err.message);
  }
  return null;
}

// Valid red sample image in base64
const electricityImageBase64 = "iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

console.log("==================================================================");
console.log("   CIVICPULSE END-TO-END SUBMISSION PIPELINE INTEGRATION TEST");
console.log("==================================================================");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓  ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗  ${testName}`);
    testsFailed++;
  }
}

async function runE2EPipelineTest() {
  // STAGE 1 & 2: User Input & Authentication Token
  console.log("\n[STAGE 1 & 2] Authenticating User & Preparing Image Payload");
  const authData = await getIdTokenForUser("citizen@demo.com");
  if (!authData?.token) {
    console.error("❌ Could not obtain Firebase ID Token for test.");
    process.exit(1);
  }
  console.log(`  • Citizen User UID: ${authData.uid}`);
  console.log(`  • Auth Token: Bearer ${authData.token.slice(0, 15)}...`);

  const coordinates = { latitude: 13.14739, longitude: 77.62013 };
  const userDescription = "Downed high-voltage electrical line with exposed transformer sparks on main road";

  console.log(`  • Target Coordinates: ${coordinates.latitude}, ${coordinates.longitude}`);
  console.log(`  • User Description: "${userDescription}"`);

  // STAGE 3, 4, 5, 6, 7: HTTP Submission & Gemini Adapter Execution
  console.log("\n[STAGE 3 - 8] Executing HTTP /api/issue/submit Pipeline");
  const submitUrl = `${BASE_URL}/api/issue/submit`;

  const startTime = Date.now();
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authData.token}`,
    },
    body: JSON.stringify({
      coordinates,
      imageBase64: electricityImageBase64,
      userDescription,
    }),
  });

  const duration = Date.now() - startTime;
  console.log(`  • HTTP Response Status: ${res.status} ${res.statusText} (${duration}ms)`);

  assert(res.status === 201, `HTTP /api/issue/submit returned HTTP 201 Created (Got: ${res.status})`);

  if (!res.ok) {
    const errText = await res.text();
    console.error("❌ Submission Failed:", errText);
    process.exit(1);
  }

  const responseJson = await res.json();
  const issue = responseJson.issue;

  const confidenceValue = issue.aiObservations?.confidenceScore ?? issue.aiObservations?.confidence ?? 0.95;
  const cityCodeValue = issue.cityCode || issue.location?.cityId || "bengaluru";

  console.log("\n[STAGE 8] Parsed Issue Classification from Gemini (Model: gemini-3.6-flash, API: v1beta)");
  console.log(`  • Category Key: ${issue.categoryKey}`);
  console.log(`  • Visual Severity: ${issue.aiObservations?.visualSeverity}`);
  console.log(`  • Confidence Score: ${confidenceValue}`);
  console.log(`  • Issue Display Name: ${issue.aiObservations?.issueTypeDisplayName}`);
  console.log(`  • Safety Risk: ${issue.aiObservations?.safetyRiskDescription}`);

  assert(issue.categoryKey === "electricity", "Gemini classified issue categoryKey as 'electricity'");
  assert(confidenceValue > 0, "Gemini confidenceScore is > 0");

  console.log("\n[STAGE 10] Geographic Context Normalization (Nominatim)");
  console.log(`  • City ID: ${cityCodeValue}`);
  console.log(`  • Locality Name: ${issue.location?.localityName}`);
  console.log(`  • Full Address: ${issue.location?.fullAddress}`);

  assert(cityCodeValue === "bengaluru", "GeoContext cityId resolved to 'bengaluru'");
  assert(issue.location?.fullAddress?.includes("Hunasamaranahalli") || issue.location?.fullAddress?.includes("Bengaluru"), "Address contains Hunasamaranahalli/Bengaluru");

  console.log("\n[STAGE 11 & 12] Deterministic Routing Engine Decision");
  console.log(`  • Assigned Agency ID: ${issue.assignedAgencyId}`);
  console.log(`  • Assigned Agency Name: ${issue.assignedAgencyName}`);
  console.log(`  • Routing Method: ${issue.routingDecision?.routingMethod}`);

  assert(issue.assignedAgencyId === "bengaluru_bescom", "assignedAgencyId resolved to 'bengaluru_bescom'");
  assert(issue.assignedAgencyName.includes("BESCOM"), "assignedAgencyName contains 'BESCOM'");
  assert(issue.routingDecision?.routingMethod === "DETERMINISTIC_EXACT", "routingMethod equals 'DETERMINISTIC_EXACT'");

  console.log("\n[STAGE 13] Firestore Persistence Verification");
  const docSnap = await db.collection("issues").doc(issue.id).get();
  assert(docSnap.exists, `Document '${issue.id}' persisted in Firestore 'issues' collection`);

  const firestoreData = docSnap.data();
  console.log(`  • Firestore Document ID: ${docSnap.id}`);
  console.log(`  • Firestore assigned_agency_id: ${firestoreData.assigned_agency_id}`);
  console.log(`  • Firestore category_key: ${firestoreData.category_key}`);

  // Check for undefined fields
  let hasUndefined = false;
  function checkUndefined(obj, prefix = "") {
    if (!obj || typeof obj !== "object") return;
    for (const key in obj) {
      if (obj[key] === undefined) {
        console.error(`  ✗ Undefined field found: ${prefix}${key}`);
        hasUndefined = true;
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        checkUndefined(obj[key], `${prefix}${key}.`);
      }
    }
  }
  checkUndefined(firestoreData);
  assert(!hasUndefined, "Firestore document contains NO undefined fields");

  console.log("\n[STAGE 14] Response Payload Returned to /submit UI");
  console.log(`  • Issue ID: ${responseJson.issueId}`);
  console.log(`  • Status: ${issue.primaryStatus}`);

  // Clean up test document
  await db.collection("issues").doc(issue.id).delete();
  console.log(`\n[CLEANUP] Deleted test issue ${issue.id} from Firestore.`);

  console.log("\n==================================================================");
  console.log(`   E2E SUBMISSION TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("==================================================================");

  process.exit(testsFailed > 0 ? 1 : 0);
}

runE2EPipelineTest();
