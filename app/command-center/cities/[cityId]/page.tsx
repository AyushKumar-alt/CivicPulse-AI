"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface AgencySummary {
  agencyId: string;
  agencyName: string;
  activeIssues: number;
  criticalIssues: number;
  resolvedIssues: number;
  totalIssues: number;
}

export default function CityOperationsPage({ params }: { params: Promise<{ cityId: string }> }) {
  const { cityId } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<{ cityName: string; statistics: any; agencies: AgencySummary[]; issues: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchCityData() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/command-center/cities/${cityId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load city data`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchCityData();
    const interval = setInterval(fetchCityData, 5000);
    return () => clearInterval(interval);
  }, [user, cityId]);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">Loading {cityId} operations...</div>;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
          <p className="font-semibold">Error Loading City Operations</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Breadcrumbs & Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/command-center" className="hover:underline">Global Command Center</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">{data?.cityName} Operations</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">{data?.cityName} Operations</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">TOTAL CITY REPORTS</p>
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

      {/* Agency Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Responsible Regional Agencies</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.agencies.map((agency) => (
            <Link
              key={agency.agencyId}
              href={`/command-center/agencies/${agency.agencyId}`}
              className="group bg-white rounded-2xl border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {agency.agencyName}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">{agency.agencyId}</p>
                </div>
                <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                <div>
                  <p className="text-xs text-gray-400">Active</p>
                  <p className="text-base font-bold text-gray-900">{agency.activeIssues}</p>
                </div>
                <div>
                  <p className="text-xs text-rose-500">Critical</p>
                  <p className="text-base font-bold text-rose-600">{agency.criticalIssues}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-500">Resolved</p>
                  <p className="text-base font-bold text-emerald-600">{agency.resolvedIssues}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
