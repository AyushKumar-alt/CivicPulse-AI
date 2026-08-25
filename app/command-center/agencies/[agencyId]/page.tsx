"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function AgencyOperationsPage({ params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<{ agencyId: string; statistics: any; severityDistribution: any; statusDistribution: any; issues: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overrideIssueId, setOverrideIssueId] = useState<string | null>(null);
  const [newAgencyId, setNewAgencyId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    async function fetchAgencyData() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/command-center/agencies/${agencyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load agency data`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchAgencyData();
    const interval = setInterval(fetchAgencyData, 5000);
    return () => clearInterval(interval);
  }, [user, agencyId]);

  async function handleOverrideSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideIssueId || !newAgencyId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/issues/${overrideIssueId}/routing/override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newAgencyId, reason: overrideReason }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Routing override failed");
      }
      alert(`Successfully rerouted issue ${overrideIssueId} to ${newAgencyId}`);
      setOverrideIssueId(null);
      setNewAgencyId("");
      setOverrideReason("");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">Loading agency operations...</div>;
  if (error) return <div className="max-w-7xl mx-auto px-4 py-12 text-red-600">Error: {error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Breadcrumbs & Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/command-center" className="hover:underline">Global Command Center</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium font-mono">{agencyId}</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">Agency Queue: {agencyId}</h1>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">TOTAL AGENCY ISSUES</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{data?.statistics?.totalIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-amber-600 font-medium">ACTIVE BACKLOG</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{data?.statistics?.activeIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-rose-600 font-medium">CRITICAL ALERTS</p>
          <p className="text-3xl font-black text-rose-600 mt-1">{data?.statistics?.criticalIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-emerald-600 font-medium">RESOLVED</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{data?.statistics?.resolvedIssues ?? 0}</p>
        </div>
      </div>

      {/* Issue Table / List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b bg-gray-50 font-bold text-gray-800 text-sm">
          Agency Issue Workstream ({data?.issues.length ?? 0} Records)
        </div>
        <div className="divide-y divide-gray-100">
          {data?.issues.map((issue) => (
            <div key={issue.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-700">{issue.id}</span>
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    {issue.aiObservations?.visualSeverity || issue.ai?.severity || "medium"}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{issue.primaryStatus}</span>
                </div>
                <p className="font-bold text-gray-900">{issue.aiObservations?.issueTypeDisplayName || issue.ai?.summary || issue.rawDescription}</p>
                <p className="text-xs text-gray-500 mt-0.5">{issue.location?.fullAddress || issue.location?.localityName}</p>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/issues/${issue.id}`} className="text-xs text-blue-600 hover:underline font-semibold">
                  View Detail →
                </Link>
                <button
                  onClick={() => setOverrideIssueId(issue.id)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Override Routing
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Override Routing Modal */}
      {overrideIssueId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleOverrideSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Manual Routing Override</h3>
            <p className="text-xs text-gray-500">Overriding issue <span className="font-mono text-gray-800">{overrideIssueId}</span>. The original deterministic decision will remain auditable in historical logs.</p>
            
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Target Agency ID</label>
              <input
                type="text"
                placeholder="e.g. bengaluru_bbmp"
                value={newAgencyId}
                onChange={(e) => setNewAgencyId(e.target.value)}
                className="w-full text-sm border rounded-lg p-2 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Override Reason</label>
              <textarea
                placeholder="Reason for manual jurisdiction change..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full text-sm border rounded-lg p-2"
                rows={3}
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideIssueId(null)}
                className="text-xs text-gray-600 px-4 py-2 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg"
              >
                Submit Override
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
