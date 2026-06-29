"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/hooks/useRequireAuth";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { logout } from "@/lib/firebase/auth";
import {
  getDepartmentByKey,
  DEPT_STAGE_LABEL,
  STAGE_TRANSITIONS,
} from "@/lib/departments";
import type { DepartmentInfo } from "@/lib/departments";
import {
  collection, getDocs, doc, updateDoc, query,
  where, orderBy, limit, arrayUnion, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { callGenerateActionPlan } from "@/lib/ai/generateActionPlanClient";
import { callGenerateWorkflowAdvice } from "@/lib/ai/generateWorkflowAdviceClient";
import { generateVerificationClient } from "@/lib/ai/generateVerificationClient";
import type { IssueIntelligenceReport } from "@/lib/ai/types";

const IssueMap = dynamic(() => import("@/components/IssueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 bg-gray-100 rounded-xl flex items-center justify-center">
      <p className="text-xs text-gray-400">Loading map…</p>
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowRec {
  recommendation: string;
  reason: string;
  expected_delay: string;
  possible_risks: string;
  next_action: string;
}

interface ProgressEntry {
  stage: string;
  timestamp: { seconds: number; nanoseconds: number } | number | null;
  notes: string | null;
  updated_by: string;
  workflow_recommendation: WorkflowRec | null;
}

interface ActionPlan {
  crew_required: string;
  estimated_workers: number;
  equipment: string[];
  estimated_duration: string;
  traffic_management: string;
  safety_protocols: string[];
  repair_steps: string[];
  materials: string[];
  expected_completion: string;
  reasoning: string;
}

interface Verification {
  confidence: number;
  recommendation: "approve" | "needs_inspection" | "needs_rework";
  was_issue_addressed: boolean;
  reasoning: string;
  concerns: string[];
  remaining_issues: string | null;
  repair_type: string;
  repair_notes: string;
  after_image_url: string | null;
}

interface IssueRecord {
  id: string;
  raw_description: string;
  image_url: string;
  submitted_at: number | null;
  location: { lat: number; lng: number; address?: string | null } | null;
  status: string;
  confirmation_count: number;
  escalated: boolean;
  escalation_reason: string | null;
  area_category: string | null;
  area_confidence: number | null;
  citizen_concern_level: string | null;
  community_summary: string | null;
  comment_count: number;
  assigned_department: string | null;
  assigned_department_name: string | null;
  assigned_at: number | null;
  department_status: string | null;
  department_progress: ProgressEntry[];
  action_plan: ActionPlan | null;
  action_plan_generated_at: number | null;
  verification: Verification | null;
  duplicate_candidate: boolean;
  ai: {
    issue_type: string;
    severity: string;
    confidence: number;
    summary: string;
    responsible_authority: string;
    safety_risk?: string;
    priority_score?: number;
    estimated_population_impact?: string;
    affected_groups?: string[];
    functional_importance?: string;
    likely_daily_activity?: string;
    community_signals?: string[];
    recurring_problem?: boolean;
    escalation_recommendation?: boolean;
  } | null;
}

interface CommentRecord {
  id: string;
  user_uid: string;
  text: string;
  created_at: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-green-100 text-green-800",
};

const CONCERN_STYLE: Record<string, { bg: string; label: string }> = {
  high: { bg: "bg-red-100 text-red-800 border-red-200", label: "HIGH" },
  medium: { bg: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "MEDIUM" },
  low: { bg: "bg-green-100 text-green-800 border-green-200", label: "LOW" },
};

const DEPT_STATUS_COLOR: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-800",
  accepted: "bg-teal-100 text-teal-800",
  crew_assigned: "bg-purple-100 text-purple-800",
  repair_started: "bg-orange-100 text-orange-800",
  repair_completed: "bg-amber-100 text-amber-800",
  ready_for_verification: "bg-sky-100 text-sky-800",
  needs_rework: "bg-red-100 text-red-800",
  command_center_approved: "bg-green-100 text-green-800",
};

const AREA_ICON: Record<string, string> = {
  "Healthcare Zone": "🏥",
  "Educational Campus": "🎓",
  "IT & Research District": "💻",
  "Transport Hub": "🚉",
  "Residential Area": "🏠",
  "Commercial Area": "🏪",
  "Industrial Estate": "🏭",
  "Government Zone": "🏛️",
  "Mixed Use Area": "🏙️",
};

const STAGE_ORDER = [
  "assigned",
  "accepted",
  "crew_assigned",
  "repair_started",
  "repair_completed",
  "ready_for_verification",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToMs(ts: ProgressEntry["timestamp"]): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if ("seconds" in ts) return ts.seconds * 1000;
  return 0;
}

function formatTs(ts: ProgressEntry["timestamp"]): string {
  const ms = tsToMs(ts);
  return ms ? new Date(ms).toLocaleString() : "—";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-black ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function IssueListCard({
  issue,
  dept,
  onOpen,
}: {
  issue: IssueRecord;
  dept: DepartmentInfo;
  onOpen: () => void;
}) {
  const deptStatus = issue.department_status ?? "assigned";
  const deptStatusLabel = DEPT_STAGE_LABEL[deptStatus] ?? deptStatus;
  const statusColor = DEPT_STATUS_COLOR[deptStatus] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
      <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
        {issue.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl text-gray-300">📷</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-semibold text-sm text-gray-900 truncate">
              {issue.ai?.issue_type ?? "Unanalyzed"}
            </span>
            {issue.ai?.severity && (
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-bold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                {issue.ai.severity}
              </span>
            )}
            {issue.escalated && (
              <span className="shrink-0 text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">⚡</span>
            )}
            {issue.action_plan && (
              <span className="shrink-0 text-xs bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded font-medium">
                📋 Plan
              </span>
            )}
            {issue.citizen_concern_level && (
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-bold border ${CONCERN_STYLE[issue.citizen_concern_level]?.bg ?? ""}`}>
                {CONCERN_STYLE[issue.citizen_concern_level]?.label} Concern
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpen}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white ${dept.activeBgClass} hover:opacity-90 transition-opacity`}
          >
            Open
          </button>
        </div>

        <p className="text-xs text-gray-500 truncate mb-1">
          📍 {issue.location?.address ?? (issue.location ? `${issue.location.lat.toFixed(4)}, ${issue.location.lng.toFixed(4)}` : "Unknown")}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor}`}>
            {deptStatusLabel}
          </span>
          {issue.area_category && (
            <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-medium">
              {AREA_ICON[issue.area_category] ?? "📍"} {issue.area_category}
            </span>
          )}
          {issue.ai?.priority_score != null && (
            <span className="text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded font-bold">
              {issue.ai.priority_score.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stage Stepper ─────────────────────────────────────────────────────────────

function StageStepper({ currentStage }: { currentStage: string }) {
  const completedIdx = STAGE_ORDER.indexOf(currentStage);
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STAGE_ORDER.map((stage, i) => {
        const isDone = i < completedIdx;
        const isActive = i === completedIdx;
        return (
          <div key={stage} className="flex items-center gap-1 shrink-0">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-gray-100 text-gray-400"}`}
            >
              {isDone ? "✓" : i + 1}
            </div>
            <span className={`text-xs whitespace-nowrap ${isDone ? "text-green-700" : isActive ? "text-blue-700 font-semibold" : "text-gray-400"}`}>
              {DEPT_STAGE_LABEL[stage] ?? stage}
            </span>
            {i < STAGE_ORDER.length - 1 && (
              <div className={`w-4 h-0.5 shrink-0 ${isDone ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────

function IssueDetailModal({
  issue,
  dept,
  user,
  onClose,
  onIssueUpdated,
}: {
  issue: IssueRecord;
  dept: DepartmentInfo;
  user: { getIdToken: () => Promise<string> };
  onClose: () => void;
  onIssueUpdated: (updated: Partial<IssueRecord>) => void;
}) {
  const [activeSection, setActiveSection] = useState<
    "overview" | "actionplan" | "workflow" | "verify" | "comments"
  >("overview");

  // Action Plan
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  // Workflow
  const [stageLoading, setStageLoading] = useState(false);
  const [stageError, setStageError] = useState("");
  const [stageNotes, setStageNotes] = useState("");
  const [lastAdvice, setLastAdvice] = useState<WorkflowRec | null>(null);

  // Verify form
  const [repairType, setRepairType] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [afterImageUrl, setAfterImageUrl] = useState<string | null>(null);
  const [afterImageUploading, setAfterImageUploading] = useState(false);
  const afterCameraRef = useRef<HTMLInputElement>(null);
  const afterGalleryRef = useRef<HTMLInputElement>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Comments
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const commentsLoadedRef = useRef(false);

  const deptStatus = issue.department_status ?? "assigned";
  const nextStage = STAGE_TRANSITIONS[deptStatus];
  const canRepair = deptStatus === "repair_started" || deptStatus === "needs_rework";

  async function fetchComments() {
    if (commentsLoadedRef.current) return;
    commentsLoadedRef.current = true;
    try {
      const q = query(
        collection(db, "issues", issue.id, "comments"),
        orderBy("created_at", "asc"),
        limit(50),
      );
      const snap = await getDocs(q);
      setComments(snap.docs.map((d) => {
        const data = d.data();
        const ts = data.created_at;
        return {
          id: d.id,
          user_uid: data.user_uid as string,
          text: data.text as string,
          created_at: ts && typeof ts === "object" && "toMillis" in ts
            ? (ts as { toMillis: () => number }).toMillis()
            : null,
        } as CommentRecord;
      }));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeSection === "comments") fetchComments();
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setPlanError("");
    try {
      const iir = issue.ai as unknown as IssueIntelligenceReport;
      const plan = await callGenerateActionPlan({
        iir,
        departmentName: dept.name,
        address: issue.location?.address ?? null,
      });
      // Update UI immediately, persist best-effort
      onIssueUpdated({ action_plan: plan as ActionPlan });
      updateDoc(doc(db, "issues", issue.id), {
        action_plan: plan,
        action_plan_generated_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      }).catch((e) => console.warn("[ActionPlan] Firestore write failed:", e));
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Failed to generate plan. Try again.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleStageAdvance() {
    if (!nextStage) return;
    setStageLoading(true);
    setStageError("");
    try {
      const iir = issue.ai as unknown as IssueIntelligenceReport;
      const previousStages = (issue.department_progress ?? []).map((p) => p.stage);

      // Generate AI workflow advice for this specific stage transition
      const advice = await callGenerateWorkflowAdvice({
        iir,
        departmentName: dept.name,
        address: issue.location?.address ?? null,
        fromStage: deptStatus,
        toStage: nextStage,
        actionPlan: issue.action_plan
          ? {
              crew_required: issue.action_plan.crew_required,
              estimated_workers: issue.action_plan.estimated_workers,
              estimated_duration: issue.action_plan.estimated_duration,
              repair_steps: issue.action_plan.repair_steps,
              traffic_management: issue.action_plan.traffic_management,
              safety_protocols: issue.action_plan.safety_protocols,
              expected_completion: issue.action_plan.expected_completion,
            }
          : null,
        previousStages,
        notes: stageNotes.trim() || null,
      });

      const now = Timestamp.now();
      const progressEntry = {
        stage: nextStage,
        timestamp: now,
        notes: stageNotes.trim() || null,
        updated_by: dept.email,
        workflow_recommendation: advice,
      };
      const mainStatusUpdate = nextStage === "accepted" ? { status: "in_progress" } : {};
      await updateDoc(doc(db, "issues", issue.id), {
        department_status: nextStage,
        department_progress: arrayUnion(progressEntry),
        updated_at: now,
        ...mainStatusUpdate,
      });
      setLastAdvice(advice);
      setStageNotes("");
      onIssueUpdated({ department_status: nextStage });
    } catch (e) {
      setStageError(e instanceof Error ? e.message : "Failed to update stage.");
    } finally {
      setStageLoading(false);
    }
  }

  async function handleAfterImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAfterImageUploading(true);
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", preset ?? "");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const data = (await res.json()) as { secure_url: string };
        setAfterImageUrl(data.secure_url);
      }
    } catch { /* ignore */ } finally {
      setAfterImageUploading(false);
    }
  }

  async function handleSubmitVerify() {
    if (!repairType.trim()) { setVerifyError("Select or describe the repair type."); return; }
    if (repairNotes.trim().length < 20) { setVerifyError("Repair notes must be at least 20 characters — describe exactly what was done."); return; }
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const iir = issue.ai as unknown as IssueIntelligenceReport;
      const actionPlanSummary = issue.action_plan
        ? {
            crew_required: issue.action_plan.crew_required,
            estimated_workers: issue.action_plan.estimated_workers,
            estimated_duration: issue.action_plan.estimated_duration,
            repair_steps: issue.action_plan.repair_steps,
            traffic_management: issue.action_plan.traffic_management,
            safety_protocols: issue.action_plan.safety_protocols,
            expected_completion: issue.action_plan.expected_completion,
          }
        : null;

      // Run AI verification against IIR checkpoints
      const result = await generateVerificationClient({
        iir,
        actionPlan: actionPlanSummary,
        departmentName: dept.name,
        repairType: repairType.trim(),
        repairNotes: repairNotes.trim(),
        beforeImageUrl: issue.image_url ?? null,
        afterImageUrl: afterImageUrl ?? null,
      });

      const now = Timestamp.now();
      const verificationDoc: Verification = {
        repair_type: repairType.trim(),
        repair_notes: repairNotes.trim(),
        after_image_url: afterImageUrl ?? null,
        ...result,
      };

      const repairEntry = {
        stage: "repair_completed",
        timestamp: now,
        notes: `${repairType.trim()} — ${repairNotes.trim()}`,
        updated_by: dept.email,
        workflow_recommendation: null,
      };
      const verifyEntry = {
        stage: "ready_for_verification",
        timestamp: now,
        notes: `AI Verification: ${result.recommendation} (${result.confidence}% confidence)`,
        updated_by: dept.email,
        workflow_recommendation: null,
      };

      await updateDoc(doc(db, "issues", issue.id), {
        department_status: "ready_for_verification",
        status: "pending_verification",
        verification: verificationDoc,
        department_progress: arrayUnion(repairEntry, verifyEntry),
        updated_at: now,
      });
      onIssueUpdated({
        verification: verificationDoc,
        department_status: "ready_for_verification",
        status: "pending_verification",
      });
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setVerifyLoading(false);
    }
  }

  const plan = issue.action_plan;
  const progress = issue.department_progress ?? [];
  const verification = issue.verification;

  const tabs: { key: typeof activeSection; label: string; badge?: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "actionplan", label: "Action Plan", badge: plan ? "✓" : undefined },
    { key: "workflow", label: "Workflow", badge: progress.length > 0 ? String(progress.length) : undefined },
    ...(canRepair ? [{ key: "verify" as typeof activeSection, label: "Submit Repair" }] : []),
    { key: "comments", label: `Comments${issue.comment_count ? ` (${issue.comment_count})` : ""}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl flex flex-col"
        style={{ maxHeight: "92vh" }}
      >
        {/* Modal header */}
        <div className={`sticky top-0 z-10 rounded-t-2xl sm:rounded-t-2xl border-b ${dept.bgClass} ${dept.borderClass} px-5 py-3 flex items-center justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-bold ${dept.textClass} truncate`}>
                {issue.ai?.issue_type ?? "Issue"}
              </span>
              {issue.ai?.severity && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                  {issue.ai.severity}
                </span>
              )}
              {deptStatus && (
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${DEPT_STATUS_COLOR[deptStatus] ?? "bg-gray-100 text-gray-600"}`}>
                  {DEPT_STAGE_LABEL[deptStatus] ?? deptStatus}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 ml-3 text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="border-b border-gray-100 px-5 flex gap-1 overflow-x-auto no-scrollbar py-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${activeSection === tab.key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              {tab.label}
              {tab.badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === tab.key ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* OVERVIEW TAB */}
          {activeSection === "overview" && (
            <>
              {issue.image_url && (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={issue.image_url} alt="" className="w-full h-48 object-cover" />
                </div>
              )}

              {/* Stage stepper */}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Progress</p>
                <StageStepper currentStage={deptStatus} />
              </div>

              {/* Issue Intelligence Report */}
              {issue.ai && (
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Issue Intelligence Report</p>
                  <p className="text-sm text-gray-700 leading-relaxed mb-3">{issue.ai.summary}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {issue.ai.safety_risk && (
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="font-semibold text-gray-400 mb-0.5">Safety Risk</p>
                        <p className="text-gray-700">{issue.ai.safety_risk}</p>
                      </div>
                    )}
                    {issue.ai.responsible_authority && (
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="font-semibold text-gray-400 mb-0.5">Authority</p>
                        <p className="text-gray-700">{issue.ai.responsible_authority}</p>
                      </div>
                    )}
                    {issue.ai.estimated_population_impact && (
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="font-semibold text-gray-400 mb-0.5">Population Impact</p>
                        <p className="text-gray-700">{issue.ai.estimated_population_impact}</p>
                      </div>
                    )}
                    {issue.ai.priority_score != null && (
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="font-semibold text-gray-400 mb-0.5">Priority Score</p>
                        <p className="text-2xl font-black text-gray-900">
                          {issue.ai.priority_score.toFixed(1)}<span className="text-xs font-normal text-gray-400">/10</span>
                        </p>
                      </div>
                    )}
                  </div>
                  {issue.ai.affected_groups && issue.ai.affected_groups.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-gray-400 mb-1">Affected Groups</p>
                      <div className="flex flex-wrap gap-1">
                        {issue.ai.affected_groups.map((g) => (
                          <span key={g} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Area Intelligence */}
              {issue.area_category && (
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Area Intelligence</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{AREA_ICON[issue.area_category] ?? "📍"}</span>
                    <span className="text-sm font-bold text-gray-900">{issue.area_category}</span>
                    {issue.area_confidence != null && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {Math.round(issue.area_confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  {issue.ai?.functional_importance && (
                    <p className="text-sm text-gray-600 mb-1"><span className="font-medium">Function:</span> {issue.ai.functional_importance}</p>
                  )}
                  {issue.ai?.likely_daily_activity && (
                    <p className="text-sm text-gray-600"><span className="font-medium">Activity:</span> {issue.ai.likely_daily_activity}</p>
                  )}
                </div>
              )}

              {/* Community Intelligence */}
              {issue.ai?.community_signals && issue.ai.community_signals.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Community Intelligence</p>
                    {issue.citizen_concern_level && (
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${CONCERN_STYLE[issue.citizen_concern_level]?.bg ?? ""}`}>
                        {CONCERN_STYLE[issue.citizen_concern_level]?.label} Concern
                      </span>
                    )}
                  </div>
                  {issue.community_summary && (
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">{issue.community_summary}</p>
                  )}
                  <ul className="space-y-1">
                    {issue.ai.community_signals.slice(0, 3).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="text-blue-400 mt-0.5">•</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Map */}
              {issue.location && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Location</p>
                  {issue.location.address && (
                    <p className="text-sm text-gray-800 font-medium mb-1">{issue.location.address}</p>
                  )}
                  <IssueMap
                    lat={issue.location.lat}
                    lng={issue.location.lng}
                    issueType={issue.ai?.issue_type}
                    address={issue.location.address}
                    severity={issue.ai?.severity}
                    height="180px"
                  />
                </div>
              )}
            </>
          )}

          {/* ACTION PLAN TAB */}
          {activeSection === "actionplan" && (
            <>
              {!plan ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-4">📋</div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">No Action Plan Generated</p>
                  <p className="text-xs text-gray-500 mb-6">
                    The Action Planner AI will generate a step-by-step operational plan for this issue.
                  </p>
                  {planError && (
                    <p className="text-xs text-red-600 mb-4">{planError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleGeneratePlan}
                    disabled={planLoading}
                    className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${dept.activeBgClass}`}
                  >
                    {planLoading ? "Generating Plan…" : "Generate Action Plan"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Header */}
                  <div className={`rounded-xl p-4 ${dept.bgClass} ${dept.borderClass} border`}>
                    <p className={`text-xs font-bold uppercase tracking-widest ${dept.textClass} mb-2`}>
                      AI Action Plan
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Crew Required</p>
                        <p className="font-semibold text-gray-900">{plan.crew_required}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Workers Needed</p>
                        <p className="font-semibold text-gray-900">{plan.estimated_workers}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Est. Duration</p>
                        <p className="font-semibold text-gray-900">{plan.estimated_duration}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Expected Completion</p>
                        <p className="font-semibold text-gray-900">{plan.expected_completion}</p>
                      </div>
                    </div>
                  </div>

                  {/* Repair Steps */}
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Repair Steps</p>
                    <ol className="space-y-2">
                      {plan.repair_steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${dept.activeBgClass}`}>
                            {i + 1}
                          </span>
                          <span className="text-gray-700 leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Traffic Management */}
                  {plan.traffic_management && (
                    <PlanSection label="Traffic Management" icon="🚦" items={[plan.traffic_management]} />
                  )}

                  {/* Equipment */}
                  {plan.equipment.length > 0 && (
                    <PlanSection label="Equipment" icon="🔧" items={plan.equipment} />
                  )}

                  {/* Materials */}
                  {plan.materials.length > 0 && (
                    <PlanSection label="Materials" icon="📦" items={plan.materials} />
                  )}

                  {/* Safety */}
                  {plan.safety_protocols.length > 0 && (
                    <PlanSection label="Safety Protocols" icon="⛑️" items={plan.safety_protocols} />
                  )}

                  {/* Reasoning */}
                  {plan.reasoning && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Planner Reasoning</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{plan.reasoning}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* WORKFLOW TAB */}
          {activeSection === "workflow" && (
            <>
              {/* Stage stepper */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Current Stage</p>
                <StageStepper currentStage={deptStatus} />
              </div>

              {/* Advance stage section */}
              {nextStage && deptStatus !== "ready_for_verification" && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Advance to: <span className="text-gray-700">{DEPT_STAGE_LABEL[nextStage]}</span>
                  </p>
                  <textarea
                    value={stageNotes}
                    onChange={(e) => setStageNotes(e.target.value.slice(0, 500))}
                    placeholder="Optional field notes (what was done, any observations)..."
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  {stageError && <p className="text-xs text-red-600 mb-2">{stageError}</p>}
                  <button
                    type="button"
                    onClick={handleStageAdvance}
                    disabled={stageLoading}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${dept.activeBgClass}`}
                  >
                    {stageLoading ? "Generating AI Advice…" : `Mark as ${DEPT_STAGE_LABEL[nextStage]}`}
                  </button>
                </div>
              )}

              {/* If repair_started → show button to go to verify tab */}
              {canRepair && (
                <div className="bg-white border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Repair Complete?</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Submit your repair report and the AI Verification Agent will evaluate the completion.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection("verify")}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Submit Repair Report →
                  </button>
                </div>
              )}

              {/* Workflow Advisor latest recommendation */}
              {(lastAdvice ?? progress[progress.length - 1]?.workflow_recommendation) && (
                <WorkflowAdvisorCard
                  advice={(lastAdvice ?? progress[progress.length - 1]?.workflow_recommendation)!}
                  stage={deptStatus}
                />
              )}

              {/* Progress history */}
              {progress.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Progress History</p>
                  <div className="space-y-2">
                    {[...progress].reverse().map((entry, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${DEPT_STATUS_COLOR[entry.stage] ?? "bg-gray-100 text-gray-600"}`}>
                            {DEPT_STAGE_LABEL[entry.stage] ?? entry.stage}
                          </span>
                          <span className="text-xs text-gray-400">{formatTs(entry.timestamp)}</span>
                        </div>
                        {entry.notes && <p className="text-xs text-gray-600 mt-1">{entry.notes}</p>}
                        {entry.workflow_recommendation && (
                          <div className="mt-2 bg-white rounded-lg p-2 border border-gray-100">
                            <p className="text-xs font-semibold text-blue-600 mb-0.5">AI Advice</p>
                            <p className="text-xs text-gray-700">{entry.workflow_recommendation.recommendation}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification result if done */}
              {verification && (
                <VerificationResultCard verification={verification} />
              )}
            </>
          )}

          {/* SUBMIT REPAIR TAB */}
          {activeSection === "verify" && (
            <>
              {verification && deptStatus === "ready_for_verification" ? (
                <VerificationResultCard verification={verification} />
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-blue-900 mb-1">Submit Repair Report</p>
                    <p className="text-xs text-blue-700 mb-2">
                      The AI Verification Agent will evaluate your repair against the IIR checkpoints. Vague notes or missing after-photo will result in a low confidence score and rejection.
                    </p>
                    {/* Show checkpoints from IIR so dept knows what to address */}
                    {(issue.ai as unknown as IssueIntelligenceReport)?.verification_checkpoints?.length ? (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-blue-900 mb-1">Your notes must address each checkpoint:</p>
                        <ul className="space-y-0.5">
                          {(issue.ai as unknown as IssueIntelligenceReport).verification_checkpoints!.map((cp, i) => (
                            <li key={i} className="text-xs text-blue-800 flex items-start gap-1">
                              <span className="text-blue-400 mt-0.5 shrink-0">✦</span>{cp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      Repair Type *
                    </label>
                    <select
                      value={repairType}
                      onChange={(e) => setRepairType(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select repair type…</option>
                      <option>Road Resurfacing</option>
                      <option>Pothole Patching</option>
                      <option>Pipe Repair</option>
                      <option>Pipe Replacement</option>
                      <option>Drain Clearing</option>
                      <option>Electrical Repair</option>
                      <option>Street Light Replacement</option>
                      <option>Garbage Clearance</option>
                      <option>Deep Cleaning</option>
                      <option>Signal Repair</option>
                      <option>Structural Repair</option>
                      <option>Emergency Fix</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      Repair Notes * <span className="font-normal text-gray-400 lowercase">(describe what was done)</span>
                    </label>
                    <textarea
                      value={repairNotes}
                      onChange={(e) => setRepairNotes(e.target.value.slice(0, 1000))}
                      placeholder="Describe the repair work performed, materials used, and current condition..."
                      rows={4}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      After Photo <span className="font-normal text-gray-400 lowercase">(optional — helps AI verify)</span>
                    </label>
                    {afterImageUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-gray-200 h-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={afterImageUrl} alt="After repair" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAfterImageUrl(null)}
                          className="absolute top-2 right-2 bg-white/90 rounded-full w-6 h-6 flex items-center justify-center text-xs text-gray-600 hover:text-gray-900"
                        >
                          ✕
                        </button>
                      </div>
                    ) : afterImageUploading ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                        <p className="text-xs text-gray-500">Uploading…</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => afterCameraRef.current?.click()}
                          className="border-2 border-dashed border-blue-200 rounded-xl py-5 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          <p className="text-2xl mb-1">📸</p>
                          <p className="text-xs font-semibold text-blue-700">Camera</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => afterGalleryRef.current?.click()}
                          className="border-2 border-dashed border-gray-200 rounded-xl py-5 text-center hover:border-gray-400 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-2xl mb-1">🖼️</p>
                          <p className="text-xs font-semibold text-gray-600">Gallery</p>
                        </button>
                        {/* No capture attribute — avoids iOS Safari page-reload bug */}
                        <input ref={afterCameraRef} type="file" accept="image/*" className="sr-only" onChange={handleAfterImageUpload} />
                        <input ref={afterGalleryRef} type="file" accept="image/*" className="sr-only" onChange={handleAfterImageUpload} />
                      </div>
                    )}
                  </div>

                  {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}

                  <button
                    type="button"
                    onClick={handleSubmitVerify}
                    disabled={verifyLoading || !repairType || !repairNotes.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {verifyLoading ? "Running AI Verification…" : "Submit for Verification"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* COMMENTS TAB */}
          {activeSection === "comments" && (
            <>
              {comments.length === 0 ? (
                <p className="text-center py-8 text-sm text-gray-400">No citizen comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-800">{c.text}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanSection({ label, icon, items }: { label: string; icon: string; items: string[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
        <span className="mr-1">{icon}</span>{label}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-gray-300 mt-0.5">–</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkflowAdvisorCard({ advice, stage }: { advice: WorkflowRec; stage: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-blue-200 bg-blue-50">
      <div className="px-4 py-2.5 bg-blue-600 flex items-center gap-2">
        <span className="text-white text-sm">🤖</span>
        <span className="text-xs font-bold text-white uppercase tracking-widest">
          Workflow Advisor — {DEPT_STAGE_LABEL[stage] ?? stage}
        </span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-900">{advice.recommendation}</p>
        <p className="text-xs text-blue-700"><span className="font-semibold">Why:</span> {advice.reason}</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-white rounded-lg p-2">
            <p className="text-xs text-gray-400 font-medium mb-0.5">Est. Delay</p>
            <p className="text-xs font-semibold text-gray-800">{advice.expected_delay}</p>
          </div>
          <div className="bg-white rounded-lg p-2">
            <p className="text-xs text-gray-400 font-medium mb-0.5">Risks</p>
            <p className="text-xs font-semibold text-gray-800">{advice.possible_risks}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-2">
          <p className="text-xs text-gray-400 font-medium mb-0.5">Next Action</p>
          <p className="text-xs font-semibold text-gray-800">{advice.next_action}</p>
        </div>
      </div>
    </div>
  );
}

function VerificationResultCard({ verification }: { verification: Verification }) {
  const recColor: Record<string, string> = {
    approve: "bg-green-100 text-green-800 border-green-200",
    needs_inspection: "bg-yellow-100 text-yellow-800 border-yellow-200",
    needs_rework: "bg-red-100 text-red-800 border-red-200",
  };
  const recLabel: Record<string, string> = {
    approve: "✓ Recommend Approval",
    needs_inspection: "⚠ Needs Inspection",
    needs_rework: "✗ Needs Rework",
  };
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-400">🔍</span>
          <span className="text-xs font-bold text-white uppercase tracking-widest">AI Verification Report</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${recColor[verification.recommendation] ?? ""}`}>
          {verification.confidence}% confidence
        </span>
      </div>
      <div className="p-4 space-y-3">
        <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full border ${recColor[verification.recommendation] ?? ""}`}>
          {recLabel[verification.recommendation] ?? verification.recommendation}
        </span>
        <p className="text-sm text-gray-700 leading-relaxed">{verification.reasoning}</p>
        {verification.concerns.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Concerns</p>
            <ul className="space-y-0.5">
              {verification.concerns.map((c, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-yellow-500 mt-0.5">•</span>{c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {verification.after_image_url && (
          <div className="rounded-lg overflow-hidden border border-gray-200 h-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={verification.after_image_url} alt="After repair" className="w-full h-full object-cover" />
          </div>
        )}
        <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
          Awaiting Command Center approval
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DepartmentPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const roleInfo = useUserRole(user);
  const router = useRouter();

  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<IssueRecord | null>(null);

  const dept = roleInfo.department ? getDepartmentByKey(roleInfo.department) : null;

  // Role guard — only department accounts may access this page
  useEffect(() => {
    if (authLoading || !user) return;
    if (roleInfo.role === "commandcenter") {
      router.replace("/authority");
    } else if (roleInfo.role === "citizen") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, roleInfo, router]);

  const fetchIssues = useCallback(async () => {
    if (!user || !dept) return;
    setLoading(true);
    setError("");
    try {
      const q = query(
        collection(db, "issues"),
        where("assigned_department", "==", dept.key),
      );
      const snap = await getDocs(q);
      function tsToMs(ts: unknown): number | null {
        if (ts && typeof ts === "object" && "toMillis" in ts) return (ts as { toMillis: () => number }).toMillis();
        return null;
      }
      const issues = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            raw_description: (data.raw_description as string) ?? "",
            image_url: data.image_url as string,
            submitted_at: tsToMs(data.submitted_at),
            updated_at: tsToMs(data.updated_at),
            location: (data.location as Record<string, unknown>) ?? null,
            status: data.status as string,
            confirmation_count: (data.confirmation_count as number) ?? 0,
            escalated: (data.escalated as boolean) ?? false,
            escalation_reason: (data.escalation_reason as string) ?? null,
            area_category: (data.area_category as string) ?? null,
            area_confidence: (data.area_confidence as number) ?? null,
            citizen_concern_level: (data.citizen_concern_level as string) ?? null,
            community_summary: (data.community_summary as string) ?? null,
            comment_count: (data.comment_count as number) ?? 0,
            assigned_department: (data.assigned_department as string) ?? null,
            assigned_department_name: (data.assigned_department_name as string) ?? null,
            assigned_at: tsToMs(data.assigned_at),
            assignment_method: (data.assignment_method as string) ?? null,
            department_status: (data.department_status as string) ?? null,
            department_progress: (data.department_progress as unknown[]) ?? [],
            action_plan: data.action_plan ?? null,
            action_plan_generated_at: tsToMs(data.action_plan_generated_at),
            verification: data.verification ?? null,
            duplicate_candidate: (data.duplicate_candidate as boolean) ?? false,
            ai: data.ai
              ? { ...(data.ai as Record<string, unknown>), generated_at: tsToMs((data.ai as Record<string, unknown>).generated_at) }
              : null,
          } as unknown as IssueRecord;
        })
        .sort((a, b) => ((b.submitted_at ?? 0) as number) - ((a.submitted_at ?? 0) as number));
      setIssues(issues);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, [user, dept]);

  useEffect(() => {
    if (!authLoading && user && roleInfo.role === "department") fetchIssues();
  }, [authLoading, user, roleInfo, fetchIssues]);

  if (authLoading || !user || roleInfo.role !== "department") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!dept) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-red-600">Department configuration missing. Check NEXT_PUBLIC_DEPARTMENT_EMAILS.</p>
      </div>
    );
  }

  // Stats
  const activeIssues = issues.filter((i) => i.status !== "resolved" && i.status !== "rejected");
  const criticalCount = activeIssues.filter((i) => i.ai?.severity === "critical").length;
  const inProgressCount = activeIssues.filter((i) =>
    ["repair_started", "crew_assigned"].includes(i.department_status ?? ""),
  ).length;
  const pendingVerification = activeIssues.filter(
    (i) => i.department_status === "ready_for_verification",
  ).length;

  function handleIssueUpdated(updated: Partial<IssueRecord>) {
    if (!selectedIssue) return;
    const merged = { ...selectedIssue, ...updated };
    setSelectedIssue(merged);
    setIssues((prev) => prev.map((i) => (i.id === merged.id ? merged : i)));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={`${dept.bgClass} border-b ${dept.borderClass} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl ${dept.activeBgClass} bg-opacity-20`}>
              {dept.icon}
            </div>
            <div>
              <p className={`font-bold text-sm ${dept.textClass}`}>{dept.name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchIssues}
              disabled={loading}
              className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={async () => { await logout(); router.push("/sign-in"); }}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="📋" label="Active Issues" value={activeIssues.length} color={dept.textClass} />
          <StatCard
            icon="🔴"
            label="Critical"
            value={criticalCount}
            color={criticalCount > 0 ? "text-red-700" : "text-gray-400"}
          />
          <StatCard
            icon="🔧"
            label="In Repair"
            value={inProgressCount}
            color="text-orange-700"
          />
          <StatCard
            icon="🔍"
            label="Pending Verify"
            value={pendingVerification}
            color="text-sky-700"
            sub={`${dept.crewAvailable}/${dept.crewTotal} crew available`}
          />
        </div>

        {/* Crew status bar */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">👷</span>
            <span>Crew: <span className="font-bold text-gray-800">{dept.crewAvailable}/{dept.crewTotal}</span> available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm">⏱</span>
            <span>Avg response: <span className="font-bold text-gray-800">{dept.avgResponseTime}</span></span>
          </div>
        </div>
      </div>

      {/* Issue list */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading issues…</div>
        ) : issues.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">{dept.icon}</p>
            <p className="text-sm font-semibold text-gray-700">No issues assigned yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Issues routed to {dept.name} will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueListCard
                key={issue.id}
                issue={issue}
                dept={dept}
                onOpen={() => setSelectedIssue(issue)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Issue detail modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          dept={dept}
          user={user}
          onClose={() => setSelectedIssue(null)}
          onIssueUpdated={handleIssueUpdated}
        />
      )}
    </div>
  );
}
