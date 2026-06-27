import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("./service-account.json", "utf8")
);

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore(app, "default");

console.log("Project:", serviceAccount.project_id);

await db.collection("test").doc("admin-test").set({
  hello: "world",
});

console.log("SUCCESS");