"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useRequireAuth } from "@/lib/hooks/useRequireAuth";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { logout } from "@/lib/firebase/auth";
import { DEPARTMENT_LIST, getDepartmentByKey } from "@/lib/departments";
import type { DepartmentKey } from "@/lib/departments";
import { getGreeting } from "@/lib/time/getGreeting";
import type { GovernanceDecision, GovernanceReport, ReworkOrder, AccountabilityReport } from "@/lib/ai/generateGovernanceReview";
import { collection, getDocs, doc, updateDoc, deleteDoc, orderBy, query, arrayUnion, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

const IssueMap = dynamic(() => import("@/components/IssueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 bg-gray-100 rounded-xl flex items-center justify-center">
      <p className="text-xs text-gray-400">Loading map…</p>
    </div>
  ),
});

type IssueStatus =
  | "processing"
  | "analyzed"
  | "assigned"
  | "in_progress"
  | "pending_verification"
  | "resolved"
  | "rejected";

type FilterKey =
  | "all"
  | "processing"
  | "analyzed"
  | "assigned"
  | "in_progress"
  | "pending_verification"
  | "resolved"
  | "rejected"
  | "escalated";

interface EscalationBrief {
  title: string;
  location: string;
  risk_summary: string;
  affected_population_estimate: string;
  recommended_action: string;
  urgency_level: "immediate" | "urgent" | "high";
  generated_at?: { seconds: number };
}

interface IssueRecord {
  id: string;
  status: IssueStatus;
  image_url: string;
  raw_description: string;
  submitted_at: number | null;
  confirmation_count: number;
  escalated: boolean;
  escalation_reason: string | null;
  escalation_brief?: EscalationBrief | null;
  duplicate_candidate?: boolean;
  duplicate_of?: string | null;
  duplicate_distance_meters?: number | null;
  // Area intelligence
  area_category?: string | null;
  area_confidence?: number | null;
  // Community intelligence
  citizen_concern_level?: "low" | "medium" | "high" | null;
  community_summary?: string | null;
  comment_count?: number;
  // Department assignment
  assigned_department?: string | null;
  assigned_department_name?: string | null;
  assigned_at?: number | null;
  assignment_method?: string | null;
  // Department operations
  department_status?: string | null;
  department_progress?: {
    stage: string;
    timestamp: unknown;
    notes: string | null;
    updated_by: string;
  }[];
  verification?: {
    confidence: number;
    recommendation: "approve" | "needs_inspection" | "needs_rework";
    reasoning: string;
    concerns: string[];
    repair_type: string;
    repair_notes: string;
    after_image_url: string | null;
  } | null;
  governance?: {
    report: GovernanceReport | null;
    generated_at: number | null;
    accountability: AccountabilityReport | null;
    rework_order: ReworkOrder | null;
    officer_override: {
      original_ai_decision: string;
      officer_decision: string;
      reason: string;
      officer_email: string;
    } | null;
  } | null;
  location: {
    lat: number;
    lng: number;
    address?: string | null;
    area_name?: string | null;
    zone_type?: string | null;
  } | null;
  ai: {
    issue_type: string;
    severity: string;
    confidence: number;
    summary: string;
    responsible_authority: string;
    safety_risk?: string;
    error?: string;
    priority_score?: number;
    estimated_population_impact?: string;
  } | null;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-green-100 text-green-800",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  analyzed: "Analyzed",
  assigned: "Assigned",
  in_progress: "In Progress",
  pending_verification: "Pending Verification",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-blue-100 text-blue-800",
  analyzed: "bg-purple-100 text-purple-800",
  assigned: "bg-teal-100 text-teal-800",
  in_progress: "bg-orange-100 text-orange-800",
  pending_verification: "bg-sky-100 text-sky-800",
  resolved: "bg-green-100 text-green-800",
  rejected: "bg-gray-100 text-gray-600",
};

const URGENCY_STYLE: Record<string, string> = {
  immediate: "bg-red-600 text-white",
  urgent: "bg-orange-500 text-white",
  high: "bg-yellow-400 text-gray-900",
};

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "analyzed", label: "Analyzed" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "pending_verification", label: "🔍 Verify" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "escalated", label: "⚡ Escalated" },
];

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#f97316", "#22c55e", "#ef4444", "#6b7280", "#06b6d4"];

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

const CONCERN_STYLE: Record<string, { bg: string; label: string }> = {
  high: { bg: "bg-red-100 text-red-800 border-red-200", label: "HIGH" },
  medium: { bg: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "MEDIUM" },
  low: { bg: "bg-green-100 text-green-800 border-green-200", label: "LOW" },
};

// ── Analytics ─────────────────────────────────────────────────────────────────

function AnalyticsDashboard({ issues }: { issues: IssueRecord[] }) {
  const total = issues.length;
  const resolved = issues.filter((i) => i.status === "resolved").length;
  const open = issues.filter((i) => !["resolved", "rejected"].includes(i.status)).length;
  const escalated = issues.filter((i) => i.escalated).length;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const byCategory = Object.entries(
    issues.reduce((acc, i) => {
      const t = i.ai?.issue_type ?? "Unanalyzed";
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const bySeverity = (["critical", "high", "medium", "low"] as const)
    .map((sev) => ({
      name: sev.charAt(0).toUpperCase() + sev.slice(1),
      value: issues.filter((i) => i.ai?.severity === sev).length,
      fill: SEVERITY_COLOR[sev],
    }))
    .filter((d) => d.value > 0);

  if (total === 0) return null;

  return (
    <div className="bg-white border-b border-gray-100 px-6 py-5">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Issues" value={total} color="text-gray-900" />
        <StatCard label="Open" value={open} color="text-blue-700" />
        <StatCard label="Resolved" value={resolved} color="text-green-700" />
        <StatCard label="Escalated" value={escalated} color="text-orange-700" />
        <StatCard label="Resolution Rate" value={`${rate}%`} color="text-purple-700" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {byCategory.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Issues by Category
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  cursor={{ fill: "#f3f4f6" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {bySeverity.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Issues by Severity
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={bySeverity}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {bySeverity.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Morning Briefing Card ──────────────────────────────────────────────────────

function MorningBriefingCard({
  briefing,
  loading,
}: {
  briefing: string | null;
  loading: boolean;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const greeting = getGreeting();

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700">
      <div className="px-6 py-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-base">{greeting.icon}</span>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                {greeting.title}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{dateStr} · {timeStr}</p>
          </div>
          <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded font-mono">
            AI AGENT
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <p className="text-xs text-gray-400 animate-pulse">Generating situational briefing…</p>
          </div>
        ) : briefing ? (
          <p className="text-sm text-gray-100 leading-relaxed">{briefing}</p>
        ) : (
          <p className="text-xs text-gray-500 italic">Briefing not available — check Gemini quota.</p>
        )}
      </div>
    </div>
  );
}

// ── Department Overview Cards ──────────────────────────────────────────────────

interface DeptStats {
  open: number;
  critical: number;
  escalated: number;
}

function DepartmentOverview({
  stats,
  activeFilter,
  onFilter,
}: {
  stats: Record<string, DeptStats>;
  activeFilter: DepartmentKey | null;
  onFilter: (key: DepartmentKey | null) => void;
}) {
  return (
    <div className="bg-white border-b border-gray-100 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Department Overview
        </p>
        {activeFilter && (
          <button
            type="button"
            onClick={() => onFilter(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {DEPARTMENT_LIST.map((dept) => {
          const s = stats[dept.key] ?? { open: 0, critical: 0, escalated: 0 };
          const isActive = activeFilter === dept.key;
          return (
            <button
              key={dept.key}
              type="button"
              onClick={() => onFilter(isActive ? null : dept.key)}
              className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                isActive
                  ? `${dept.bgClass} ${dept.borderClass} ring-2 ring-offset-1 ring-current`
                  : `bg-white border-gray-200 hover:${dept.bgClass} hover:border-gray-300`
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">{dept.icon}</span>
                <span className={`text-xs font-semibold ${dept.textClass} leading-tight`}>
                  {dept.name.replace(" Department", "").replace("Public Works", "Public Works")}
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">
                  <span className="font-bold text-gray-900">{s.open}</span> open
                </p>
                {s.critical > 0 && (
                  <p className="text-xs text-red-600 font-medium">
                    {s.critical} critical
                  </p>
                )}
                {s.escalated > 0 && (
                  <p className="text-xs text-orange-600 font-medium">
                    {s.escalated} escalated
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function IssueDetailModal({
  issue,
  onClose,
  onStatusChange,
  updating,
  onDelete,
  deleting,
}: {
  issue: IssueRecord;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  updating: boolean;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}) {
  const loc = issue.location;
  const brief = issue.escalation_brief;
  const urgencyStyle = brief ? (URGENCY_STYLE[brief.urgency_level] ?? URGENCY_STYLE.high) : "";
  const deptInfo = issue.assigned_department
    ? getDepartmentByKey(issue.assigned_department)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl overflow-y-auto"
        style={{ maxHeight: "90vh" }}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
          <p className="font-semibold text-sm text-gray-900 truncate mr-4">
            {issue.ai?.issue_type ?? "Issue Details"}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this issue permanently? This cannot be undone.")) {
                    onDelete(issue.id);
                  }
                }}
                disabled={deleting}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors font-medium"
              >
                {deleting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {issue.image_url && (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={issue.image_url} alt="" className="w-full h-48 object-cover" />
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900">{issue.ai?.issue_type ?? "Unanalyzed"}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {issue.ai?.severity && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                    {issue.ai.severity}
                  </span>
                )}
                {issue.escalated && (
                  <span className="text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">
                    ⚡ Escalated
                  </span>
                )}
                {issue.duplicate_candidate && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                    ⚠️ Duplicate
                  </span>
                )}
                {deptInfo && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${deptInfo.badgeClass}`}>
                    {deptInfo.icon} {deptInfo.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[issue.status] ?? ""}`}>
                {STATUS_LABEL[issue.status] ?? issue.status}
              </span>
              <select
                value={issue.status}
                onChange={(e) => onStatusChange(issue.id, e.target.value)}
                disabled={updating}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
              >
                <option value="processing">Processing</option>
                <option value="analyzed">Analyzed</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {issue.ai?.summary && (
            <p className="text-sm text-gray-700 leading-relaxed">{issue.ai.summary}</p>
          )}

          {/* Department assignment info */}
          {deptInfo && issue.assignment_method && (
            <div className={`rounded-xl border px-4 py-3 ${deptInfo.bgClass} ${deptInfo.borderClass}`}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Department Assignment
              </p>
              <div className="flex items-center gap-2">
                <span className="text-base">{deptInfo.icon}</span>
                <div>
                  <p className={`text-sm font-semibold ${deptInfo.textClass}`}>{deptInfo.name}</p>
                  <p className="text-xs text-gray-500">{issue.assignment_method}</p>
                </div>
              </div>
            </div>
          )}

          {loc && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Location</p>
              {loc.address && (
                <p className="text-sm text-gray-800 font-medium">{loc.address}</p>
              )}
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
              </p>
            </div>
          )}

          {loc && (
            <IssueMap
              lat={loc.lat}
              lng={loc.lng}
              issueType={issue.ai?.issue_type}
              address={loc.address}
              severity={issue.ai?.severity}
              height="200px"
            />
          )}

          {brief && (
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-gray-900">
              <div className="px-4 py-2.5 bg-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-orange-400 text-sm">⚡</span>
                  <span className="text-xs font-bold text-gray-100 uppercase tracking-widest">
                    Escalation Brief
                  </span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${urgencyStyle}`}>
                  {brief.urgency_level}
                </span>
              </div>
              <div className="px-4 py-3 space-y-3">
                <p className="text-white font-semibold text-sm">{brief.title}</p>
                <MBriefRow label="Risk" value={brief.risk_summary} />
                <MBriefRow label="Affected" value={brief.affected_population_estimate} />
                <MBriefRow label="Action" value={brief.recommended_action} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {issue.confirmation_count > 0
                ? `✓ ${issue.confirmation_count} community confirmation${issue.confirmation_count === 1 ? "" : "s"}`
                : "No community confirmations"}
            </p>
            <Link
              href={`/issues/${issue.id}`}
              className="text-xs text-blue-600 hover:underline font-medium"
              onClick={onClose}
            >
              Full detail page →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function MBriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs text-gray-200 leading-relaxed">{value}</p>
    </div>
  );
}

// ── Governance Decision styling ───────────────────────────────────────────────

const GOV_DECISION_STYLE: Record<GovernanceDecision, { bg: string; text: string; border: string; label: string; icon: string }> = {
  APPROVE_RESOLUTION: { bg: "bg-green-50", text: "text-green-800", border: "border-green-200", label: "Approve Resolution", icon: "✓" },
  RETURN_FOR_REWORK: { bg: "bg-red-50", text: "text-red-800", border: "border-red-200", label: "Return for Rework", icon: "↩" },
  REQUEST_DEPARTMENT_EXPLANATION: { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200", label: "Request Explanation", icon: "⚠" },
  ESCALATE_TO_HIGHER_AUTHORITY: { bg: "bg-red-100", text: "text-red-900", border: "border-red-300", label: "Escalate to Higher Authority", icon: "🔺" },
  REQUIRES_MANUAL_INSPECTION: { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-200", label: "Requires Manual Inspection", icon: "🔍" },
  INVALID_CITIZEN_REPORT: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", label: "Invalid Report", icon: "✕" },
};

const DEPT_PERF_STYLE: Record<string, { color: string; label: string }> = {
  excellent: { color: "text-green-700", label: "Excellent" },
  satisfactory: { color: "text-blue-700", label: "Satisfactory" },
  needs_improvement: { color: "text-yellow-700", label: "Needs Improvement" },
  unsatisfactory: { color: "text-red-700", label: "Unsatisfactory" },
};

// ── Verification Card (Command Center — Governance Review UI) ─────────────────

function VerificationCard({
  issue,
  onDecision,
  onGenerateGovernance,
  deciding,
  generatingGov,
  user,
}: {
  issue: IssueRecord;
  onDecision: (id: string, decision: "approve" | "reject", govDecision: GovernanceDecision, isOverride: boolean, overrideReason?: string) => void;
  onGenerateGovernance: (id: string) => void;
  deciding: boolean;
  generatingGov: boolean;
  user: import("firebase/auth").User;
}) {
  const v = issue.verification;
  const gov = issue.governance;
  const report = gov?.report ?? null;
  const deptInfo = issue.assigned_department ? getDepartmentByKey(issue.assigned_department) : null;

  const [showOverride, setShowOverride] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<"approve" | "reject">("approve");
  const [overrideReason, setOverrideReason] = useState("");

  const recColor: Record<string, string> = {
    approve: "bg-green-100 text-green-800 border-green-200",
    needs_inspection: "bg-yellow-100 text-yellow-800 border-yellow-200",
    needs_rework: "bg-red-100 text-red-800 border-red-200",
  };
  const recLabel: Record<string, string> = {
    approve: "✓ Technical Verification: Approved",
    needs_inspection: "⚠ Technical Verification: Needs Inspection",
    needs_rework: "✗ Technical Verification: Needs Rework",
  };

  const govStyle = report ? (GOV_DECISION_STYLE[report.decision] ?? GOV_DECISION_STYLE.REQUIRES_MANUAL_INSPECTION) : null;
  const perfStyle = report ? (DEPT_PERF_STYLE[report.department_performance] ?? DEPT_PERF_STYLE.satisfactory) : null;

  void user; // used via parent for token

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-sky-50 border-b border-sky-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sky-600">🔍</span>
          <span className="font-semibold text-sm text-gray-900 truncate">
            {issue.ai?.issue_type ?? "Issue"} — Pending Verification
          </span>
          {report && (
            <span className="shrink-0 text-xs bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-medium">
              Gov. Review
            </span>
          )}
        </div>
        {deptInfo && (
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${deptInfo.badgeClass}`}>
            {deptInfo.icon} {deptInfo.shortName}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Issue summary */}
        <div className="flex gap-3">
          {issue.image_url && (
            <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {issue.ai?.severity && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                {issue.ai.severity}
              </span>
            )}
            {issue.location?.address && (
              <p className="text-xs text-gray-500 mt-1 truncate">📍 {issue.location.address}</p>
            )}
            {issue.ai?.summary && (
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{issue.ai.summary}</p>
            )}
          </div>
        </div>

        {/* Technical Verification */}
        {v ? (
          <>
            <div className={`rounded-lg border p-3 ${recColor[v.recommendation] ?? "bg-gray-50"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">{recLabel[v.recommendation] ?? v.recommendation}</span>
                <span className="text-xs font-bold">{v.confidence}% confidence</span>
              </div>
              <p className="text-xs leading-relaxed">{v.reasoning}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Repair Submitted</p>
              <p className="text-xs font-semibold text-gray-800">{v.repair_type}</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{v.repair_notes}</p>
            </div>

            {v.after_image_url && (
              <div className="rounded-lg overflow-hidden border border-gray-200 h-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.after_image_url} alt="After repair" className="w-full h-full object-cover" />
              </div>
            )}

            {v.concerns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Technical Concerns</p>
                <ul className="space-y-0.5">
                  {v.concerns.map((c, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-yellow-500 mt-0.5 shrink-0">•</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">Technical verification not yet available.</p>
        )}

        {/* ── Governance Review ── */}
        {!report ? (
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onGenerateGovernance(issue.id)}
              disabled={generatingGov}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {generatingGov ? "Generating Governance Review…" : "🏛 Generate Governance Review"}
            </button>
            <p className="text-xs text-gray-400 text-center mt-1.5">
              Run AI Governance Review before making approval decision
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {/* Governance header */}
            <div className="flex items-center gap-1.5">
              <span className="text-indigo-600 text-sm">🏛</span>
              <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">AI Governance Report</span>
            </div>

            {/* Decision */}
            {govStyle && (
              <div className={`rounded-lg border p-3 ${govStyle.bg} ${govStyle.border}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${govStyle.text}`}>
                    {govStyle.icon} {govStyle.label}
                  </span>
                  <span className={`text-xs font-bold ${govStyle.text}`}>
                    {report.decision_confidence}% confidence
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${govStyle.text}`}>{report.executive_summary}</p>
              </div>
            )}

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className={`text-xs font-bold ${perfStyle?.color ?? "text-gray-700"}`}>
                  {perfStyle?.label ?? report.department_performance}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Dept Performance</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-gray-800 capitalize">{report.completion_quality}</p>
                <p className="text-xs text-gray-400 mt-0.5">Completion Quality</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className={`text-xs font-bold capitalize ${
                  report.citizen_risk === "none" ? "text-green-700" :
                  report.citizen_risk === "low" ? "text-blue-700" :
                  report.citizen_risk === "medium" ? "text-yellow-700" : "text-red-700"
                }`}>
                  {report.citizen_risk}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Citizen Risk</p>
              </div>
            </div>

            {/* Officer notes */}
            {report.officer_notes && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-0.5">Officer Notes</p>
                <p className="text-xs text-blue-800 leading-relaxed">{report.officer_notes}</p>
              </div>
            )}

            {/* Accountability flag */}
            {report.accountability_required && (
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <p className="text-xs font-semibold text-orange-800 mb-0.5">⚠ Accountability Flag</p>
                <p className="text-xs text-orange-700">{report.accountability_reason}</p>
              </div>
            )}

            {/* Rework order preview */}
            {gov?.rework_order && (
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <p className="text-xs font-semibold text-red-800 mb-1">↩ Rework Order Issued</p>
                <p className="text-xs text-red-700 mb-1">Deadline: {gov.rework_order.suggested_deadline}</p>
                {gov.rework_order.reasons.slice(0, 2).map((r, i) => (
                  <p key={i} className="text-xs text-red-600">• {r}</p>
                ))}
              </div>
            )}

            {/* Required actions */}
            {report.required_actions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Required Actions</p>
                <ul className="space-y-0.5">
                  {report.required_actions.map((a, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-indigo-500 mt-0.5 shrink-0">{i + 1}.</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Deadline */}
            {report.deadline_recommendation && (
              <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                ⏱ {report.deadline_recommendation}
              </p>
            )}

            {/* Decision buttons */}
            {!showOverride ? (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Recommendation: {govStyle?.label}</p>
                <div className="flex gap-2">
                  {report.decision === "APPROVE_RESOLUTION" ? (
                    <button
                      type="button"
                      onClick={() => onDecision(issue.id, "approve", "APPROVE_RESOLUTION", false)}
                      disabled={deciding}
                      className="flex-1 py-2.5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      ✓ Accept — Approve & Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDecision(issue.id, "reject", report.decision, false)}
                      disabled={deciding}
                      className="flex-1 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {govStyle?.icon} Accept — {govStyle?.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowOverride(true)}
                    disabled={deciding}
                    className="px-3 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    Override
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-700">Officer Override</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideDecision("approve")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      overrideDecision === "approve"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideDecision("reject")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      overrideDecision === "reject"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Return for Rework
                  </button>
                </div>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for overriding AI recommendation (required)"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!overrideReason.trim()) return;
                      const govDec: GovernanceDecision = overrideDecision === "approve"
                        ? "APPROVE_RESOLUTION"
                        : "RETURN_FOR_REWORK";
                      onDecision(issue.id, overrideDecision, govDec, true, overrideReason);
                    }}
                    disabled={deciding || !overrideReason.trim()}
                    className="flex-1 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {deciding ? "Submitting…" : "Submit Override"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowOverride(false); setOverrideReason(""); }}
                    className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Issue Card ─────────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  onStatusChange,
  updating,
  onViewDetails,
  onDelete,
  deleting,
}: {
  issue: IssueRecord;
  onStatusChange: (id: string, status: string) => void;
  updating: boolean;
  onViewDetails: (issue: IssueRecord) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}) {
  const submittedAt = issue.submitted_at
    ? new Date(issue.submitted_at).toLocaleString()
    : null;

  const addressText =
    issue.location?.address ??
    (issue.location
      ? `${issue.location.lat.toFixed(4)}, ${issue.location.lng.toFixed(4)}`
      : "Location unknown");

  const deptInfo = issue.assigned_department
    ? getDepartmentByKey(issue.assigned_department)
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
      <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
        {issue.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">
            📷
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-semibold text-sm text-gray-900 truncate">
              {issue.ai?.issue_type ?? "Unanalyzed"}
            </span>
            {issue.escalated && (
              <span className="shrink-0 text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">
                ⚡
              </span>
            )}
            {issue.escalation_brief && (
              <span className="shrink-0 text-xs bg-red-50 text-red-700 border border-red-100 px-1.5 py-0.5 rounded font-medium">
                Brief
              </span>
            )}
            {issue.duplicate_candidate && (
              <span className="shrink-0 text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded font-medium">
                Dup
              </span>
            )}
            {issue.ai?.severity && (
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? "bg-gray-100 text-gray-700"}`}>
                {issue.ai.severity}
              </span>
            )}
            {deptInfo && (
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${deptInfo.badgeClass}`}>
                {deptInfo.icon} {deptInfo.name.replace(" Department", "").replace("Public Works", "P.Works")}
              </span>
            )}
            {issue.area_category && (
              <span className="shrink-0 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-medium">
                {AREA_ICON[issue.area_category] ?? "📍"} {issue.area_category.replace(" Area", "").replace(" Zone", "")}
              </span>
            )}
            {issue.ai?.priority_score != null && (
              <span className="shrink-0 text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded font-bold">
                {issue.ai.priority_score.toFixed(1)}
              </span>
            )}
            {issue.citizen_concern_level && (
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-bold border ${
                CONCERN_STYLE[issue.citizen_concern_level]?.bg ?? CONCERN_STYLE.low.bg
              }`}>
                {CONCERN_STYLE[issue.citizen_concern_level]?.label ?? "LOW"} Concern
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onViewDetails(issue)}
            className="shrink-0 text-xs text-blue-600 hover:underline font-medium"
          >
            Map →
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-0.5 truncate">
          📍 {addressText}
          {issue.comment_count ? (
            <span className="ml-1 text-gray-400">· 💬 {issue.comment_count} comments</span>
          ) : null}
        </p>

        {issue.ai?.responsible_authority && (
          <p className="text-xs text-gray-400 mb-2 truncate">{issue.ai.responsible_authority}</p>
        )}

        {issue.escalated && issue.escalation_reason && (
          <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 mb-2">
            {issue.escalation_reason}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {submittedAt && <span>{submittedAt}</span>}
            {issue.confirmation_count > 0 && (
              <span className="text-green-700">✓ {issue.confirmation_count}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[issue.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABEL[issue.status] ?? issue.status}
            </span>
            <select
              value={issue.status}
              onChange={(e) => onStatusChange(issue.id, e.target.value)}
              disabled={updating}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="processing">Processing</option>
              <option value="analyzed">Analyzed</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this issue permanently? This cannot be undone.")) {
                    onDelete(issue.id);
                  }
                }}
                disabled={deleting}
                title="Delete issue"
                className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
              >
                {deleting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorityPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const roleInfo = useUserRole(user);
  const router = useRouter();

  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deptFilter, setDeptFilter] = useState<DepartmentKey | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [generatingGovId, setGeneratingGovId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<IssueRecord | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);

  const briefingFetchedRef = useRef(false);

  const fetchIssues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const q = query(collection(db, "issues"), orderBy("submitted_at", "desc"));
      const snap = await getDocs(q);
      const issues = snap.docs.map((d) => {
        const data = d.data();
        function tsToMs(ts: unknown): number | null {
          if (ts && typeof ts === "object" && "toMillis" in ts) return (ts as { toMillis: () => number }).toMillis();
          return null;
        }
        return {
          id: d.id,
          reporter_uid: data.reporter_uid as string,
          raw_description: (data.raw_description as string) ?? "",
          image_url: data.image_url as string,
          submitted_at: tsToMs(data.submitted_at),
          updated_at: tsToMs(data.updated_at),
          location: (data.location as Record<string, unknown>) ?? null,
          status: data.status as string,
          confirmation_count: (data.confirmation_count as number) ?? 0,
          escalated: (data.escalated as boolean) ?? false,
          escalated_at: tsToMs(data.escalated_at),
          escalation_reason: (data.escalation_reason as string) ?? null,
          escalation_brief: (data.escalation_brief as Record<string, unknown>) ?? null,
          duplicate_candidate: (data.duplicate_candidate as boolean) ?? false,
          duplicate_of: (data.duplicate_of as string) ?? null,
          duplicate_distance_meters: (data.duplicate_distance_meters as number) ?? null,
          area_category: (data.area_category as string) ?? null,
          area_confidence: (data.area_confidence as number) ?? null,
          citizen_concern_level: (data.citizen_concern_level as string) ?? null,
          community_summary: (data.community_summary as string) ?? null,
          comment_count: (data.comment_count as number) ?? 0,
          assigned_department: (data.assigned_department as string) ?? null,
          assigned_department_name: (data.assigned_department_name as string) ?? null,
          assigned_department_email: (data.assigned_department_email as string) ?? null,
          assigned_at: tsToMs(data.assigned_at),
          assignment_method: (data.assignment_method as string) ?? null,
          department_status: (data.department_status as string) ?? null,
          verification: (data.verification as Record<string, unknown>) ?? null,
          ai: data.ai
            ? { ...(data.ai as Record<string, unknown>), generated_at: tsToMs((data.ai as Record<string, unknown>).generated_at) }
            : null,
          governance: data.governance
            ? {
                ...(data.governance as Record<string, unknown>),
                generated_at: tsToMs((data.governance as Record<string, unknown>).generated_at),
                decided_at: tsToMs((data.governance as Record<string, unknown>).decided_at),
              }
            : null,
          department_progress: (data.department_progress as unknown[]) ?? [],
        } as unknown as IssueRecord;
      });
      setIssues(issues);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchBriefing = useCallback(async () => {
    if (!user || briefingFetchedRef.current) return;
    briefingFetchedRef.current = true;
    // Briefing generation requires server-side AI — currently unavailable client-side.
    setBriefing(null);
    setBriefingLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchIssues();
      fetchBriefing();
    }
  }, [authLoading, user, fetchIssues, fetchBriefing]);

  // Role guard
  useEffect(() => {
    if (!authLoading && user && roleInfo.role !== "commandcenter") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, roleInfo, router]);

  async function handleStatusChange(issueId: string, newStatus: string) {
    if (!user) return;
    setUpdatingId(issueId);
    try {
      await updateDoc(doc(db, "issues", issueId), {
        status: newStatus,
        updated_at: Timestamp.now(),
      });
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId ? { ...issue, status: newStatus as IssueStatus } : issue,
        ),
      );
      setSelectedIssue((prev) =>
        prev?.id === issueId ? { ...prev, status: newStatus as IssueStatus } : prev,
      );
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteIssue(issueId: string) {
    if (!user) return;
    setDeletingId(issueId);
    try {
      await deleteDoc(doc(db, "issues", issueId));
      setIssues((prev) => prev.filter((issue) => issue.id !== issueId));
      if (selectedIssue?.id === issueId) setSelectedIssue(null);
    } catch (e) {
      console.error(e);
      setError("Failed to delete issue. Check Firestore permissions.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleVerifyDecision(
    issueId: string,
    decision: "approve" | "reject",
    govDecision: GovernanceDecision,
    isOverride: boolean,
    overrideReason?: string,
  ) {
    if (!user) return;
    setDecidingId(issueId);
    try {
      const now = Timestamp.now();
      const isApproved = decision === "approve";
      const newStatus = isApproved ? "resolved" : "in_progress";
      const progressEntry = {
        stage: isApproved ? "command_center_approved" : "command_center_rejected",
        timestamp: now,
        notes: isApproved
          ? "Repair verified and approved by Command Centre"
          : `Returned — Governance decision: ${govDecision}`,
        updated_by: user.email ?? "commandcenter",
        workflow_recommendation: null,
        governance_decision: govDecision,
        is_officer_override: isOverride,
      };
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        department_status: isApproved ? "command_center_approved" : "needs_rework",
        department_progress: arrayUnion(progressEntry),
        updated_at: now,
        ...(isApproved ? { resolved_at: now } : {}),
      };
      if (isOverride && overrideReason) {
        updatePayload["governance.officer_override"] = {
          officer_decision: govDecision,
          reason: overrideReason,
          officer_email: user.email ?? "commandcenter",
          timestamp: now,
        };
      }
      updatePayload["governance.final_decision"] = govDecision;
      updatePayload["governance.decided_at"] = now;
      updatePayload["governance.decided_by"] = user.email ?? "commandcenter";
      await updateDoc(doc(db, "issues", issueId), updatePayload);
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId ? { ...issue, status: newStatus as IssueStatus } : issue,
        ),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setDecidingId(null);
    }
  }

  async function handleGenerateGovernance(issueId: string) {
    if (!user) return;
    setGeneratingGovId(issueId);
    try {
      // Governance review requires server-side AI — currently running client-side is not supported.
      // Stub: silently skip so the button shows a loading state then stops.
      await new Promise((r) => setTimeout(r, 800));
      if (false) {
        const data = (await Promise.resolve()) as unknown as {
          report: GovernanceReport;
          accountability: AccountabilityReport | null;
          rework_order: ReworkOrder | null;
        };
        setIssues((prev) =>
          prev.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  governance: {
                    report: data.report,
                    generated_at: Date.now(),
                    accountability: data.accountability,
                    rework_order: data.rework_order,
                    officer_override: null,
                  },
                }
              : issue,
          ),
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingGovId(null);
    }
  }

  // Department stats for overview cards
  const deptStats = useMemo(() => {
    const stats: Record<string, DeptStats> = {};
    for (const issue of issues) {
      if (["resolved", "rejected"].includes(issue.status)) continue;
      const key = issue.assigned_department ?? "publicworks";
      if (!stats[key]) stats[key] = { open: 0, critical: 0, escalated: 0 };
      stats[key].open++;
      if (issue.ai?.severity === "critical") stats[key].critical++;
      if (issue.escalated) stats[key].escalated++;
    }
    return stats;
  }, [issues]);

  if (authLoading || !user || roleInfo.role !== "commandcenter") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  const filtered = issues.filter((issue) => {
    if (filter === "escalated" && !issue.escalated) return false;
    if (filter !== "all" && filter !== "escalated" && issue.status !== filter) return false;
    if (deptFilter && issue.assigned_department !== deptFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900">🏛️ Municipal Command Center</span>
          {!loading && (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {issues.length} issues
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAnalytics((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            {showAnalytics ? "Hide" : "Show"} Analytics
          </button>
          <button
            type="button"
            onClick={fetchIssues}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
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

      {/* Morning Briefing */}
      <MorningBriefingCard briefing={briefing} loading={briefingLoading} />

      {/* Analytics */}
      {!loading && showAnalytics && <AnalyticsDashboard issues={issues} />}

      {/* Department overview */}
      {!loading && <DepartmentOverview stats={deptStats} activeFilter={deptFilter} onFilter={setDeptFilter} />}

      {/* Status filter tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1 overflow-x-auto py-3 no-scrollbar">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === tab.key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {tab.label}
              {tab.key === "escalated" && (
                <span className="ml-1.5 text-orange-500">
                  {issues.filter((i) => i.escalated).length || ""}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters indicator */}
      {(deptFilter || filter !== "all") && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center gap-2">
          <span className="text-xs text-blue-600 font-medium">Showing {filtered.length} of {issues.length} issues</span>
          {deptFilter && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${getDepartmentByKey(deptFilter)?.badgeClass ?? ""}`}>
              {getDepartmentByKey(deptFilter)?.icon} {getDepartmentByKey(deptFilter)?.name}
            </span>
          )}
          {filter !== "all" && (
            <span className="text-xs bg-gray-800 text-white px-2 py-0.5 rounded font-medium">
              {FILTER_TABS.find((t) => t.key === filter)?.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => { setFilter("all"); setDeptFilter(null); }}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Issue list */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading issues...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            No issues found for this filter.
          </div>
        ) : filter === "pending_verification" ? (
          <div className="space-y-3">
            {filtered.map((issue) => (
              <VerificationCard
                key={issue.id}
                issue={issue}
                onDecision={handleVerifyDecision}
                onGenerateGovernance={handleGenerateGovernance}
                deciding={decidingId === issue.id}
                generatingGov={generatingGovId === issue.id}
                user={user}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onStatusChange={handleStatusChange}
                updating={updatingId === issue.id}
                onViewDetails={setSelectedIssue}
                onDelete={roleInfo.role === "commandcenter" ? handleDeleteIssue : undefined}
                deleting={deletingId === issue.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onStatusChange={handleStatusChange}
          updating={updatingId === selectedIssue.id}
          onDelete={roleInfo.role === "commandcenter" ? handleDeleteIssue : undefined}
          deleting={deletingId === selectedIssue.id}
        />
      )}
    </div>
  );
}
