import { getAdminDb } from "../lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getSlaPolicy } from "../src/modules/lifecycle/slaPolicy";
import type { DepartmentCategoryKey, SeverityLevel } from "../src/modules/contracts";

export interface MigrationAuditReport {
  totalScanned: number;
  migrated: number;
  skipped: number;
  mappedToClosed: number;
  mappedToRouted: number;
  missingCategoryKey: number;
  missingClosureTimestamp: number;
  missingParentIssueId: number;
  missingChildIssueIds: number;
  missingExcludedAgencies: number;
  missingReassignmentCount: number;
}

export async function runLifecycleMigration(isDryRun = true): Promise<MigrationAuditReport> {
  const db = getAdminDb();
  const snapshot = await db.collection("issues").get();

  const report: MigrationAuditReport = {
    totalScanned: snapshot.size,
    migrated: 0,
    skipped: 0,
    mappedToClosed: 0,
    mappedToRouted: 0,
    missingCategoryKey: 0,
    missingClosureTimestamp: 0,
    missingParentIssueId: 0,
    missingChildIssueIds: 0,
    missingExcludedAgencies: 0,
    missingReassignmentCount: 0,
  };

  console.log(`🚀 Starting Lifecycle Migration (${isDryRun ? "DRY RUN / EMULATOR" : "LIVE execution"}). Total documents: ${report.totalScanned}`);

  for (const doc of snapshot.docs) {
    const data = doc.data() as any;

    // Idempotency check: Skip if state already exists
    if (data.state) {
      report.skipped++;
      continue;
    }

    report.migrated++;

    // Data-quality audit counts
    if (!data.categoryKey) report.missingCategoryKey++;
    if (!data.parentIssueId && data.parentIssueId !== null) report.missingParentIssueId++;
    if (!data.childIssueIds) report.missingChildIssueIds++;
    if (!data.excludedAgencies) report.missingExcludedAgencies++;
    if (data.reassignmentCount === undefined || data.reassignmentCount === null) report.missingReassignmentCount++;

    // Legacy status mapping
    const isResolved = data.primaryStatus === "resolved" || data.departmentStage === "closed" || data.status === "resolved";
    const targetState = isResolved ? "CLOSED" : "ROUTED";

    if (isResolved) {
      report.mappedToClosed++;
      if (!data.closedAt && !data.resolved_at && !data.resolvedAt) {
        report.missingClosureTimestamp++;
      }
    } else {
      report.mappedToRouted++;
    }

    // SLA Backfill calculation
    const categoryKey: DepartmentCategoryKey = data.categoryKey || "unknown";
    const severity: SeverityLevel = data.severity || data.ai?.visualSeverity || "medium";
    const submittedAt = data.createdAt?.toDate ? data.createdAt.toDate() : (data.submittedAt ? new Date(data.submittedAt) : new Date());

    const slaPolicy = getSlaPolicy(categoryKey, severity);
    const nowMs = submittedAt.getTime();

    const citizenSlaDueAt = new Date(nowMs + slaPolicy.citizenSlaHours * 3600 * 1000);
    const ackDueAt = new Date(nowMs + slaPolicy.ackSlaHours * 3600 * 1000);
    const slaDueAt = new Date(nowMs + slaPolicy.resolutionSlaHours * 3600 * 1000);

    const closedAtDate = data.resolvedAt ? new Date(data.resolvedAt) : (data.resolved_at ? new Date(data.resolved_at) : null);

    if (!isDryRun) {
      const issueRef = doc.ref;
      const eventRef = issueRef.collection("case_events").doc();

      const batch = db.batch();
      batch.update(issueRef, {
        state: targetState,
        parentIssueId: data.parentIssueId ?? null,
        childIssueIds: data.childIssueIds ?? [],
        excludedAgencies: data.excludedAgencies ?? [],
        reassignmentCount: data.reassignmentCount ?? 0,
        citizenSlaDueAt: Timestamp.fromDate(citizenSlaDueAt),
        ackDueAt: Timestamp.fromDate(ackDueAt),
        slaDueAt: Timestamp.fromDate(slaDueAt),
        slaRemainingMs: null,
        closedAt: closedAtDate ? Timestamp.fromDate(closedAtDate) : null,
      });

      batch.set(eventRef, {
        eventId: eventRef.id,
        fromState: null,
        toState: targetState,
        actorId: "system:migration",
        actorRole: "SYSTEM",
        timestamp: Timestamp.fromDate(new Date()),
        note: "Lifecycle migration backfill",
      });

      await batch.commit();
    }
  }

  console.log("📊 Migration Audit Report Complete:");
  console.table(report);
  return report;
}

if (require.main === module) {
  runLifecycleMigration(true).catch(console.error);
}
