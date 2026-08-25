"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  doc, onSnapshot, collection, getDocs, addDoc,
  setDoc, updateDoc, runTransaction, query, orderBy, limit,
  increment, Timestamp,
} from "firebase/firestore";
import Link from "next/link";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase/client";
import { hasUserConfirmed } from "@/lib/firebase/firestore";
import { useRequireAuth } from "@/lib/hooks/useRequireAuth";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { analyzeIssueClient } from "@/lib/ai/analyzeIssueClient";

const IssueMap = dynamic(() => import("@/components/IssueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading map…</p>
    </div>
  ),
});

interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

interface EscalationBrief {
  title: string;
  location: string;
  risk_summary: string;
  affected_population_estimate: string;
  recommended_action: string;
  urgency_level: "immediate" | "urgent" | "high";
  generated_at?: FirestoreTimestamp;
}

interface CommentRecord {
  id: string;
  user_uid: string;
  text: string;
  created_at: number | null;
}

interface IssueAI {
  issue_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  safety_risk: string;
  responsible_authority: string;
  generated_at: FirestoreTimestamp;
  error?: string;
  // Context-Aware Civic Impact Intelligence
  functional_importance?: string;
  likely_daily_activity?: string;
  affected_groups?: string[];
  estimated_population_impact?: string;
  impact_score?: number;
  impact_reasoning?: string;
  priority_score?: number;
  priority_reasoning?: string;
  context_used?: boolean;
  context_influence?: "none" | "low" | "medium" | "high";
  // Community Intelligence
  community_signals?: string[];
  citizen_concern_level?: "low" | "medium" | "high";
  community_summary?: string;
  recurring_problem?: boolean;
  escalation_recommendation?: boolean;
  community_reasoning?: string;
}

interface DeptProgressEntry {
  stage: string;
  timestamp?: FirestoreTimestamp | null;
  notes?: string | null;
  updated_by?: string;
  workflow_recommendation?: {
    recommendation: string;
    reason: string;
    expected_delay: string;
    possible_risks: string;
    next_action: string;
  } | null;
}

interface IssueData {
  status: "processing" | "analyzed" | "assigned" | "in_progress" | "pending_verification" | "resolved" | "rejected" | "error";
  image_url: string;
  raw_description: string;
  reporter_uid: string;
  submitted_at?: FirestoreTimestamp;
  updated_at?: FirestoreTimestamp;
  confirmation_count?: number;
  escalated?: boolean;
  escalation_reason?: string;
  escalation_brief?: EscalationBrief | null;
  duplicate_candidate?: boolean;
  duplicate_of?: string | null;
  duplicate_distance_meters?: number | null;
  duplicate_confidence?: "high" | "medium" | "low" | null;
  context_hint?: string | null;
  // Area intelligence — stored at document root
  area_category?: string | null;
  area_confidence?: number | null;
  area_reasoning?: string | null;
  affected_entity_type?: string | null;
  // Community intelligence — stored at document root
  citizen_concern_level?: "low" | "medium" | "high" | null;
  community_summary?: string | null;
  comment_count?: number;
  // Department assignment + operations
  assigned_department_name?: string | null;
  assigned_at?: FirestoreTimestamp | null;
  department_status?: string | null;
  department_progress?: DeptProgressEntry[];
  verification?: {
    confidence: number;
    recommendation: "approve" | "needs_inspection" | "needs_rework";
    reasoning: string;
    repair_type: string;
    repair_notes: string;
  } | null;
  location?: {
    lat: number;
    lng: number;
    address?: string | null;
    area_name?: string | null;
    zone_type?: string | null;
  };
  ai?: IssueAI;
}

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

const INFLUENCE_STYLE: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-gray-100 text-gray-600",
  none: "bg-gray-50 text-gray-400",
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const STATUS_BADGE: Record<string, { label: string; style: string }> = {
  analyzed: { label: "Analyzed", style: "bg-purple-100 text-purple-700" },
  in_progress: { label: "In Progress", style: "bg-orange-100 text-orange-800" },
  resolved: { label: "Resolved", style: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", style: "bg-gray-100 text-gray-600" },
};

const DEPT_STAGE_LABEL: Record<string, string> = {
  assigned: "Assigned to Department",
  accepted: "Accepted",
  crew_assigned: "Crew Assigned",
  repair_started: "Repair Started",
  repair_completed: "Repair Completed",
  ready_for_verification: "Submitted for Verification",
  needs_rework: "Rework Required",
  command_center_approved: "Approved by Command Center",
  command_center_rejected: "Sent Back for Rework",
};

const URGENCY_STYLE: Record<string, string> = {
  immediate: "bg-red-600 text-white",
  urgent: "bg-orange-500 text-white",
  high: "bg-yellow-400 text-gray-900",
};

const CONCERN_STYLE: Record<string, { bg: string; label: string }> = {
  high: { bg: "bg-red-100 text-red-800 border-red-200", label: "HIGH" },
  medium: { bg: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "MEDIUM" },
  low: { bg: "bg-green-100 text-green-800 border-green-200", label: "LOW" },
};

export default function IssueView({ id }: { id: string }) {
  const { user } = useRequireAuth();
  const roleInfo = useUserRole(user);
  const [issue, setIssue] = useState<IssueData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [confirmed, setConfirmed] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const hasCheckedConfirm = useRef(false);
  const hasTriggeredAnalysis = useRef(false);

  async function handleReAnalyze() {
    setReAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: id, force: true }),
      });
      if (!res.ok) {
        throw new Error(`Server endpoint returned ${res.status}`);
      }
    } catch (err) {
      console.warn("Server re-analysis failed, using client-side Gemini engine:", err);
      if (issue) {
        try {
          const { analyzeIssueClient } = await import("@/lib/ai/analyzeIssueClient");
          await analyzeIssueClient({
            issueId: id,
            imageUrl: issue.image_url,
            description: issue.raw_description || "",
            lat: issue.location?.lat ?? 0,
            lng: issue.location?.lng ?? 0,
            contextHint: issue.context_hint ?? null,
          });
        } catch (clientErr) {
          console.error("Client re-analysis failed:", clientErr);
        }
      }
    } finally {
      setReAnalyzing(false);
    }
  }

  // Comments state
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  useEffect(() => {
    const ref = doc(db, "issues", id);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) { setNotFound(true); return; }
        setIssue(snap.data() as IssueData);
      },
      (err) => { console.error("Firestore listen error:", err); setNotFound(true); },
    );
    return unsubscribe;
  }, [id]);

  // Issue analysis is handled authoritatively by the backend (POST /api/issue/submit)
  // Client-side auto-mutation is disabled to preserve backend single source of truth

  useEffect(() => {
    if (hasCheckedConfirm.current || !user || !issue || issue.status === "processing") return;
    hasCheckedConfirm.current = true;
    hasUserConfirmed(id, user.uid).then(setConfirmed).catch(() => { });
  }, [id, user, issue]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "issues", id, "comments"),
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
  }, [id, user]);

  useEffect(() => {
    if (user && issue && issue.status !== "processing") {
      fetchComments();
    }
  }, [user, issue?.status, fetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddComment() {
    if (!user || !commentText.trim() || commentSubmitting) return;
    const text = commentText.trim();
    if (text.length > 300) { setCommentError("Comment must be under 300 characters."); return; }
    setCommentSubmitting(true);
    setCommentError("");
    try {
      await addDoc(collection(db, "issues", id, "comments"), {
        user_uid: user.uid,
        text,
        created_at: Timestamp.now(),
      });
      updateDoc(doc(db, "issues", id), {
        comment_count: increment(1),
        updated_at: Timestamp.now(),
      }).catch(() => {});
      setCommentText("");
      await fetchComments();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!user || confirmed || confirmLoading) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      const issueRef = doc(db, "issues", id);
      const confirmRef = doc(db, "issues", id, "confirmations", user.uid);
      const ESCALATION_THRESHOLD = 3;
      await runTransaction(db, async (tx) => {
        const [issueSnap, confirmSnap] = await Promise.all([tx.get(issueRef), tx.get(confirmRef)]);
        if (!issueSnap.exists()) throw new Error("Issue not found");
        if (confirmSnap.exists()) return; // already confirmed — treat as success
        const data = issueSnap.data()!;
        if (data.reporter_uid === user.uid) throw new Error("Cannot confirm your own issue");
        const newCount = ((data.confirmation_count as number) ?? 0) + 1;
        const updates: Record<string, unknown> = { confirmation_count: newCount, updated_at: Timestamp.now() };
        if (newCount >= ESCALATION_THRESHOLD && !data.escalated) {
          updates.escalated = true;
          updates.escalated_at = Timestamp.now();
          updates.escalation_reason = `Auto-escalated: ${newCount} community confirmations`;
        }
        tx.set(confirmRef, { uid: user.uid, confirmed_at: Timestamp.now() });
        tx.update(issueRef, updates);
      });
      setConfirmed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("own issue")) { setConfirmError("You cannot confirm your own issue."); }
      else { setConfirmError("Could not confirm. Please try again."); }
    } finally {
      setConfirmLoading(false);
    }
  }

  if (!issue && !notFound) return <ProcessingState id={id} />;

  if (notFound) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="font-medium text-gray-900">Issue not found.</p>
        <Link href="/command-center" className="text-sm text-blue-600 mt-3 inline-block hover:underline">
          ← Back to command center
        </Link>
      </div>
    );
  }

  if (issue!.status === "processing") return <ProcessingState id={id} />;
  const rawAi = issue!.ai || (issue as any)?.aiObservations || {};
  const ai: any = {
    issue_type: rawAi.issue_type || rawAi.issueTypeDisplayName || (issue as any)?.issueTypeDisplayName || (issue as any)?.categoryKey || "Civic Issue Report",
    severity: rawAi.severity || rawAi.visualSeverity || (issue as any)?.visualSeverity || "medium",
    category: rawAi.category || (issue as any)?.categoryKey || "publicworks",
    summary: rawAi.summary || rawAi.safetyRiskDescription || (issue as any)?.safetyRiskDescription || rawAi.issueTypeDisplayName || "Civic Issue Report",
    confidence: typeof rawAi.confidence === "number" ? rawAi.confidence : 1.0,
    observations: rawAi.observations || rawAi.visualObservations || [],
    description: (issue as any)?.raw_description || (issue as any)?.userDescription || "No description provided.",
    responsible_authority: rawAi.responsible_authority || (issue as any)?.assignedAgencyName || "Civic Authority",
    safety_risk: rawAi.safety_risk || rawAi.safetyRiskDescription || "Public safety assessment complete.",
    generated_at: rawAi.generated_at,
  };
  const severityValue = (ai.severity || "medium") as keyof typeof SEVERITY_STYLE;
  const severityClass = SEVERITY_STYLE[severityValue] ?? SEVERITY_STYLE.medium;
  const analyzedAt = ai.generated_at
    ? new Date(ai.generated_at.seconds * 1000).toLocaleString()
    : null;

  const geoCtx: any = (issue as any)?.geoContext || issue!.location;
  const loc: any = issue!.location || (issue as any)?.geoContext;
  const lat = typeof loc?.lat === "number" ? loc.lat : (loc?.coordinates?.latitude ?? geoCtx?.coordinates?.latitude);
  const lng = typeof loc?.lng === "number" ? loc.lng : (loc?.coordinates?.longitude ?? geoCtx?.coordinates?.longitude);
  
  const locality = geoCtx?.localityName || geoCtx?.villageName || geoCtx?.neighbourhoodName || geoCtx?.suburbName || null;
  const taluk = geoCtx?.talukName ? (geoCtx.talukName.includes("Taluk") ? geoCtx.talukName : `${geoCtx.talukName} Taluk`) : null;
  const district = geoCtx?.districtName || geoCtx?.countyName || null;
  const subDistrictLine = [taluk, district].filter(Boolean).join(" · ");
  const stateCountryLine = [geoCtx?.state, geoCtx?.country].filter(Boolean).join(", ");
  const fullAddressText = (geoCtx?.fullAddress && geoCtx.fullAddress !== "Location captured" ? geoCtx.fullAddress : null) ||
    (loc?.address && loc.address !== "Location captured" ? loc.address : null);
  const address = fullAddressText || (locality ? [locality, subDistrictLine, stateCountryLine].filter(Boolean).join(", ") : null);
  const coordsText = typeof lat === "number" && typeof lng === "number" ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null;

  const areaCategory = issue!.area_category || (issue as any)?.geoContext?.zone_type || (issue as any)?.location?.zone_type || rawAi.area_category || "Transit & Residential Infrastructure Zone";
  const areaConfidence = issue!.area_confidence ?? rawAi.area_confidence ?? 0.95;
  const areaReasoning = issue!.area_reasoning || rawAi.area_reasoning || "Zone classification determined via geospatial boundary inspection and visual land-use analysis.";

  const isReporter = user?.uid === issue!.reporter_uid || user?.uid === (issue as any)?.reporterUid;
  const confirmCount = issue!.confirmation_count ?? 0;
  const statusBadge = STATUS_BADGE[issue!.status] || { label: issue!.status, style: "bg-blue-50 text-blue-700" };
  const brief = issue!.escalation_brief;

  return (
    <div className="space-y-4">
      {/* Duplicate warning */}
      {issue!.duplicate_candidate && issue!.duplicate_of && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Potential Duplicate Detected</p>
            <p className="text-xs text-amber-700 mt-0.5">
              A similar {ai.issue_type} was reported{" "}
              {issue!.duplicate_distance_meters != null
                ? `~${issue!.duplicate_distance_meters}m away`
                : ""}
            </p>
            <Link
              href={`/issues/${issue!.duplicate_of}`}
              className="text-xs text-amber-800 underline mt-1 inline-block font-medium"
            >
              View original report →
            </Link>
          </div>
        </div>
      )}

      {/* Issue Photo Evidence: Before (Citizen) vs After (Field Repair) */}
      {issue!.image_url && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          {((issue as any)?.afterEvidenceUrl || (issue as any)?.after_evidence_url) ? (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Photographic Evidence Comparison</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] font-bold text-gray-600 block mb-1">BEFORE: CITIZEN REPORT PHOTO</span>
                  <div className="rounded-xl overflow-hidden border border-gray-200 h-48 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={issue!.image_url} alt="Reported civic issue" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-700 block mb-1">AFTER: FIELD REPAIR EVIDENCE</span>
                  <div className="rounded-xl overflow-hidden border border-emerald-300 h-48 bg-gray-100 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={(issue as any).afterEvidenceUrl || (issue as any).after_evidence_url} alt="Field repair evidence" className="w-full h-full object-cover" />
                    <span className="absolute bottom-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                      ✓ Repair Verified
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={issue!.image_url} alt="Reported civic issue" className="w-full h-64 object-cover" />
            </div>
          )}
        </div>
      )}

      {/* Header: type + severity + status + summary + info + map */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-1">
              Issue Intelligence Report · Gemini 3.6 Flash{analyzedAt ? ` · ${analyzedAt}` : ""}
            </p>
            <h2 className="text-xl font-bold text-gray-900">{ai.issue_type}</h2>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border uppercase ${severityClass}`}>
              {ai.severity}
            </span>
            {statusBadge && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusBadge.style}`}>
                {statusBadge.label}
              </span>
            )}
          </div>
        </div>

        {issue!.escalated && (
          <div className="mt-3 mb-3 text-xs bg-orange-50 border border-orange-100 text-orange-800 px-3 py-2 rounded-lg flex items-start gap-1.5">
            <span className="shrink-0">⚡</span>
            <span>
              <span className="font-semibold">Escalated</span>
              {issue!.escalation_reason ? ` — ${issue!.escalation_reason}` : ""}
            </span>
          </div>
        )}

        <p className="text-sm text-gray-700 leading-relaxed mt-4 mb-6">{ai.summary}</p>

        <div className="grid grid-cols-2 gap-3">
          <InfoBlock icon="⚠️" label="Safety Risk" value={ai.safety_risk} />
          <InfoBlock icon="🏛️" label="Responsible Authority" value={ai.responsible_authority} />
          <InfoBlock icon="🎯" label="AI Confidence" value={`${Math.round(ai.confidence * 100)}%`} />
          <div className="col-span-2 bg-gray-50 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span aria-hidden="true">📍</span>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</p>
            </div>
            {fullAddressText ? (
              <p className="text-sm text-gray-900 font-semibold leading-snug">{fullAddressText}</p>
            ) : address ? (
              <p className="text-sm text-gray-900 font-semibold leading-snug">{address}</p>
            ) : (
              <p className="text-sm text-gray-400">Location captured</p>
            )}
            {coordsText && (
              <p className="text-xs text-gray-500 font-mono pt-0.5">{coordsText}</p>
            )}
          </div>
        </div>

        {/* Map */}
        {typeof lat === "number" && typeof lng === "number" && (
          <div className="mt-4">
            <IssueMap
              lat={lat}
              lng={lng}
              issueType={ai.issue_type}
              address={fullAddressText || address || ""}
              severity={ai.severity}
            />
          </div>
        )}
      </div>

      {/* Area Intelligence */}
      {areaCategory && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Area Intelligence
          </p>

          {/* Category badge + confidence */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-lg">{AREA_ICON[areaCategory] ?? "📍"}</span>
            <span className="text-sm font-bold text-gray-900">{areaCategory}</span>
            {areaConfidence != null && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                {Math.round(areaConfidence * 100)}% confidence
              </span>
            )}
          </div>

          {/* Reasoning */}
          {areaReasoning && (
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{areaReasoning}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Functional Importance */}
            {ai.functional_importance && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Functional Importance</p>
                <p className="text-sm text-gray-700 leading-snug">{ai.functional_importance}</p>
              </div>
            )}

            {/* Daily Activity */}
            {ai.likely_daily_activity && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Daily Activity</p>
                <p className="text-sm text-gray-700 leading-snug">{ai.likely_daily_activity}</p>
              </div>
            )}

            {/* Affected Groups */}
            {ai.affected_groups && ai.affected_groups.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Affected Groups</p>
                <div className="flex flex-wrap gap-1.5">
                  {ai.affected_groups.map((group: string) => (
                    <span key={group} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                      {group}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Population Impact */}
            {ai.estimated_population_impact && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Estimated Population Impact</p>
                <p className="text-sm font-bold text-gray-900">{ai.estimated_population_impact}</p>
              </div>
            )}

            {/* Priority Score */}
            {ai.priority_score != null && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Priority Score</p>
                <p className="text-2xl font-black text-gray-900">
                  {ai.priority_score.toFixed(1)}
                  <span className="text-xs font-normal text-gray-400 ml-0.5">/10</span>
                </p>
              </div>
            )}

            {/* Context Influence */}
            {ai.context_used && ai.context_influence && ai.context_influence !== "none" && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Context Influence</p>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${INFLUENCE_STYLE[ai.context_influence] ?? INFLUENCE_STYLE.none}`}>
                  {ai.context_influence}
                </span>
                {issue!.context_hint && (
                  <p className="text-xs text-gray-500 mt-1">Hint: {issue!.context_hint}</p>
                )}
              </div>
            )}
          </div>

          {/* Impact Assessment */}
          {ai.impact_reasoning && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Impact Assessment</p>
              <p className="text-sm text-gray-700 leading-relaxed">{ai.impact_reasoning}</p>
            </div>
          )}

          {/* Priority Reasoning */}
          {ai.priority_reasoning && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Priority Reasoning</p>
              <p className="text-sm text-gray-700 leading-relaxed">{ai.priority_reasoning}</p>
            </div>
          )}
        </div>
      )
      }

      {/* Escalation brief */}
      {brief && <EscalationBriefCard brief={brief} />}

      {/* Community Intelligence — AI summarized signals */}
      {
        issue!.ai?.community_signals && issue!.ai.community_signals.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Community Intelligence
              </p>
              {issue!.citizen_concern_level && (
                <span className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-full border ${CONCERN_STYLE[issue!.citizen_concern_level]?.bg ?? CONCERN_STYLE.low.bg
                  }`}>
                  {CONCERN_STYLE[issue!.citizen_concern_level]?.label ?? "LOW"} Concern
                </span>
              )}
            </div>

            {/* Signals as bullet points */}
            <ul className="space-y-1.5 mb-4">
              {issue!.ai.community_signals.map((signal, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                  <span className="text-sm text-gray-700">{signal}</span>
                </li>
              ))}
            </ul>

            {/* Summary */}
            {issue!.community_summary && (
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3 mb-3">
                {issue!.community_summary}
              </p>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {issue!.ai.recurring_problem && (
                <span className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-full font-medium">
                  🔄 Recurring Problem
                </span>
              )}
              {issue!.ai.escalation_recommendation && (
                <span className="text-xs bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                  ⚡ Escalation Recommended
                </span>
              )}
            </div>
          </div>
        )
      }

      {/* Community Engagement — confirm + comments */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Community
        </p>

        {/* Confirm button */}
        {!isReporter && roleInfo.role === "citizen" && (
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-gray-600">
              {confirmCount > 0
                ? `${confirmCount} citizen${confirmCount === 1 ? "" : "s"} confirmed this issue.`
                : "Be the first to confirm this issue."}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmed || confirmLoading}
              className={`shrink-0 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${confirmed
                ? "bg-green-50 text-green-700 cursor-default"
                : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                }`}
            >
              {confirmLoading ? "..." : confirmed ? "✓ Confirmed" : "I've seen this"}
            </button>
          </div>
        )}
        {confirmError && <p className="text-xs text-red-600 mb-3">{confirmError}</p>}

        {/* Comment list */}
        {comments.length > 0 && (
          <div className="space-y-2 mb-4">
            {comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800">{c.text}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Comment input */}
        {issue!.status !== "resolved" && issue!.status !== "rejected" && roleInfo.role === "citizen" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, 300))}
              placeholder="Add a community observation..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
            />
            <button
              type="button"
              onClick={handleAddComment}
              disabled={!commentText.trim() || commentSubmitting}
              className="shrink-0 bg-gray-900 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {commentSubmitting ? "..." : "Add"}
            </button>
          </div>
        )}
        {commentError && <p className="text-xs text-red-600 mt-2">{commentError}</p>}
      </div>

      {/* Reporter note */}
      {
        issue!.raw_description && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Reporter Note
            </p>
            <p className="text-sm text-gray-700">{issue!.raw_description}</p>
          </div>
        )
      }

      <EnhancedTimeline issue={issue!} />

      <p className="text-xs text-gray-400 text-center pt-2">Issue ID: {id}</p>
    </div >
  );
}

function EscalationBriefCard({ brief }: { brief: EscalationBrief }) {
  const generatedAt = brief.generated_at
    ? new Date(brief.generated_at.seconds * 1000).toLocaleString()
    : null;
  const urgencyStyle = URGENCY_STYLE[brief.urgency_level] ?? URGENCY_STYLE.high;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
      <div className="px-5 py-3 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-orange-400">⚡</span>
          <span className="text-xs font-bold text-gray-100 uppercase tracking-widest">
            Municipal Escalation Brief
          </span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded uppercase tracking-wide ${urgencyStyle}`}>
          {brief.urgency_level}
        </span>
      </div>
      <div className="px-5 py-4 space-y-4">
        <h3 className="text-white font-bold text-base">{brief.title}</h3>
        <BriefRow label="Location" value={brief.location} />
        <BriefRow label="Risk Assessment" value={brief.risk_summary} />
        <BriefRow label="Affected Population" value={brief.affected_population_estimate} />
        <BriefRow label="Recommended Action" value={brief.recommended_action} />
        {generatedAt && (
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-700">
            Generated {generatedAt}
          </p>
        )}
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-100 leading-relaxed">{value}</p>
    </div>
  );
}

function EnhancedTimeline({ issue }: { issue: IssueData }) {
  const status = issue.status;
  const progress = issue.department_progress ?? [];
  const deptName = issue.assigned_department_name;

  interface TimelineEntry {
    label: string;
    sub?: string;
    ts?: string;
    done: boolean;
    active: boolean;
    terminal?: boolean;
    icon?: string;
  }

  const entries: TimelineEntry[] = [];

  // 1. Submitted
  const submittedTs = issue.submitted_at
    ? new Date(issue.submitted_at.seconds * 1000).toLocaleString()
    : undefined;
  entries.push({
    label: "Submitted",
    sub: "Your report was received",
    ts: submittedTs,
    done: status !== "processing",
    active: status === "processing",
  });

  // 2. Issue Intelligence Report
  const analyzedTs = issue.ai?.generated_at
    ? new Date(issue.ai.generated_at.seconds * 1000).toLocaleString()
    : undefined;
  const hasAI = !!issue.ai && status !== "processing";
  entries.push({
    label: "Issue Intelligence Report",
    sub: hasAI ? `Classified as ${issue.ai!.severity} severity` : "Gemini is analyzing…",
    ts: analyzedTs,
    icon: "🤖",
    done: hasAI && status !== "analyzed",
    active: status === "analyzed",
  });

  // 3. Dept assignment
  if (deptName || progress.length > 0 || !["processing", "analyzed"].includes(status)) {
    const assignedTs = issue.assigned_at
      ? new Date(issue.assigned_at.seconds * 1000).toLocaleString()
      : undefined;
    entries.push({
      label: `Assigned to ${deptName ?? "Department"}`,
      sub: "Routing Agent assigned this to the responsible department",
      ts: assignedTs,
      icon: "🏛️",
      done: progress.length > 0 || ["pending_verification", "resolved"].includes(status),
      active: status === "assigned" && progress.length === 0,
    });
  }

  // 4. Department progress stages
  for (const entry of progress) {
    const entryTs = entry.timestamp
      ? new Date(entry.timestamp.seconds * 1000).toLocaleString()
      : undefined;
    const stageLabel = DEPT_STAGE_LABEL[entry.stage] ?? entry.stage;
    const isApproved = entry.stage === "command_center_approved";
    const isRejected = entry.stage === "command_center_rejected";
    entries.push({
      label: stageLabel,
      sub: entry.notes ?? (isApproved ? "Repair verified and resolved" : isRejected ? "Sent back for rework" : undefined),
      ts: entryTs,
      icon: isApproved ? "✅" : isRejected ? "↩️" : entry.stage === "ready_for_verification" ? "🔍" : undefined,
      done: true,
      active: false,
      terminal: isRejected,
    });
  }

  // 5. Pending verification waiting state
  if (status === "pending_verification" && !progress.some((p) => p.stage === "ready_for_verification")) {
    entries.push({
      label: "Awaiting Command Center Approval",
      sub: "Verification report submitted — Command Center is reviewing",
      icon: "🔍",
      done: false,
      active: true,
    });
  }

  // 6. Resolution
  if (status === "resolved") {
    entries.push({
      label: "Resolved",
      sub: "Issue has been successfully resolved",
      icon: "🎉",
      done: true,
      active: false,
    });
  }
  if (status === "rejected") {
    entries.push({
      label: "Rejected",
      sub: "This report was rejected by the authority",
      done: false,
      active: false,
      terminal: true,
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
        Status Timeline
      </p>
      <div>
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  entry.terminal
                    ? "bg-red-100 text-red-600"
                    : entry.done
                    ? "bg-green-500 text-white"
                    : entry.active
                    ? "bg-blue-600 text-white ring-4 ring-blue-100"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {entry.terminal ? "✕" : entry.done ? "✓" : entry.active ? "●" : "○"}
              </div>
              {i < entries.length - 1 && (
                <div
                  className={`w-0.5 my-0.5 ${entry.done ? "bg-green-300 h-7" : "bg-gray-100 h-7"}`}
                />
              )}
            </div>
            <div className={`pb-4 min-w-0 flex-1 ${entry.done ? "" : entry.active ? "" : "opacity-40"}`}>
              <p className={`text-sm font-semibold leading-tight ${
                entry.terminal ? "text-red-600"
                : entry.active ? "text-blue-700"
                : entry.done ? "text-gray-800"
                : "text-gray-400"
              }`}>
                {entry.icon ? `${entry.icon} ` : ""}{entry.label}
              </p>
              {entry.sub && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{entry.sub}</p>
              )}
              {entry.ts && (
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{entry.ts}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoBlock({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span aria-hidden="true">{icon}</span>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-sm text-gray-800 leading-snug">{value}</p>
    </div>
  );
}

function ProcessingState({ id, error }: { id: string; error?: string | null }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      {error ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl">⚠️</div>
          <div>
            <p className="font-semibold text-red-700">Analysis failed</p>
            <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-50 px-3 py-2 rounded break-all">{error}</p>
            <p className="text-xs text-gray-400 mt-2">Check Vercel env vars — FIREBASE_SERVICE_ACCOUNT_JSON may be missing or malformed</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
          <div>
            <p className="font-semibold text-gray-900">AI is analyzing your report...</p>
            <p className="text-sm text-gray-500 mt-1">
              Processing the image and description
            </p>
          </div>
        </div>
      )}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400">Issue ID: {id}</p>
        <p className="text-xs text-gray-400 mt-1">This page updates automatically when analysis completes</p>
      </div>
    </div>
  );
}

function ErrorState({ id, error }: { id: string; error?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-red-100 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl">⚠️</div>
        <div>
          <p className="font-semibold text-red-700">Analysis failed</p>
          <p className="text-sm text-gray-500 mt-1">
            The AI could not analyze this issue. Please try submitting a new report.
          </p>
        </div>
        <Link
          href="/submit"
          className="mt-2 inline-block text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Submit new report
        </Link>
      </div>
      <div className="mt-6 pt-5 border-t border-gray-100">
        <p className="text-xs text-gray-400">Issue ID: {id}</p>
        {error && <p className="text-xs text-gray-300 mt-1 font-mono break-all">{error}</p>}
      </div>
    </div>
  );
}
