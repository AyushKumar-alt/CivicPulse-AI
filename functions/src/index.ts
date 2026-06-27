import { initializeApp, getApps } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { analyzeIssue } from "./analyzeIssue";

if (!getApps().length) {
  initializeApp();
}

const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const onIssueCreated = onDocumentCreated(
  {
    document: "issues/{issueId}",
    database: "(default)",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn("No document snapshot in event, skipping.");
      return;
    }

    const data = snap.data();

    // Guard: only analyze issues in processing state.
    // Prevents re-triggering on our own Firestore update.
    if (data.status !== "processing") {
      console.info(`Issue ${event.params.issueId} is "${data.status}", skipping.`);
      return;
    }

    await analyzeIssue(event.params.issueId, data, geminiApiKey.value());
  }
);
