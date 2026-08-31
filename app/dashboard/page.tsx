"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/hooks/useRequireAuth";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { logout } from "@/lib/firebase/auth";
import {
  getMyIssues,
  getCommunityIssues,
  hasUserConfirmed,
} from "@/lib/firebase/firestore";
import { doc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type Tab = "my" | "community";

interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

interface IssueRecord {
  id: string;
  reporter_uid: string;
  status: string;
  image_url: string;
  raw_description: string;
  submitted_at?: FirestoreTimestamp | null;
  confirmation_count: number;
  escalated: boolean;
  escalation_reason?: string | null;
  location?: {
    lat: number;
    lng: number;
    address?: string | null;
    area_name?: string | null;
    zone_type?: string | null;
  } | null;
  ai?: {
    issue_type: string;
    severity: string;
    confidence: number;
    summary: string;
    responsible_authority: string;
    safety_risk?: string;
    error?: string;
  } | null;
}

// ── localStorage helpers (hide an issue from My Issues without deleting it) ──

function getHiddenIds(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(`hidden_${uid}`);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveHiddenId(uid: string, issueId: string): void {
  try {
    const ids = getHiddenIds(uid);
    ids.add(issueId);
    localStorage.setItem(`hidden_${uid}`, JSON.stringify([...ids]));
  } catch { /* localStorage unavailable */ }
}

// ── Shared style maps ──────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-blue-50 text-blue-600",
  analyzed: "bg-purple-50 text-purple-700",
  in_progress: "bg-orange-50 text-orange-700",
  resolved: "bg-green-50 text-green-700",
  rejected: "bg-gray-100 text-gray-500",
  error: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "Analyzing…",
  analyzed: "Analyzed",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
  error: "Error",
};

function formatDate(ts?: any): string {
  if (!ts) return "Just now";
  let d: Date;
  if (typeof ts === "string") d = new Date(ts);
  else if (typeof ts === "number") d = new Date(ts);
  else if (ts && typeof ts === "object" && "seconds" in ts) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);

  if (isNaN(d.getTime())) return "Just now";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addressText(issue: any): string | null {
  const loc = issue.geoContext || issue.location;
  const full =
    (loc?.fullAddress && loc.fullAddress !== "Location captured" ? loc.fullAddress : null) ||
    (loc?.formattedAddress ? loc.formattedAddress : null) ||
    (loc?.address && loc.address !== "Location captured" ? loc.address : null) ||
    (loc?.localityName ? loc.localityName : null) ||
    issue.address;
  if (full) return full;
  const lat = typeof loc?.coordinates?.latitude === "number" ? loc.coordinates.latitude : loc?.lat;
  const lng = typeof loc?.coordinates?.longitude === "number" ? loc.coordinates.longitude : loc?.lng;
  if (typeof lat === "number" && typeof lng === "number") return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return null;
}

// ── My Issues card ─────────────────────────────────────────────────────────────

function MyIssueCard({
  issue,
  onRemove,
}: {
  issue: IssueRecord;
  onRemove: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const addr = addressText(issue);
  const date = formatDate(issue.submitted_at);

  function handleRemove() {
    setRemoving(true);
    // small delay so the animation/feedback is visible
    setTimeout(() => onRemove(issue.id), 250);
  }

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-3 hover:border-gray-300 transition-all ${
        removing ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
        {issue.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">📷</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {issue.ai?.issue_type ?? "Pending Analysis"}
              </p>
              {issue.ai?.severity && (
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                  {issue.ai.severity}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[issue.status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABEL[issue.status] ?? issue.status}
              </span>
              {issue.escalated && (
                <span className="inline-flex items-center gap-0.5 text-xs bg-orange-50 text-orange-700 border border-orange-100 px-1.5 py-0.5 rounded">
                  ⚡ Escalated
                </span>
              )}
            </div>
          </div>
          {/* Remove button */}
          <button
            type="button"
            onClick={handleRemove}
            title="Remove from My Issues"
            className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3a.5.5 0 0 0 0 1H13.5a.5.5 0 0 0 0-1H2.5z"/>
            </svg>
          </button>
        </div>

        {issue.escalated && issue.escalation_reason && (
          <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 mb-1.5 truncate">
            ⚡ {issue.escalation_reason}
          </p>
        )}

        {addr && <p className="text-xs text-gray-500 truncate mb-0.5">📍 {addr}</p>}
        {date && <p className="text-xs text-gray-400 mb-2">Submitted {date}</p>}

        <Link href={`/issues/${issue.id}`} className="text-xs text-blue-600 hover:underline font-medium">
          View Details →
        </Link>
      </div>
    </div>
  );
}

// ── Community Issues card ──────────────────────────────────────────────────────

function CommunityIssueCard({
  issue,
  currentUserId,
  confirmed,
  confirming,
  onConfirm,
}: {
  issue: IssueRecord;
  currentUserId: string;
  confirmed: boolean;
  confirming: boolean;
  onConfirm: (id: string) => void;
}) {
  const isOwn = issue.reporter_uid === currentUserId;
  const addr = addressText(issue);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 hover:border-gray-300 transition-colors">
      {/* Thumbnail */}
      <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
        {issue.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">📷</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Top row: type + severity + link */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {issue.ai?.issue_type ?? "Issue"}
              </p>
              {issue.ai?.severity && (
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${SEVERITY_STYLE[issue.ai.severity] ?? ""}`}>
                  {issue.ai.severity}
                </span>
              )}
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[issue.status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABEL[issue.status] ?? issue.status}
              </span>
            </div>
            {/* Reporter label */}
            <p className={`text-xs mt-0.5 font-medium ${isOwn ? "text-blue-600" : "text-gray-400"}`}>
              {isOwn ? "Reported by You" : "Reported by Community Member"}
            </p>
          </div>
          <Link
            href={`/issues/${issue.id}`}
            className="shrink-0 text-xs text-blue-600 hover:underline font-medium"
          >
            View →
          </Link>
        </div>

        {/* Address */}
        {addr && <p className="text-xs text-gray-500 truncate mb-1">📍 {addr}</p>}

        {/* Escalation */}
        {issue.escalated && (
          <div className="mb-1.5">
            <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 flex items-start gap-1">
              <span className="shrink-0">⚡</span>
              <span className="truncate">
                <span className="font-semibold">Escalated</span>
                {issue.escalation_reason ? ` — ${issue.escalation_reason}` : ""}
              </span>
            </p>
          </div>
        )}

        {/* Bottom row: confirmation count + button */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {issue.confirmation_count > 0
              ? `✓ ${issue.confirmation_count} confirmed`
              : "No confirmations yet"}
          </p>
          {/* I've Seen This — only for other people's issues */}
          {!isOwn && (
            <button
              type="button"
              onClick={() => onConfirm(issue.id)}
              disabled={confirmed || confirming}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                confirmed
                  ? "bg-green-50 text-green-700 border border-green-200 cursor-default"
                  : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              }`}
            >
              {confirming ? "…" : confirmed ? "✓ Confirmed" : "I've seen this"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const roleInfo = useUserRole(user);
  const router = useRouter();

  // Redirect command center and department users to their own dashboards
  useEffect(() => {
    if (!authLoading && user) {
      if (roleInfo.role === "commandcenter") router.replace("/command-center");
      else if (roleInfo.role === "department") router.replace("/department");
    }
  }, [authLoading, user, roleInfo, router]);

  const [activeTab, setActiveTab] = useState<Tab>("my");

  // ── My Issues ──
  const [myIssues, setMyIssues] = useState<IssueRecord[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [myLoading, setMyLoading] = useState(false);

  // ── Community Issues ──
  const [communityIssues, setCommunityIssues] = useState<IssueRecord[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [confirmedSet, setConfirmedSet] = useState(new Set<string>());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [dbError, setDbError] = useState<string | null>(null);

  // Load Community Issues when tab is opened
  const loadCommunity = useCallback(async () => {
    if (!user) return;
    setCommunityLoading(true);
    try {
      const data = await getCommunityIssues();
      const all = data as unknown as IssueRecord[];
      setCommunityIssues(all);

      const checks = await Promise.all(all.map((i) => hasUserConfirmed(i.id, user.uid)));
      const confirmed = new Set(all.filter((_, idx) => checks[idx]).map((i) => i.id));
      setConfirmedSet(confirmed);
      setCommunityLoaded(true);
    } catch (e: any) {
      console.error(e);
    } finally {
      setCommunityLoading(false);
    }
  }, [user]);

  // Load My Issues & Community Issues once user is available
  useEffect(() => {
    if (!user) return;
    const hidden = getHiddenIds(user.uid);
    setHiddenIds(hidden);
    setMyLoading(true);
    getMyIssues(user.uid)
      .then((data) => setMyIssues(data as IssueRecord[]))
      .catch((err: any) => {
        console.error(err);
      })
      .finally(() => setMyLoading(false));

    void loadCommunity();
  }, [user, loadCommunity]);

  useEffect(() => {
    if (activeTab === "community") void loadCommunity();
  }, [activeTab, loadCommunity]);

  function handleRemoveMyIssue(issueId: string) {
    if (!user) return;
    saveHiddenId(user.uid, issueId);
    setHiddenIds((prev) => new Set([...prev, issueId]));
  }

  async function handleConfirm(issueId: string) {
    if (!user || confirmingId !== null || confirmedSet.has(issueId)) return;
    setConfirmingId(issueId);
    try {
      const issueRef = doc(db, "issues", issueId);
      const confirmRef = doc(db, "issues", issueId, "confirmations", user.uid);
      const ESCALATION_THRESHOLD = 3;
      let newCount = 0;
      await runTransaction(db, async (tx) => {
        const [issueSnap, confirmSnap] = await Promise.all([tx.get(issueRef), tx.get(confirmRef)]);
        if (!issueSnap.exists() || confirmSnap.exists()) return;
        const data = issueSnap.data()!;
        if (data.reporter_uid === user.uid) return;
        newCount = ((data.confirmation_count as number) ?? 0) + 1;
        const updates: Record<string, unknown> = { confirmation_count: newCount, updated_at: Timestamp.now() };
        if (newCount >= ESCALATION_THRESHOLD && !data.escalated) {
          updates.escalated = true;
          updates.escalated_at = Timestamp.now();
          updates.escalation_reason = `Auto-escalated: ${newCount} community confirmations`;
        }
        tx.set(confirmRef, { uid: user.uid, confirmed_at: Timestamp.now() });
        tx.update(issueRef, updates);
      });
      setConfirmedSet((prev) => new Set(prev).add(issueId));
      if (newCount > 0) {
        setCommunityIssues((prev) =>
          prev.map((i) => i.id === issueId ? { ...i, confirmation_count: newCount } : i),
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleSignOut() {
    await logout();
    router.push("/sign-in");
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const visibleMyIssues = myIssues.filter((i) => !hiddenIds.has(i.id));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">My Dashboard</span>
        <div className="flex items-center gap-3">
          <Link
            href="/submit"
            className="bg-blue-600 text-white text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            + Report Issue
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 mt-5 px-6 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "my"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            My Issues
            {visibleMyIssues.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {visibleMyIssues.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("community")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "community"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Community Issues
            {communityIssues.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {communityIssues.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className="px-6 py-5 space-y-3">
          {dbError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 mb-4 text-sm flex items-start gap-3">
              <span className="text-amber-600 text-lg shrink-0">⚠️</span>
              <div>
                <p className="font-bold">Database Temporarily Unavailable</p>
                <p className="text-xs text-amber-800 mt-0.5">{dbError}</p>
              </div>
            </div>
          )}

          {activeTab === "my" && (
            <>
              {myLoading ? (
                <div className="text-center py-12 text-sm text-gray-400">Loading your issues…</div>
              ) : visibleMyIssues.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                  <p className="text-2xl mb-3">📸</p>
                  <p className="font-medium text-gray-700">No issues reported yet.</p>
                  <p className="text-sm text-gray-400 mt-1 mb-5">
                    See something broken? Report it and AI will analyze it instantly.
                  </p>
                  <Link
                    href="/submit"
                    className="inline-block bg-blue-600 text-white text-sm rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors"
                  >
                    Report your first issue
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    Removed issues are hidden from this list but still visible in Community Issues.
                  </p>
                  {visibleMyIssues.map((issue) => (
                    <MyIssueCard
                      key={issue.id}
                      issue={issue}
                      onRemove={handleRemoveMyIssue}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {activeTab === "community" && (
            <>
              {communityLoading ? (
                <div className="text-center py-12 text-sm text-gray-400">
                  Loading community issues…
                </div>
              ) : communityIssues.length === 0 && communityLoaded ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                  <p className="text-2xl mb-3">🏘️</p>
                  <p className="font-medium text-gray-700">No community issues yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Analyzed issues will appear here once they are processed.
                  </p>
                </div>
              ) : (
                communityIssues.map((issue) => (
                  <CommunityIssueCard
                    key={issue.id}
                    issue={issue}
                    currentUserId={user.uid}
                    confirmed={confirmedSet.has(issue.id)}
                    confirming={confirmingId === issue.id}
                    onConfirm={handleConfirm}
                  />
                ))
              )}
            </>
          )}
        </div>

        <p className="text-xs text-center text-gray-400 pb-8">
          Signed in as {user.email ? user.email : user.isAnonymous ? "Guest Citizen" : user.phoneNumber ? "Mobile Citizen" : "Citizen"}
        </p>
      </div>
    </div>
  );
}
