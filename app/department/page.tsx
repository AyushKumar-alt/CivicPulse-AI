"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/lib/firebase/auth";
import { getAgencyByEmail } from "@/lib/municipal";

interface OperationalAssignment {
  unitId?: string;
  unitName?: string;
  teamId?: string;
  teamName?: string;
  officerId?: string;
  officerName?: string;
  assignedAt?: string;
  assignedBy?: string;
}

interface CanonicalCivicIssue {
  id: string;
  reporterUid: string;
  state: string;
  primaryStatus?: string;
  departmentStage?: string;
  assignedAgencyId: string;
  assignedAgencyName: string;
  cityCode?: string;
  rawDescription: string;
  imageUrl?: string;
  submittedAt: string;
  updatedAt: string;
  location?: {
    fullAddress?: string;
    localityName?: string;
    cityId?: string;
    latitude?: number;
    longitude?: number;
  };
  aiObservations?: {
    visualSeverity?: string;
    issueTypeDisplayName?: string;
    summaryDescription?: string;
    confidenceScore?: number;
  };
  assignment?: OperationalAssignment;
}

export default function DepartmentPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [issues, setIssues] = useState<CanonicalCivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedIssue, setSelectedIssue] = useState<CanonicalCivicIssue | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);

  // Form states for Assignment
  const [unitId, setUnitId] = useState("yelahanka_div");
  const [unitName, setUnitName] = useState("Yelahanka Division");
  const [teamId, setTeamId] = useState("crew_04");
  const [teamName, setTeamName] = useState("Electrical Crew 04");
  const [officerId, setOfficerId] = useState("officer_101");
  const [officerName, setOfficerName] = useState("Ravi Kumar");

  // Form state for Resolution
  const [resolutionSummary, setResolutionSummary] = useState("");

  const agencyObj = user?.email ? getAgencyByEmail(user.email) : null;
  const agencyName = agencyObj?.name || "Department Portal";
  const agencyId = agencyObj?.agency_id || "bengaluru_bescom";

  const fetchDepartmentIssues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/department/issues", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to fetch department issues`);
      }
      const data = await res.json();
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in");
    } else if (user) {
      fetchDepartmentIssues();
      const interval = setInterval(fetchDepartmentIssues, 5000);
      return () => clearInterval(interval);
    }
  }, [user, authLoading, router, fetchDepartmentIssues]);

  // Operational Action Handlers — Each invoking exactly one canonical LifecycleService route
  async function callLifecycleEndpoint(endpoint: string, payload?: Record<string, unknown>, errorMessage = "Action failed") {
    if (!user) return;
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
        throw new Error(errJson.error || errorMessage);
      }
      fetchDepartmentIssues();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAcknowledge(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/acknowledge`, undefined, "Acknowledge failed");
  }

  async function handleStartInvestigation(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/investigate`, undefined, "Start Investigation failed");
  }

  async function handleValidate(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/validate`, undefined, "Validation failed");
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIssue) return;
    await callLifecycleEndpoint(
      `/api/issues/${selectedIssue.id}/assign`,
      { unitId, unitName, teamId, teamName, officerId, officerName },
      "Assignment failed"
    );
    setAssignModalOpen(false);
  }

  async function handleStartWork(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/start-work`, undefined, "Start Repair failed");
  }

  async function handleDefer(issueId: string) {
    await callLifecycleEndpoint(
      `/api/issues/${issueId}/defer`,
      { reasonCode: "OPERATIONAL_PAUSE", resumeBy: new Date(Date.now() + 86400000).toISOString() },
      "Deferral failed"
    );
  }

  async function handleResume(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/resume`, undefined, "Resume failed");
  }

  async function handleResolveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIssue) return;
    await callLifecycleEndpoint(
      `/api/issues/${selectedIssue.id}/submit-resolution`,
      {
        afterEvidenceUrl: "https://placeholder.civicpulse.ai/repaired.jpg",
        resolutionNotes: resolutionSummary || "Work order completed & verified",
      },
      "Resolution submission failed"
    );
    setResolveModalOpen(false);
    setResolutionSummary("");
  }

  async function handleClose(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/close`, undefined, "Verification & Close failed");
  }

  async function handleReopen(issueId: string) {
    await callLifecycleEndpoint(`/api/issues/${issueId}/reopen`, { reasonCode: "INCOMPLETE_REPAIR" }, "Reopen failed");
  }

  const activeCount = issues.filter((i) => i.state !== "CLOSED" && i.state !== "REJECTED").length;
  const criticalCount = issues.filter((i) => (i.aiObservations?.visualSeverity || "medium") === "critical" && i.state !== "CLOSED").length;
  const assignedCount = issues.filter((i) => (i.state === "FIELD_ASSIGNED" || i.assignment?.teamId) && i.state !== "CLOSED").length;
  const resolvedCount = issues.filter((i) => i.state === "CLOSED").length;

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
        Loading Department Operational Portal...
      </div>
    );
  }

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("[SIGN OUT ERROR]", err);
    } finally {
      window.location.href = "/sign-in";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">REGIONAL OPERATIONAL PORTAL</span>
          <h1 className="text-3xl font-extrabold text-gray-900 mt-1">{agencyName}</h1>
          <p className="text-xs text-gray-500 font-mono mt-0.5">Jurisdiction Scope: {agencyId} ({user?.email})</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDepartmentIssues()}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            🔄 Refresh Queue
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
          <p className="font-semibold">Portal Notification</p>
          <p>{error}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-amber-600 font-medium">ACTIVE BACKLOG</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-rose-600 font-medium">CRITICAL ALERTS</p>
          <p className="text-3xl font-black text-rose-600 mt-1">{criticalCount}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-blue-600 font-medium">CREW ASSIGNED</p>
          <p className="text-3xl font-black text-blue-600 mt-1">{assignedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-emerald-600 font-medium">RESOLVED WORK ORDERS</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{resolvedCount}</p>
        </div>
      </div>

      {/* Department Issue Workstream Queue */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-sm">Agency Work Order Backlog ({issues.length} Issues)</h2>
          <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            Server-Enforced Scope: {agencyId}
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            ⚡ No issues currently assigned to {agencyName}.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {issues.map((issue) => {
              const sev = issue.aiObservations?.visualSeverity || "medium";
              const currentState = issue.state || "ROUTED";

              return (
                <div key={issue.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-700">{issue.id}</span>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        sev === "critical" ? "bg-rose-100 text-rose-800" : sev === "high" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        {sev}
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full font-extrabold uppercase border border-purple-200">
                        STATE: {currentState}
                      </span>
                    </div>

                    <h3 className="font-bold text-gray-900 text-base">
                      {issue.aiObservations?.issueTypeDisplayName || issue.rawDescription}
                    </h3>
                    
                    <p className="text-xs text-gray-500">
                      📍 {issue.location?.fullAddress || issue.location?.localityName || "Location captured"}
                    </p>

                    {issue.assignment && (
                      <div className="text-xs bg-blue-50 border border-blue-100 rounded-lg p-2 text-blue-900 flex items-center gap-4">
                        <span>🏢 <strong>Unit:</strong> {issue.assignment.unitName || issue.assignment.unitId}</span>
                        <span>🛠️ <strong>Team:</strong> {issue.assignment.teamName || issue.assignment.teamId}</span>
                        <span>👤 <strong>Officer:</strong> {issue.assignment.officerName || issue.assignment.officerId}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Column — Strictly mapped to canonical state machine transitions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/department/issues/${issue.id}`}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg shadow-sm transition-colors"
                    >
                      Inspect Work Order →
                    </Link>

                    {/* ROUTED -> Acknowledge */}
                    {currentState === "ROUTED" && (
                      <button
                        onClick={() => handleAcknowledge(issue.id)}
                        className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-3 py-2 rounded-lg border border-amber-200 transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}

                    {/* ACKNOWLEDGED -> Start Investigation */}
                    {currentState === "ACKNOWLEDGED" && (
                      <button
                        onClick={() => handleStartInvestigation(issue.id)}
                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold px-3 py-2 rounded-lg border border-blue-200 transition-colors"
                      >
                        Start Investigation
                      </button>
                    )}

                    {/* UNDER_INVESTIGATION -> Validate */}
                    {currentState === "UNDER_INVESTIGATION" && (
                      <button
                        onClick={() => handleValidate(issue.id)}
                        className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-semibold px-3 py-2 rounded-lg border border-indigo-200 transition-colors"
                      >
                        Validate Issue
                      </button>
                    )}

                    {/* VALIDATED -> Assign Crew */}
                    {currentState === "VALIDATED" && (
                      <button
                        onClick={() => {
                          setSelectedIssue(issue);
                          setAssignModalOpen(true);
                        }}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
                      >
                        Assign Crew
                      </button>
                    )}

                    {/* FIELD_ASSIGNED or REOPENED -> Start Repair */}
                    {(currentState === "FIELD_ASSIGNED" || currentState === "REOPENED") && (
                      <button
                        onClick={() => handleStartWork(issue.id)}
                        className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
                      >
                        Start Repair
                      </button>
                    )}

                    {/* IN_PROGRESS -> Defer or Mark Resolved */}
                    {currentState === "IN_PROGRESS" && (
                      <>
                        <button
                          onClick={() => handleDefer(issue.id)}
                          className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          Defer Work
                        </button>
                        <button
                          onClick={() => {
                            setSelectedIssue(issue);
                            setResolveModalOpen(true);
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          Mark Resolved
                        </button>
                      </>
                    )}

                    {/* DEFERRED -> Resume Work */}
                    {currentState === "DEFERRED" && (
                      <button
                        onClick={() => handleResume(issue.id)}
                        className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
                      >
                        Resume Work
                      </button>
                    )}

                    {/* RESOLUTION_SUBMITTED -> Verify & Close or Reopen */}
                    {currentState === "RESOLUTION_SUBMITTED" && (
                      <>
                        <button
                          onClick={() => handleClose(issue.id)}
                          className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          Verify & Close
                        </button>
                        <button
                          onClick={() => handleReopen(issue.id)}
                          className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          Reopen Issue
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {assignModalOpen && selectedIssue && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAssignSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Assign Operational Crew</h3>
            <p className="text-xs text-gray-500">Assigning issue <span className="font-mono text-gray-800">{selectedIssue.id}</span> to field team (moves state to <span className="font-bold text-purple-700">FIELD_ASSIGNED</span>).</p>
            
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Operational Division (unitId)</label>
                <input
                  type="text"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Field Crew / Team (crewId)</label>
                <input
                  type="text"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Lead Officer ID (leadOfficerId)</label>
                <input
                  type="text"
                  value={officerId}
                  onChange={(e) => setOfficerId(e.target.value)}
                  className="w-full border rounded-lg p-2 font-mono text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="text-xs text-gray-600 hover:bg-gray-100 px-4 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
              >
                Confirm Crew Assignment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resolution Modal */}
      {resolveModalOpen && selectedIssue && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleResolveSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Submit Resolution</h3>
            <p className="text-xs text-gray-500">Submitting repair resolution for issue <span className="font-mono text-gray-800">{selectedIssue.id}</span> (moves state to <span className="font-bold text-purple-700">RESOLUTION_SUBMITTED</span>).</p>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Resolution Summary & Evidence Notes</label>
              <textarea
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Describe completed repair actions, materials used, and safety verification..."
                rows={4}
                className="w-full border rounded-lg p-2 text-sm text-gray-800"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResolveModalOpen(false)}
                className="text-xs text-gray-600 hover:bg-gray-100 px-4 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold"
              >
                Submit Resolution Work Order
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
