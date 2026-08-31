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
    return [];
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
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (docs.length > 0) return docs;

    const fallbackQuery = query(collection(db, "issues"), limit(30));
    const fallbackSnap = await getDocs(fallbackQuery);
    const fbDocs = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (fbDocs.length > 0) return fbDocs;
  } catch (err: any) {
    console.error("[getCommunityIssues Read Error]", err);
  }

  // Demo Showcase Seed Dataset (Used when Firestore quota is exhausted or local emulator is empty)
  return [
    {
      id: "demo-issue-101",
      submitted_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
      status: "analyzed",
      raw_description: "Major water pipeline leak flooding the main road near Apollo Hospital entrance.",
      image_url: "https://images.unsplash.com/photo-1584467735815-f778f274e296?w=800&auto=format&fit=crop",
      confirmation_count: 5,
      escalated: true,
      escalated_at: new Date(Date.now() - 1800000).toISOString(),
      escalation_reason: "Critical severity near Healthcare Zone",
      area_category: "Healthcare Zone",
      assigned_department: "water",
      assigned_department_name: "Water Supply & Sewerage (CMWSSB)",
      assigned_department_email: "water@cmwssb.gov.in",
      location: {
        lat: 13.0604,
        lng: 80.2496,
        address: "Greams Lane, Thousand Lights, Chennai, Tamil Nadu",
        area_name: "Thousand Lights",
        zone_type: "healthcare",
      },
      ai: {
        issue_type: "Water Pipe Burst",
        severity: "critical",
        confidence: 0.96,
        summary: "Severe high-pressure water main burst causing standing water accumulation outside emergency entrance.",
        safety_risk: "High safety risk: Pedestrian slip hazard and emergency ambulance access obstruction.",
        responsible_authority: "Water Supply & Sewerage (CMWSSB)",
        priority_score: 9.2,
        priority_reasoning: "Critical severity located in a Healthcare Zone affecting hospital emergency operations.",
        repair_complexity: "high",
        repair_category: "utility_repair",
        estimated_work_hours: 12,
        required_equipment: ["Water Extraction Pump", "Excavator", "Replacement Pipe Joints"],
        required_skills: ["Plumbing Specialist", "Civil Heavy Operator"],
        verification_checkpoints: ["Water main flow restored", "Road surface dewatered"],
      },
    },
    {
      id: "demo-issue-102",
      submitted_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      status: "analyzed",
      raw_description: "Large deep pothole on fast lane causing vehicle tire damage.",
      image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop",
      confirmation_count: 3,
      escalated: false,
      area_category: "IT & Research District",
      assigned_department: "roads",
      assigned_department_name: "Roads & Highways Division",
      assigned_department_email: "roads@chennaicorporation.gov.in",
      location: {
        lat: 12.9863,
        lng: 80.2432,
        address: "OMR IT Expressway, Taramani, Chennai, Tamil Nadu",
        area_name: "Taramani",
        zone_type: "commercial",
      },
      ai: {
        issue_type: "Road Pothole",
        severity: "high",
        confidence: 0.94,
        summary: "Deep asphalt surface depression measuring 1.2m wide along peak commuter corridor.",
        safety_risk: "Moderate to high safety risk for two-wheelers and night traffic.",
        responsible_authority: "Roads & Highways Division",
        priority_score: 7.8,
        priority_reasoning: "High traffic density along major IT corridor requires rapid patching.",
        repair_complexity: "medium",
        repair_category: "patching",
        estimated_work_hours: 6,
        required_equipment: ["Asphalt Roller", "Cold Bitumen Patch", "Safety Cones"],
        required_skills: ["Road Maintenance Crew"],
        verification_checkpoints: ["Surface flush with road level", "Compaction test passed"],
      },
    },
  ];
}

export async function hasUserConfirmed(issueId: string, uid: string): Promise<boolean> {
  try {
    const ref = doc(db, "issues", issueId, "confirmations", uid);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch {
    return false;
  }
}
