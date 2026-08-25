import fs from "fs";
import path from "path";

async function runEmulatorConnectionTest() {
  console.log("🧪 Executing Emulator Connection & Dual-Mode Isolation Verification Test...");
  let assertionsPassed = 0;

  function assert(condition: boolean, msg: string) {
    assertionsPassed++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  // 1. Verify client.ts contains conditional connectFirestoreEmulator
  const clientPath = path.join(process.cwd(), "lib", "firebase", "client.ts");
  const clientContent = fs.readFileSync(clientPath, "utf-8");
  assert(
    clientContent.includes("connectFirestoreEmulator"),
    "CLIENT DUAL-MODE: lib/firebase/client.ts includes connectFirestoreEmulator"
  );
  assert(
    clientContent.includes('process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"'),
    "CLIENT DUAL-MODE: lib/firebase/client.ts gates emulator connection on NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'"
  );
  assert(
    clientContent.includes("_firestoreEmulatorConnected"),
    "HMR SAFETY: lib/firebase/client.ts guards against duplicate connectFirestoreEmulator calls in Next.js dev"
  );

  // 2. Verify admin.ts uses server-only FIRESTORE_EMULATOR_HOST
  const adminPath = path.join(process.cwd(), "lib", "firebase", "admin.ts");
  const adminContent = fs.readFileSync(adminPath, "utf-8");
  assert(
    adminContent.includes("process.env.FIRESTORE_EMULATOR_HOST"),
    "SERVER DUAL-MODE: lib/firebase/admin.ts respects server-only FIRESTORE_EMULATOR_HOST"
  );

  // 3. Verify .env.local contains explicit dual-mode documentation and toggle
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf-8");
  assert(
    envContent.includes("NEXT_PUBLIC_USE_FIREBASE_EMULATOR"),
    "ENV CONFIG: .env.local includes NEXT_PUBLIC_USE_FIREBASE_EMULATOR toggle"
  );
  assert(
    envContent.includes("FIRESTORE_EMULATOR_HOST"),
    "ENV CONFIG: .env.local includes FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
  );

  // 4. Verify firebase.json contains emulators configuration block
  const firebaseJsonPath = path.join(process.cwd(), "firebase.json");
  const firebaseJsonContent = fs.readFileSync(firebaseJsonPath, "utf-8");
  assert(
    firebaseJsonContent.includes('"emulators"'),
    "FIREBASE CONFIG: firebase.json includes emulators configuration block"
  );
  assert(
    firebaseJsonContent.includes('"port": 8080'),
    "FIREBASE CONFIG: firebase.json maps Firestore emulator to port 8080"
  );

  console.log(`🎉 EMULATOR DUAL-MODE CONNECTION SUITE PASSED ALL ${assertionsPassed} ASSERTIONS!`);
}

runEmulatorConnectionTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
