import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { LifecycleState } from "./transitionPolicy";

export const ACTIVE_RESOLUTION_SLA_STATES: LifecycleState[] = [
  "ROUTED",
  "ACKNOWLEDGED",
  "UNDER_INVESTIGATION",
  "VALIDATED",
  "FIELD_ASSIGNED",
  "IN_PROGRESS",
  "RESOLUTION_SUBMITTED",
  "REOPENED",
];

export const ACTIVE_BACKLOG_STATES: LifecycleState[] = [
  "ROUTED",
  "ACKNOWLEDGED",
  "UNDER_INVESTIGATION",
  "VALIDATED",
  "FIELD_ASSIGNED",
  "IN_PROGRESS",
  "DEFERRED",
  "RESOLUTION_SUBMITTED",
  "REOPENED",
];

export class LifecycleQueries {
  private static getDb() {
    return getAdminDb();
  }

  /**
   * Query A: Department resolution breaches (overdue active issues past resolution SLA)
   */
  public static buildDepartmentResolutionBreachesQuery(agencyId: string, now: Date = new Date()) {
    const db = this.getDb();
    return db
      .collection("issues")
      .where("assignedAgencyId", "==", agencyId)
      .where("parentIssueId", "==", null)
      .where("state", "in", ACTIVE_RESOLUTION_SLA_STATES)
      .where("slaDueAt", "<", Timestamp.fromDate(now))
      .orderBy("slaDueAt", "asc");
  }

  /**
   * Query B: Acknowledgement breaches (routed issues past acknowledgement SLA)
   */
  public static buildAcknowledgementBreachesQuery(agencyId: string, now: Date = new Date()) {
    const db = this.getDb();
    return db
      .collection("issues")
      .where("assignedAgencyId", "==", agencyId)
      .where("parentIssueId", "==", null)
      .where("state", "==", "ROUTED")
      .where("ackDueAt", "<", Timestamp.fromDate(now))
      .orderBy("ackDueAt", "asc");
  }

  /**
   * Query C: Command Center regional SLA view (overdue active issues across all agencies in city)
   */
  public static buildCommandCenterSlaViewQuery(cityId: string, now: Date = new Date()) {
    const db = this.getDb();
    return db
      .collection("issues")
      .where("cityId", "==", cityId)
      .where("state", "in", ACTIVE_RESOLUTION_SLA_STATES)
      .where("slaDueAt", "<", Timestamp.fromDate(now));
  }

  /**
   * Query D: Operational Backlog query (active issues assigned to agency, excluding duplicate children and terminal states)
   */
  public static buildOperationalBacklogQuery(agencyId: string) {
    const db = this.getDb();
    return db
      .collection("issues")
      .where("assignedAgencyId", "==", agencyId)
      .where("parentIssueId", "==", null)
      .where("state", "in", ACTIVE_BACKLOG_STATES);
  }
}
