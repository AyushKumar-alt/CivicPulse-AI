"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/lib/firebase/auth";

interface OverviewSummary {
  totalIssues: number;
  activeIssues: number;
  criticalIssues: number;
  resolvedIssues: number;
  unresolvedRoutingCount: number;
}

interface CitySummary {
  cityId: string;
  name: string;
  totalIssues: number;
  activeIssues: number;
  criticalIssues: number;
  resolvedIssues: number;
}

export default function GlobalCommandCenterPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [cities, setCities] = useState<CitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchOverview() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/command-center/overview", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to load overview metrics`);
        }
        const data = await res.json();
        setSummary(data.summary);
        setCities(data.cities || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchOverview();
    const interval = setInterval(fetchOverview, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("[SIGN OUT ERROR]", err);
    } finally {
      window.location.href = "/sign-in";
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
        Loading Global Command Center metrics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
          <p className="font-semibold">Access Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">CIVICPULSE OPERATIONS</span>
          <h1 className="text-3xl font-extrabold text-gray-900 mt-1">Global Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time civic infrastructure surveillance & jurisdiction monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            LIVE FIRESTORE ENGINE
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-semibold px-3.5 py-1.5 rounded-lg transition-colors border border-red-200"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">TOTAL REPORTS</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{summary?.totalIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-amber-600 font-medium">ACTIVE BACKLOG</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{summary?.activeIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-rose-600 font-medium">CRITICAL ALERTS</p>
          <p className="text-3xl font-black text-rose-600 mt-1">{summary?.criticalIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-emerald-600 font-medium">RESOLVED ISSUES</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{summary?.resolvedIssues ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-300 bg-amber-50/50 shadow-sm">
          <p className="text-xs text-amber-800 font-medium">UNRESOLVED ROUTING</p>
          <p className="text-3xl font-black text-amber-900 mt-1">{summary?.unresolvedRoutingCount ?? 0}</p>
        </div>
      </div>

      {/* City Operations Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Municipal Operations</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cities.map((city) => (
            <Link
              key={city.cityId}
              href={`/command-center/cities/${city.cityId}`}
              className="group bg-white rounded-2xl border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {city.name} Operations
                  </h3>
                  <p className="text-xs text-gray-400">Jurisdiction Region: {city.cityId}</p>
                </div>
                <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                <div>
                  <p className="text-xs text-gray-400">Active</p>
                  <p className="text-base font-bold text-gray-900">{city.activeIssues}</p>
                </div>
                <div>
                  <p className="text-xs text-rose-500">Critical</p>
                  <p className="text-base font-bold text-rose-600">{city.criticalIssues}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-500">Resolved</p>
                  <p className="text-base font-bold text-emerald-600">{city.resolvedIssues}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
