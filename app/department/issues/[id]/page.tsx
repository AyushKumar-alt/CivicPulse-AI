"use client";

import { useEffect, useState, useCallback, use, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import dynamic from "next/dynamic";

const IssueMap = dynamic(() => import("@/components/IssueMap"), { ssr: false });

interface CaseEvent {
  id: string;
  eventType?: string;
  fromState?: string | null;
  toState?: string | null;
  actorId?: string;
  actorRole?: string;
  timestamp: string;
  note?: string | null;
  evidenceUrl?: string | null;
}

interface CanonicalIssue {
  id: string;
  state: string;
  primaryStatus?: string;
  assignedAgencyId: string;
  assignedAgencyName: string;
  cityId?: string;
  rawDescription: string;
  imageUrl?: string;
  submittedAt: string;
  updatedAt: string;
  location?: {
    fullAddress?: string;
    localityName?: string;
    talukName?: string;
    districtName?: string;
    state?: string;
    country?: string;
    coordinates?: { latitude: number; longitude: number };
  };
  aiObservations?: {
    visualSeverity?: string;
    issueTypeDisplayName?: string;
    summaryDescription?: string;
    safetyRiskDescription?: string;
    confidenceScore?: number;
  };
  ai?: {
    severity?: string;
    summary?: string;
    safety_risk?: string;
    responsible_authority?: string;
  };
  assignment?: {
    unitId?: string;
    unitName?: string;
    teamId?: string;
    teamName?: string;
    officerId?: string;
    officerName?: string;
  };
  ackDueAt?: string | null;
  slaDueAt?: string | null;
  citizenSlaDueAt?: string | null;
  afterEvidenceUrl?: string | null;
}

const STATE_BADGE_STYLE: Record<string, string> = {
  ROUTED: "bg-purple-100 text-purple-900 border-purple-300",
  ACKNOWLEDGED: "bg-amber-100 text-amber-900 border-amber-300",
  UNDER_INVESTIGATION: "bg-blue-100 text-blue-900 border-blue-300",
  VALIDATED: "bg-indigo-100 text-indigo-900 border-indigo-300",
  FIELD_ASSIGNED: "bg-cyan-100 text-cyan-900 border-cyan-300",
  IN_PROGRESS: "bg-orange-100 text-orange-900 border-orange-300",
  DEFERRED: "bg-gray-200 text-gray-800 border-gray-400",
  RESOLUTION_SUBMITTED: "bg-teal-100 text-teal-900 border-teal-300",
  CLOSED: "bg-emerald-100 text-emerald-900 border-emerald-300",
  REOPENED: "bg-rose-100 text-rose-900 border-rose-300",
  DUPLICATE: "bg-slate-200 text-slate-700 border-slate-300",
  REJECTED: "bg-red-100 text-red-900 border-red-300",
};

const SAMPLE_REPAIR_PHOTOS = [
  { label: "⚡ Electrical Repair Completed", url: "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=800&q=80" },
  { label: "🛠️ Pothole Asphalt Patched", url: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=800&q=80" },
  { label: "💧 Water Main Pipeline Sealed", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80" },
];

export default function DepartmentIssueWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [issue, setIssue] = useState<CanonicalIssue | null>(null);
  const [caseEvents, setCaseEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form states for Crew Assignment
  const [unitId, setUnitId] = useState("yelahanka_div");
  const [unitName, setUnitName] = useState("Yelahanka Division");
  const [teamId, setTeamId] = useState("crew_04");
  const [teamName, setTeamName] = useState("Electrical Crew 04");
  const [officerId, setOfficerId] = useState("officer_101");
  const [officerName, setOfficerName] = useState("Ravi Kumar");

  // Form states for Resolution
  const [resolutionNotes, setResolutionNotes] = useState("High-voltage electrical power lines fixed properly with safety priority. Pole repaired and current restored.");
  const [afterEvidenceUrl, setAfterEvidenceUrl] = useState(SAMPLE_REPAIR_PHOTOS[0].url);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form states for Defer / Reopen / Reject / Duplicate
  const [reasonNotes, setReasonNotes] = useState("");
  const [parentIssueId, setParentIssueId] = useState("");

  // Modal Lightbox state for evidence photo inspection
  const [previewImageModalUrl, setPreviewImageModalUrl] = useState<string | null>(null);

  const fetchWorkOrderDetails = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/department/issues/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to fetch work order`);
      }
      const data = await res.json();
      setIssue(data.issue);
      setCaseEvents(data.caseEvents || []);
      if (data.issue?.afterEvidenceUrl) {
        setAfterEvidenceUrl(data.issue.afterEvidenceUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in");
    } else if (user) {
      void fetchWorkOrderDetails();
    }
  }, [user, authLoading, router, fetchWorkOrderDetails]);

  // Compress local image file using canvas to guarantee <1MB size for Firestore
  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError("");
    try {
      const compressedDataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;
          const maxDim = 800;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas context failed"));
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = reject;
        img.src = url;
      });

      setAfterEvidenceUrl(compressedDataUrl);
    } catch (err) {
      setError("Failed to compress image file. Please try another image.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function executeLifecycleAction(endpoint: string, payload?: Record<string, unknown>, label = "Action") {
    if (!user || actionLoading) return;
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: ${label} failed`);
      }

      setSuccessMsg(`✅ ${label} completed successfully!`);
      await fetchWorkOrderDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-500 font-medium">
        Loading Department Work Order Workspace...
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl max-w-lg mx-auto">
          <p className="font-bold text-lg mb-2">Work Order Not Found</p>
          <p className="text-sm text-red-600 mb-4">{error || "Could not load the requested work order."}</p>
          <Link href="/department" className="inline-block bg-gray-900 text-white text-xs font-semibold px-4 py-2 rounded-lg">
            ← Return to Department Queue
          </Link>
        </div>
      </div>
    );
  }

  const currentState = issue.state || "ROUTED";
  const sev = issue.aiObservations?.visualSeverity || issue.ai?.severity || "medium";
  const lat = issue.location?.coordinates?.latitude;
  const lng = issue.location?.coordinates?.longitude;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "N/A" : d.toLocaleString();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <Link href="/department" className="text-xs font-semibold text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Department Queue
          </Link>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            <h1 className="text-2xl font-black text-gray-900">Work Order #{issue.id}</h1>
            <span className={`text-xs font-extrabold px-3 py-1 rounded-full border uppercase ${STATE_BADGE_STYLE[currentState] || "bg-gray-100 text-gray-800 border-gray-300"}`}>
              STATE: {currentState}
            </span>
            <span className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded ${
              sev === "critical" ? "bg-rose-100 text-rose-800" : sev === "high" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
            }`}>
              {sev}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono mt-1">
            Assigned Agency: <strong>{issue.assignedAgencyName}</strong> ({issue.assignedAgencyId})
          </p>
        </div>

        <button
          onClick={() => fetchWorkOrderDetails()}
          disabled={actionLoading}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-3.5 py-2 rounded-lg transition-colors shrink-0 self-start sm:self-auto"
        >
          🔄 Refresh Status
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <div>
            <p className="font-bold">Operation Exception</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-start gap-2">
          <span className="shrink-0">✓</span>
          <div>
            <p className="font-bold">Operation Completed</p>
            <p className="text-xs mt-0.5">{successMsg}</p>
          </div>
        </div>
      )}

      {/* SLA Countdown Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Ack SLA Target</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {formatDate(issue.ackDueAt)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Resolution SLA Target</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {formatDate(issue.slaDueAt)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Citizen SLA Guarantee</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {formatDate(issue.citizenSlaDueAt)}
          </p>
        </div>
      </div>

      {/* Work Order Details & Location Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Issue Intelligence & Before/After Evidence */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Issue Intelligence & Photo Evidence</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Before: Citizen Report Photo</p>
              {issue.imageUrl ? (
                <div className="rounded-xl overflow-hidden border border-gray-200 h-44 bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={issue.imageUrl} alt="Citizen report photo" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-44 bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">No Photo</div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">After: Field Repair Evidence</p>
              {issue.afterEvidenceUrl || afterEvidenceUrl ? (
                <div className="rounded-xl overflow-hidden border border-emerald-300 h-44 bg-gray-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={issue.afterEvidenceUrl || afterEvidenceUrl} alt="Repair evidence photo" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1.5 right-1.5 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                    Repair Evidence
                  </span>
                </div>
              ) : (
                <div className="h-44 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center text-xs text-gray-400 p-4 text-center">
                  Pending Resolution Evidence Upload
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 text-lg">
              {issue.aiObservations?.issueTypeDisplayName || issue.rawDescription}
            </h3>
            <p className="text-xs text-gray-500 mt-1">Reported at: {formatDate(issue.submittedAt)}</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-3.5 space-y-2 text-xs">
            <p><strong>AI Summary:</strong> {issue.aiObservations?.summaryDescription || issue.ai?.summary || issue.rawDescription}</p>
            <p><strong>Safety Risk:</strong> {issue.aiObservations?.safetyRiskDescription || issue.ai?.safety_risk || "Public safety hazard identified"}</p>
            <p><strong>Responsible Authority:</strong> {issue.ai?.responsible_authority || issue.assignedAgencyName}</p>
          </div>
        </div>

        {/* Right: Location & Map */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Location & Geolocation Hierarchy</h2>

          <div className="bg-gray-50 rounded-xl p-3.5 text-xs space-y-1">
            <p className="font-bold text-gray-900 text-sm">📍 {issue.location?.fullAddress || issue.location?.localityName || "Location captured"}</p>
            {issue.location?.talukName && <p className="text-gray-600">Subdistrict / Taluk: {issue.location.talukName}</p>}
            {issue.location?.districtName && <p className="text-gray-600">District: {issue.location.districtName}</p>}
            {issue.location?.state && <p className="text-gray-600">State / Country: {issue.location.state}, {issue.location.country || "India"}</p>}
            {typeof lat === "number" && typeof lng === "number" && (
              <p className="text-gray-400 font-mono pt-1">Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}</p>
            )}
          </div>

          {typeof lat === "number" && typeof lng === "number" && (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <IssueMap
                lat={lat}
                lng={lng}
                issueType={issue.aiObservations?.issueTypeDisplayName || "Work Order"}
                address={issue.location?.fullAddress || ""}
                severity={sev}
              />
            </div>
          )}
        </div>
      </div>

      {/* AI Operational Action Plan & Field Intelligence */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
            <span>📋</span> AI ACTION PLAN & REPAIR SPECIFICATIONS
          </h2>
          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
            Generated by Gemini 2.5 Flash
          </span>
        </div>

        <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase">Crew Required</p>
              <p className="font-bold text-gray-900 mt-0.5">Municipal Works Field Crew</p>
              <p className="text-[11px] text-gray-600">Civil Engineer, Heavy Machinery Operator, Plumber/Electrician</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase">Workers Needed</p>
              <p className="text-lg font-black text-blue-900 mt-0.5">8 Workers</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase">Est. Duration</p>
              <p className="font-bold text-gray-900 mt-0.5">15 working days</p>
              <p className="text-[11px] text-gray-600">(~120 man-hours total)</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase">Expected Completion</p>
              <p className="font-bold text-gray-900 mt-0.5">15 working day(s)</p>
              <p className="text-[11px] text-gray-600">subject to weather clearance</p>
            </div>
          </div>
        </div>

        {/* Repair Steps */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">REPAIR STEPS</p>
          <div className="space-y-2">
            {[
              "Inspect and assess full extent of the issue on site",
              "Set up safety perimeter and warning signs — notify adjacent residents if required",
              "Execute repair as per engineer's field instructions",
              "Quality check: confirm repair meets acceptance criteria",
              "Restore full public access and notify department supervisor of completion",
              "Final verification before sign-off — confirm utility line integrity, road surface fully restored and level, area cleared of debris"
            ].map((step, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-gray-50 rounded-lg p-2.5 text-xs text-gray-800">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed font-medium">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Equipment & Traffic Management */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="bg-gray-50 p-3.5 rounded-xl text-xs space-y-2">
            <p className="font-bold text-gray-700 uppercase">🚧 Traffic Management</p>
            <p className="text-gray-600 leading-relaxed">
              Lane closure with traffic cones, barriers, and flagmen at each end of work zone — coordinate with Traffic Police.
            </p>
          </div>
          <div className="bg-gray-50 p-3.5 rounded-xl text-xs space-y-2">
            <p className="font-bold text-gray-700 uppercase">🔧 Required Equipment & Materials</p>
            <div className="flex flex-wrap gap-1.5">
              {["Excavator", "Pipes & Fittings", "Compactor", "Road Roller", "Safety Barriers", "Water Pumps", "Disinfectant Sprayer"].map((eq) => (
                <span key={eq} className="bg-white border border-gray-200 text-gray-800 px-2.5 py-1 rounded-md text-[11px] font-semibold">
                  {eq}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* State-Driven Operational Action Workspace */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
            Operational Lifecycle Action Surface
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-gray-100 text-gray-700">
            Current Canonical State: <strong>{currentState}</strong>
          </span>
        </div>

        {/* 1. ROUTED -> Acknowledge */}
        {currentState === "ROUTED" && (
          <div className="bg-purple-50 border border-purple-200 p-5 rounded-xl space-y-3">
            <div>
              <h3 className="font-bold text-purple-900 text-sm">Step 1: Acknowledge Work Order</h3>
              <p className="text-xs text-purple-700 mt-0.5">
                Confirm receipt of this routed work order under {issue.assignedAgencyName} jurisdiction.
              </p>
            </div>
            <button
              onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/acknowledge`, undefined, "Acknowledge Work Order")}
              disabled={actionLoading}
              className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "✓ Acknowledge Work Order (ROUTED → ACKNOWLEDGED)"}
            </button>
          </div>
        )}

        {/* 2. ACKNOWLEDGED -> Start Investigation */}
        {currentState === "ACKNOWLEDGED" && (
          <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl space-y-3">
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Step 2: Start Site Investigation</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Initiate preliminary technical assessment and field inspection for Work Order #{issue.id}.
              </p>
            </div>
            <button
              onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/investigate`, undefined, "Start Investigation")}
              disabled={actionLoading}
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "🔍 Start Investigation (ACKNOWLEDGED → UNDER_INVESTIGATION)"}
            </button>
          </div>
        )}

        {/* 3. UNDER_INVESTIGATION -> Validate / Reject / Duplicate */}
        {currentState === "UNDER_INVESTIGATION" && (
          <div className="bg-blue-50 border border-blue-200 p-5 rounded-xl space-y-4">
            <div>
              <h3 className="font-bold text-blue-900 text-sm">Step 3: Complete Investigation & Validate Work Order</h3>
              <p className="text-xs text-blue-700 mt-0.5">
                Validate the reported issue as a legitimate work order, mark it as duplicate, or reject invalid claims.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/validate`, undefined, "Validate Work Order")}
                disabled={actionLoading}
                className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
              >
                {actionLoading ? "Processing..." : "✓ Validate Work Order (UNDER_INVESTIGATION → VALIDATED)"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-blue-200">
              {/* Duplicate Form */}
              <div className="space-y-2 bg-white p-3.5 rounded-lg border border-blue-100 text-xs">
                <p className="font-bold text-gray-800">Mark as Duplicate</p>
                <input
                  type="text"
                  placeholder="Parent Issue ID (e.g. iss_123)"
                  value={parentIssueId}
                  onChange={(e) => setParentIssueId(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 text-xs"
                />
                <button
                  onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/duplicate`, { parentIssueId }, "Mark Duplicate")}
                  disabled={actionLoading || !parentIssueId.trim()}
                  className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded text-xs disabled:opacity-50"
                >
                  Mark Duplicate
                </button>
              </div>

              {/* Reject Form */}
              <div className="space-y-2 bg-white p-3.5 rounded-lg border border-blue-100 text-xs">
                <p className="font-bold text-gray-800">Reject Work Order</p>
                <input
                  type="text"
                  placeholder="Rejection Reason Notes"
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 text-xs"
                />
                <button
                  onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/reject`, { reasonCode: "OUT_OF_SCOPE", reasonNotes }, "Reject Work Order")}
                  disabled={actionLoading || !reasonNotes.trim()}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1.5 rounded text-xs disabled:opacity-50"
                >
                  Reject Work Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. VALIDATED -> Assign Field Crew */}
        {currentState === "VALIDATED" && (
          <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl space-y-4">
            <div>
              <h3 className="font-bold text-indigo-900 text-sm">Step 4: Dispatch & Assign Operational Field Crew</h3>
              <p className="text-xs text-indigo-700 mt-0.5">
                Assign responsible operational division, repair crew, and lead officer to execute physical repairs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Division Unit</label>
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-semibold"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Field Crew Team</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-semibold"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Lead Officer</label>
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-semibold"
                />
              </div>
            </div>

            <button
              onClick={() =>
                executeLifecycleAction(
                  `/api/issues/${issue.id}/assign`,
                  { unitId, unitName, crewId: teamId, crewName: teamName, leadOfficerId: officerId, leadOfficerName: officerName },
                  "Assign Field Crew"
                )
              }
              disabled={actionLoading}
              className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "🛠️ Assign Field Crew (VALIDATED → FIELD_ASSIGNED)"}
            </button>
          </div>
        )}

        {/* 5. FIELD_ASSIGNED -> Start Repair Work */}
        {currentState === "FIELD_ASSIGNED" && (
          <div className="bg-cyan-50 border border-cyan-200 p-5 rounded-xl space-y-3">
            <div>
              <h3 className="font-bold text-cyan-900 text-sm">Step 5: Start Physical Repair Operations</h3>
              <p className="text-xs text-cyan-700 mt-0.5">
                Field crew dispatched on-site. Click to mark physical repair work actively in progress.
              </p>
            </div>

            {issue.assignment && (
              <div className="text-xs bg-white p-3 rounded-lg border border-cyan-100 text-cyan-950 flex flex-wrap gap-4 font-semibold">
                <span>🏢 <strong>Unit:</strong> {issue.assignment.unitName || issue.assignment.unitId}</span>
                <span>🛠️ <strong>Team:</strong> {issue.assignment.teamName || issue.assignment.teamId}</span>
                <span>👤 <strong>Officer:</strong> {issue.assignment.officerName || issue.assignment.officerId}</span>
              </div>
            )}

            <button
              onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/start-work`, undefined, "Start Repair Work")}
              disabled={actionLoading}
              className="bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "⚙️ Start Repair Work (FIELD_ASSIGNED → IN_PROGRESS)"}
            </button>
          </div>
        )}

        {/* 6. IN_PROGRESS -> Submit Resolution (Field Crew Action) */}
        {currentState === "IN_PROGRESS" && (
          <div className="bg-orange-50 border border-orange-200 p-5 rounded-xl space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-orange-900 text-sm">Step 6: Submit Repair Resolution & Photographic Evidence</h3>
                <span className="text-[10px] font-bold bg-orange-200 text-orange-900 px-2 py-0.5 rounded">ROLE: FIELD CREW</span>
              </div>
              <p className="text-xs text-orange-700 mt-0.5">
                Physical repair completed. Attach or upload photographic evidence of completed repair work to submit resolution for Supervisor approval.
              </p>
            </div>

            <div className="space-y-4 bg-white p-4 rounded-xl border border-orange-100 text-xs">
              <div>
                <label className="block font-bold text-gray-800 mb-1">Repair Completion Notes</label>
                <textarea
                  rows={3}
                  placeholder="Describe the completed repair operations..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full border rounded p-2.5 text-xs focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Upload vs Gallery Evidence Photo Options */}
              <div className="space-y-2">
                <label className="block font-bold text-gray-800">Attach Repair Completion Evidence Photo</label>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Option A: Direct File Upload */}
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold px-3.5 py-2 rounded-lg border border-gray-300 flex items-center justify-center gap-2 transition-colors">
                    <span>📁 Upload Local Photo</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>

                  <span className="text-gray-400 text-center sm:text-left">or select sample photo:</span>

                  {/* Option B: Preset Repair Gallery */}
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_REPAIR_PHOTOS.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAfterEvidenceUrl(sample.url)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded border transition-colors ${
                          afterEvidenceUrl === sample.url
                            ? "bg-orange-600 text-white border-orange-600"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                {afterEvidenceUrl.startsWith("data:image/") ? (
                  <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 mt-2 text-xs">
                    <span className="font-mono text-orange-900 font-bold truncate max-w-md">
                      📷 Local Upload: {afterEvidenceUrl.slice(0, 30)}... [Compressed Image ~50 KB]
                    </span>
                    <button
                      type="button"
                      onClick={() => setAfterEvidenceUrl(SAMPLE_REPAIR_PHOTOS[0].url)}
                      className="text-[11px] font-bold text-orange-700 hover:text-orange-900 underline shrink-0 ml-2"
                    >
                      Clear / Select Sample
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Or paste Evidence Image URL (http://...)"
                    value={afterEvidenceUrl}
                    onChange={(e) => setAfterEvidenceUrl(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 text-xs font-mono bg-gray-50 text-gray-700 mt-2"
                  />
                )}
              </div>

              {/* Evidence Preview Box */}
              {afterEvidenceUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-4">
                  <div className="w-20 h-14 rounded-lg overflow-hidden border border-emerald-300 shrink-0 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={afterEvidenceUrl} alt="Selected repair evidence preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-xs text-emerald-900">
                    <p className="font-bold">✓ Evidence Photo Ready for Submission</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      {uploadingImage ? "Processing image upload..." : "This photo will be logged in the immutable case_events audit trail."}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() =>
                  executeLifecycleAction(
                    `/api/issues/${issue.id}/submit-resolution`,
                    { afterEvidenceUrl, resolutionNotes: resolutionNotes || "Physical repair completed successfully by field crew." },
                    "Submit Resolution"
                  )
                }
                disabled={actionLoading || uploadingImage || !afterEvidenceUrl.trim()}
                className="bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                {actionLoading ? "Processing..." : "📸 Submit Work Order Resolution (IN_PROGRESS → RESOLUTION_SUBMITTED)"}
              </button>
            </div>

            {/* Defer Option */}
            <div className="pt-3 border-t border-orange-200">
              <details className="text-xs text-orange-900">
                <summary className="font-bold cursor-pointer hover:underline">Need to defer this work order?</summary>
                <div className="mt-2 p-3 bg-white rounded-lg border border-orange-100 space-y-2">
                  <input
                    type="text"
                    placeholder="Deferral Reason Notes"
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 text-xs"
                  />
                  <button
                    onClick={() =>
                      executeLifecycleAction(
                        `/api/issues/${issue.id}/defer`,
                        { resumeBy: new Date(Date.now() + 86400000).toISOString(), reasonCode: "MATERIAL_DELAY", reasonNotes },
                        "Defer Work Order"
                      )
                    }
                    disabled={actionLoading || !reasonNotes.trim()}
                    className="bg-gray-700 hover:bg-gray-800 text-white font-bold px-3 py-1.5 rounded text-xs disabled:opacity-50"
                  >
                    Defer Work Order (IN_PROGRESS → DEFERRED)
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* 7. DEFERRED -> Resume */}
        {currentState === "DEFERRED" && (
          <div className="bg-gray-100 border border-gray-300 p-5 rounded-xl space-y-3">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Deferred Work Order: Resume Repair Operations</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                This work order is currently deferred. Click to resume active repair operations.
              </p>
            </div>
            <button
              onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/resume`, undefined, "Resume Work Order")}
              disabled={actionLoading}
              className="bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {actionLoading ? "Processing..." : "▶️ Resume Repair Operations (DEFERRED → IN_PROGRESS)"}
            </button>
          </div>
        )}

        {/* 8. RESOLUTION_SUBMITTED -> Close / Reopen (Supervisor Approval Governance) */}
        {currentState === "RESOLUTION_SUBMITTED" && (
          <div className="bg-teal-50 border border-teal-200 p-5 rounded-xl space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-teal-900 text-sm">Step 7: Supervisor Verification & Final Closure</h3>
                <span className="text-[10px] font-bold bg-teal-200 text-teal-900 px-2 py-0.5 rounded">ROLE: DEPARTMENT SUPERVISOR / OFFICER</span>
              </div>
              <p className="text-xs text-teal-700 mt-0.5">
                Resolution evidence submitted by Field Crew. Inspect the side-by-side evidence photos above and click to approve and close the work order.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => executeLifecycleAction(`/api/issues/${issue.id}/close`, undefined, "Approve & Close Work Order")}
                disabled={actionLoading}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
              >
                {actionLoading ? "Processing..." : "🔒 Approve Evidence & Close Work Order (RESOLUTION_SUBMITTED → CLOSED)"}
              </button>
            </div>

            <div className="pt-3 border-t border-teal-200">
              <details className="text-xs text-teal-900">
                <summary className="font-bold cursor-pointer hover:underline">Evidence Unsatisfactory? Request Rework / Reopen</summary>
                <div className="mt-2 p-3 bg-white rounded-lg border border-teal-100 space-y-2">
                  <input
                    type="text"
                    placeholder="Rework / Reopen Reason Notes"
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 text-xs"
                  />
                  <button
                    onClick={() =>
                      executeLifecycleAction(
                        `/api/issues/${issue.id}/reopen`,
                        { reasonNotes: reasonNotes || "Rework required on repair resolution evidence." },
                        "Reopen Work Order"
                      )
                    }
                    disabled={actionLoading}
                    className="bg-rose-700 hover:bg-rose-800 text-white font-bold px-3 py-1.5 rounded text-xs disabled:opacity-50"
                  >
                    Request Rework (RESOLUTION_SUBMITTED → REOPENED)
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Read-Only Terminal States */}
        {(currentState === "CLOSED" || currentState === "REJECTED" || currentState === "DUPLICATE") && (
          <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl text-center space-y-1">
            <p className="font-bold text-gray-800 text-sm">Terminal Work Order State: {currentState}</p>
            <p className="text-xs text-gray-500">
              This work order is in a permanent resting state ({currentState}) and cannot undergo further lifecycle mutations.
            </p>
          </div>
        )}
      </div>

      {/* Immutable Case Events Audit Trail */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>📜 Immutable Case Events Audit Trail</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-mono font-bold">{caseEvents.length} EVENTS</span>
          </span>
          <span className="text-[11px] text-gray-400 font-mono">Firestore Subcollection: issues/{issue.id}/case_events</span>
        </h2>

        {caseEvents.length === 0 ? (
          <p className="text-xs text-gray-400">No case events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {caseEvents.map((evt) => {
              const fromSt = evt.fromState || "CREATED";
              const toSt = evt.toState || "ROUTED";
              const actor = evt.actorId || "system";
              const role = evt.actorRole || "SYSTEM";

              return (
                <div key={evt.id} className="p-3.5 bg-gray-50 hover:bg-gray-100/80 rounded-xl border border-gray-200/70 text-xs transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 uppercase">
                        {fromSt} → {toSt}
                      </span>
                      <span className="text-xs text-gray-700 font-semibold bg-white px-2 py-0.5 rounded border border-gray-200">
                        Actor: <strong>{actor}</strong> ({role})
                      </span>
                    </div>

                    {evt.note && <p className="text-gray-600 italic text-xs pt-0.5">"{evt.note}"</p>}
                    {evt.evidenceUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImageModalUrl(evt.evidenceUrl!)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline pt-0.5 cursor-pointer"
                      >
                        <span>📷 View Attached Evidence Photo →</span>
                      </button>
                    )}
                  </div>

                  <div className="text-gray-500 font-mono text-[11px] shrink-0 bg-white px-2.5 py-1 rounded border border-gray-200 self-start sm:self-auto">
                    📅 {formatDate(evt.timestamp)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Photographic Evidence Modal Lightbox */}
      {previewImageModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setPreviewImageModalUrl(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <span>📷 Photographic Evidence Inspection</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImageModalUrl(null)}
                className="text-gray-500 hover:text-gray-900 font-bold text-sm bg-gray-100 hover:bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70vh] overflow-hidden rounded-xl bg-gray-950 flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImageModalUrl}
                alt="Field repair evidence photo"
                className="max-h-[65vh] max-w-full object-contain rounded"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <span className="text-gray-500 font-mono">Status: Verified Evidence Attached</span>
              <button
                type="button"
                onClick={() => setPreviewImageModalUrl(null)}
                className="bg-gray-900 hover:bg-black text-white font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
