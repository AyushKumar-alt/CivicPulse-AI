import fs from "fs";
import path from "path";

async function runQueryEfficiencyTest() {
  console.log("🧪 Executing Firestore Query Efficiency & Constraint Regression Test...");
  let assertionsPassed = 0;

  function assert(condition: boolean, msg: string) {
    assertionsPassed++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  const firestoreTsPath = path.join(process.cwd(), "lib", "firebase", "firestore.ts");
  const fileContent = fs.readFileSync(firestoreTsPath, "utf-8");

  // 1. REGRESSION TEST: Unconstrained collection reads MUST NOT exist in read paths
  const unconstrainedReadRegex = /getDocs\s*\(\s*collection\s*\(\s*db\s*,\s*["']issues["']\s*\)\s*\)/g;
  const matches = fileContent.match(unconstrainedReadRegex);
  assert(
    !matches || matches.length === 0,
    "REGRESSION PASSED: No unconstrained getDocs(collection(db, 'issues')) reads exist in lib/firebase/firestore.ts"
  );

  // 2. REGRESSION TEST: getMyIssues MUST use server-side query with where("reporter_uid", "==", uid)
  assert(
    fileContent.includes('where("reporter_uid", "==", uid)'),
    "REGRESSION PASSED: getMyIssues uses server-side where('reporter_uid', '==', uid) filter"
  );

  // 3. REGRESSION TEST: getCommunityIssues MUST use server-side query with limit(30)
  assert(
    fileContent.includes('limit(30)'),
    "REGRESSION PASSED: getCommunityIssues uses server-side limit(30)"
  );

  // 4. REGRESSION TEST: No DEMO_QUOTA_ISSUES fallback array exists
  assert(
    !fileContent.includes("DEMO_QUOTA_ISSUES"),
    "REGRESSION PASSED: DEMO_QUOTA_ISSUES fake data fallback is completely removed"
  );

  console.log(`🎉 FIRESTORE QUERY EFFICIENCY SUITE PASSED ALL ${assertionsPassed} ASSERTIONS!`);
}

runQueryEfficiencyTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
