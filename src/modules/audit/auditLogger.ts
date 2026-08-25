import type { AuditLogRecord } from "@/src/modules/contracts";

export class AuditLogger {
  constructor(private db: any) {}

  /**
   * Log an immutable operational audit event.
   * Creates a new document in the `audit_logs` collection. Never updates existing records.
   */
  public async logEvent(
    record: Omit<AuditLogRecord, "auditId">
  ): Promise<string> {
    const docRef = this.db.collection("audit_logs").doc();
    const auditId = docRef.id;

    const payload: AuditLogRecord = {
      auditId,
      issueId: record.issueId,
      actorId: record.actorId,
      actorEmail: record.actorEmail,
      actorRole: record.actorRole,
      action: record.action,
      previousState: record.previousState ?? null,
      newState: record.newState ?? null,
      reason: record.reason ?? null,
      timestamp: record.timestamp || new Date().toISOString(),
    };

    await docRef.set(payload);
    return auditId;
  }

  /**
   * Query full audit trail history for a specific issue ID.
   */
  public async getIssueHistory(issueId: string): Promise<AuditLogRecord[]> {
    const snap = await this.db
      .collection("audit_logs")
      .where("issueId", "==", issueId)
      .get();

    if (!snap || !snap.docs) return [];

    const records = snap.docs.map((d: any) => d.data() as AuditLogRecord);
    return records.sort(
      (a: AuditLogRecord, b: AuditLogRecord) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }
}
