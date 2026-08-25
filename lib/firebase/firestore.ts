import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./client";

export interface CreateIssueInput {
  reporterUid: string;
  rawDescription?: string;
  imageUrl: string;
  location: { lat: number; lng: number };
  contextHint?: string;
}

export async function createIssue(input: CreateIssueInput): Promise<string> {
  const issueRef = doc(collection(db, "issues"));
  const issueId = issueRef.id;

  await setDoc(issueRef, {
    reporter_uid: input.reporterUid,
    raw_description: input.rawDescription ?? "",
    image_url: input.imageUrl,
    context_hint: input.contextHint ?? null,
    submitted_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    location: {
      lat: input.location.lat,
      lng: input.location.lng,
      address: null,
      area_name: null,
      zone_type: null,
    },
    status: "processing",
    confirmation_count: 0,
    escalated: false,
    escalated_at: null,
    // Area intelligence — written at root for clean querying
    area_category: null,
    area_confidence: null,
    area_reasoning: null,
    affected_entity_type: null,
    // Department assignment — written by Routing Agent after AI analysis
    assigned_department: null,
    assigned_department_name: null,
    assigned_department_email: null,
    assigned_at: null,
    assigned_by: null,
    assignment_method: null,
    // Department operations — written by Phase 3 agents
    department_status: null,
    department_progress: [],
    action_plan: null,
    action_plan_generated_at: null,
    verification: null,
  });

  return issueId;
}

function getTimeMs(doc: any): number {
  const ts = doc.submitted_at || doc.createdAt || doc.updated_at || doc.submittedAt;
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") return new Date(ts).getTime();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

export async function getMyIssues(uid: string) {
  try {
    const q1 = query(collection(db, "issues"), where("reporter_uid", "==", uid));
    const q2 = query(collection(db, "issues"), where("reporterUid", "==", uid));
    const [snap1, snap2] = await Promise.all([
      getDocs(q1).catch(() => ({ docs: [] })),
      getDocs(q2).catch(() => ({ docs: [] })),
    ]);
    const map = new Map<string, any>();
    snap1.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
    snap2.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
    const userDocs = Array.from(map.values());
    userDocs.sort((a: any, b: any) => getTimeMs(b) - getTimeMs(a));
    return userDocs;
  } catch (err: any) {
    console.error("[getMyIssues Read Error]", err);
    throw err;
  }
}

export async function getCommunityIssues(): Promise<Record<string, unknown>[]> {
  try {
    const q = query(
      collection(db, "issues"),
      where("status", "==", "analyzed"),
      orderBy("submitted_at", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err: any) {
    console.error("[getCommunityIssues Read Error]", err);
    throw err;
  }
}

export async function hasUserConfirmed(issueId: string, uid: string): Promise<boolean> {
  const ref = doc(db, "issues", issueId, "confirmations", uid);
  const snap = await getDoc(ref);
  return snap.exists();
}
