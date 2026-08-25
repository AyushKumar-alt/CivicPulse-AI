import type {
  ActionPlan,
  CanonicalCivicIssue,
  DepartmentCategoryKey,
  DepartmentStage,
  IssueClassification,
  IssueLifecycleState,
  IssueRepository,
  PrimaryIssueStatus,
  Verification,
} from "@/src/modules/contracts";

export interface FirestoreDbLike {
  collection(path: string): {
    doc(id?: string): {
      get(): Promise<{ exists: boolean; id: string; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>, options?: { merge: boolean }): Promise<unknown>;
      update(data: Record<string, unknown>): Promise<unknown>;
    };
    where(field: string, op: string, val: unknown): {
      get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
      onSnapshot?(callback: (snap: { docs: Array<{ id: string; data(): Record<string, unknown> }> }) => void): () => void;
    };
  };
}

export class FirestoreIssueRepository implements IssueRepository {
  constructor(private db: any) {}

  public async getById(issueId: string): Promise<CanonicalCivicIssue | null> {
    const docRef = this.db.collection("issues").doc(issueId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return this.toCanonicalModel(snap.id, snap.data() ?? {});
  }

  public async save(issue: CanonicalCivicIssue): Promise<void> {
    const docRef = this.db.collection("issues").doc(issue.id);
    const payload = this.toFirestoreDocument(issue);
    await docRef.set(payload, { merge: true });
  }

  public async updateLifecycle(issueId: string, newState: IssueLifecycleState): Promise<void> {
    const docRef = this.db.collection("issues").doc(issueId);
    await docRef.update({
      status: newState.currentStatus,
      department_status: newState.departmentStage,
      updated_at: newState.updatedAt,
      department_progress: newState.history,
    });
  }

  public async queryByAgency(agencyId: string, _cityId?: string): Promise<CanonicalCivicIssue[]> {
    try {
      const snap = await this.db
        .collection("issues")
        .where("assigned_agency_id", "==", agencyId)
        .get();

      return snap.docs.map((d: any) => this.toCanonicalModel(d.id, d.data()));
    } catch (err: any) {
      if (
        err?.code === 429 ||
        err?.status === 429 ||
        String(err?.message || err).includes("Quota limit exceeded") ||
        String(err?.message || err).includes("RESOURCE_EXHAUSTED")
      ) {
        console.warn(`[FIRESTORE QUOTA EXCEEDED] Serving fallback mock data for agency: ${agencyId}`);
        return getFallbackAgencyIssues(agencyId);
      }
      throw err;
    }
  }

  public subscribeToAgency(
    agencyId: string,
    _cityId: string,
    callback: (issues: CanonicalCivicIssue[]) => void
  ): () => void {
    const queryRef = this.db.collection("issues").where("assigned_agency_id", "==", agencyId);
    if (typeof queryRef.onSnapshot === "function") {
      return queryRef.onSnapshot((snap: any) => {
        const issues = snap.docs.map((d: any) => this.toCanonicalModel(d.id, d.data()));
        callback(issues);
      });
    }
    return () => {};
  }

  public toCanonicalModel(id: string, data: Record<string, unknown>): CanonicalCivicIssue {
    const loc = (data.location as Record<string, unknown>) ?? {};
    const lat = Number(loc.lat ?? loc.latitude ?? 12.9716);
    const lng = Number(loc.lng ?? loc.longitude ?? 77.5946);
    const address = String(loc.address || loc.fullAddress || loc.area_name || "Unknown Address");

    const cityId = data.city_code ? String(data.city_code) : (loc.cityId as string) || "unresolved_city";
    const categoryKey = (data.category_key || data.assigned_department || "publicworks") as DepartmentCategoryKey;

    const assignedAgencyId = data.assigned_agency_id ? String(data.assigned_agency_id) : (data.assignedAgencyId ? String(data.assignedAgencyId) : "UNRESOLVED");
    const assignedAgencyName = String(
      data.assigned_department_name || data.assignedAgencyName || (assignedAgencyId !== "UNRESOLVED" ? assignedAgencyId : "Unassigned Agency")
    );

    const cityName = String(loc.cityName || loc.city || (cityId === "chennai" ? "Chennai" : cityId === "bengaluru" ? "Bengaluru" : "Unresolved Location"));
    const stateLoc = String(loc.state || (cityId === "chennai" ? "Tamil Nadu" : cityId === "bengaluru" ? "Karnataka" : "Unknown State"));
    const state = String(data.state || "ROUTED");

    return {
      id,
      cityId,
      state,
      location: {
        coordinates: { latitude: lat, longitude: lng },
        country: String(loc.country || "India"),
        state: stateLoc,
        countyName: loc.countyName as string,
        districtName: (loc.districtName || loc.district || loc.countyName) as string,
        stateDistrictName: loc.stateDistrictName as string,
        talukName: (loc.talukName || loc.taluk || loc.suburbName) as string,
        municipalityName: (loc.municipalityName || loc.municipality) as string,
        cityName: (loc.cityName || loc.city) as string,
        townName: (loc.townName || loc.town) as string,
        suburbName: (loc.suburbName || loc.suburb) as string,
        neighbourhoodName: (loc.neighbourhoodName || loc.neighbourhood) as string,
        villageName: (loc.villageName || loc.village) as string,
        cityId,
        localityName: String(loc.localityName || loc.area_name || loc.villageName || loc.suburbName || "Locality"),
        fullAddress: address,
        provider: String(loc.provider || "FirestoreRepositoryAdapter"),
        rawAddress: (loc.rawAddress as Record<string, string>) || {},
      },
      categoryKey,
      assignedAgencyId,
      assignedAgencyName,
      routingDecision: data.routing_decision as any,
      routingOverride: (data.routing_override as any) ?? null,
      assignment: (data.assignment as any) ?? (
        data.unitId || data.crewId || data.leadOfficerId
          ? {
              unitId: String(data.unitId || ""),
              unitName: String(data.unitName || data.unitId || ""),
              crewId: String(data.crewId || ""),
              teamId: String(data.crewId || ""),
              teamName: String(data.crewName || data.crewId || ""),
              officerId: String(data.leadOfficerId || ""),
              officerName: String(data.leadOfficerName || data.leadOfficerId || ""),
            }
          : null
      ),
      resolution: (data.resolution as any) ?? null,
      primaryStatus: (data.status as PrimaryIssueStatus) || "analyzed",
      departmentStage: (data.department_status as DepartmentStage) || "assigned",
      reporterUid: String(data.reporter_uid || "anonymous"),
      rawDescription: String(data.raw_description || ""),
      imageUrl: String(data.image_url || ""),
      submittedAt: String(data.submitted_at || new Date().toISOString()),
      updatedAt: String(data.updated_at || new Date().toISOString()),
      confirmationCount: Number(data.confirmation_count ?? 0),
      commentCount: Number(data.comment_count ?? 0),
      isEscalated: Boolean(data.escalated ?? false),
      actionPlan: (data.action_plan as ActionPlan) ?? null,
      verification: (data.verification as Verification) ?? null,
      ai: {
        severity: (data.ai as any)?.severity || (data.ai_observations as any)?.visualSeverity || "medium",
        category: (data.ai as any)?.category || (data.ai_observations as any)?.categoryKey || categoryKey,
        summary: (data.ai as any)?.summary || (data.ai_observations as any)?.issueTypeDisplayName || "Civic Issue",
        confidence: Number((data.ai as any)?.confidence ?? (data.ai_observations as any)?.confidence ?? 1.0),
        observations: (data.ai as any)?.observations || (data.ai_observations as any)?.visualObservations || [],
        description: (data.ai as any)?.description || (data.ai_observations as any)?.safetyRiskDescription || String(data.raw_description || ""),
        responsible_authority: (data.ai as any)?.responsible_authority || assignedAgencyName,
      },
      aiObservations: data.ai_observations ? (data.ai_observations as IssueClassification) : undefined,
      afterEvidenceUrl: (data.afterEvidenceUrl || data.after_evidence_url || (data.resolution as any)?.afterEvidenceUrl) ? String(data.afterEvidenceUrl || data.after_evidence_url || (data.resolution as any)?.afterEvidenceUrl) : null,
      resolutionSubmittedBy: (data.resolutionSubmittedBy || data.resolution_submitted_by) ? String(data.resolutionSubmittedBy || data.resolution_submitted_by) : null,
      resolutionSubmittedAt: data.resolutionSubmittedAt || data.resolution_submitted_at || null,
      closedAt: data.closedAt || data.closed_at || null,
      closedBy: (data.closedBy || data.closed_by) ? String(data.closedBy || data.closed_by) : null,
      ackDueAt: data.ackDueAt || data.ack_due_at || null,
      slaDueAt: data.slaDueAt || data.sla_due_at || null,
      citizenSlaDueAt: data.citizenSlaDueAt || data.citizen_sla_due_at || null,
      acknowledgedAt: data.acknowledgedAt || data.acknowledged_at || null,
      parentIssueId: (data.parentIssueId || data.parent_issue_id) ? String(data.parentIssueId || data.parent_issue_id) : null,
      childIssueIds: Array.isArray(data.childIssueIds || data.child_issue_ids) ? ((data.childIssueIds || data.child_issue_ids) as string[]) : [],
    };
  }

  public toFirestoreDocument(issue: CanonicalCivicIssue): Record<string, unknown> {
    const rawAI = (issue.aiObservations?.rawAIOutput as Record<string, unknown>) ?? (issue.ai as Record<string, unknown>) ?? {};
    const rawDoc = {
      id: issue.id,
      state: issue.state || "ROUTED",
      city_code: issue.cityId,
      category_key: issue.categoryKey,
      assigned_agency_id: issue.assignedAgencyId,
      assigned_department: issue.categoryKey,
      assigned_department_name: issue.assignedAgencyName,
      status: issue.primaryStatus,
      department_status: issue.departmentStage,
      reporter_uid: issue.reporterUid,
      raw_description: issue.rawDescription,
      image_url: issue.imageUrl,
      afterEvidenceUrl: issue.afterEvidenceUrl ?? null,
      resolutionSubmittedBy: issue.resolutionSubmittedBy ?? null,
      resolutionSubmittedAt: issue.resolutionSubmittedAt ?? null,
      closedAt: issue.closedAt ?? null,
      closedBy: issue.closedBy ?? null,
      ackDueAt: issue.ackDueAt ?? null,
      slaDueAt: issue.slaDueAt ?? null,
      citizenSlaDueAt: issue.citizenSlaDueAt ?? null,
      acknowledgedAt: issue.acknowledgedAt ?? null,
      parentIssueId: issue.parentIssueId ?? null,
      childIssueIds: issue.childIssueIds ?? [],
      submitted_at: issue.submittedAt,
      updated_at: issue.updatedAt,
      confirmation_count: issue.confirmationCount,
      comment_count: issue.commentCount,
      escalated: issue.isEscalated,
      assignment: issue.assignment ?? null,
      routing_override: issue.routingOverride ?? null,
      resolution: issue.resolution ?? null,
      location: {
        lat: issue.location.coordinates.latitude,
        lng: issue.location.coordinates.longitude,
        address: issue.location.fullAddress,
        area_name: issue.location.localityName,
        country: issue.location.country ?? "India",
        state: issue.location.state ?? "Unknown State",
        district: issue.location.districtName ?? null,
        districtName: issue.location.districtName ?? null,
        taluk: issue.location.talukName ?? null,
        talukName: issue.location.talukName ?? null,
        village: issue.location.villageName ?? null,
        villageName: issue.location.villageName ?? null,
        townName: issue.location.townName ?? null,
        suburbName: issue.location.suburbName ?? null,
        neighbourhoodName: issue.location.neighbourhoodName ?? null,
        municipality: issue.location.municipalityName ?? null,
        municipalityName: issue.location.municipalityName ?? null,
        city: issue.location.cityName ?? null,
        cityName: issue.location.cityName ?? null,
        cityId: issue.location.cityId ?? "unresolved_city",
        localityName: issue.location.localityName ?? "Unknown Locality",
        fullAddress: issue.location.fullAddress ?? "",
        provider: issue.location.provider ?? "NominatimGeoAdapter",
        rawAddress: issue.location.rawAddress ?? {},
      },
      routing_decision: issue.routingDecision ? {
        routingId: issue.routingDecision.routingId,
        timestamp: issue.routingDecision.timestamp,
        cityId: issue.routingDecision.cityId,
        corporationId: issue.routingDecision.corporationId ?? null,
        zoneId: issue.routingDecision.zoneId ?? null,
        wardId: issue.routingDecision.wardId ?? null,
        categoryKey: issue.routingDecision.categoryKey,
        subcategoryKey: issue.routingDecision.subcategoryKey,
        issueTypeKey: issue.routingDecision.issueTypeKey,
        agencyId: issue.routingDecision.agencyId,
        agencyName: issue.routingDecision.agencyName,
        routingMethod: issue.routingDecision.routingMethod,
        routingVersion: issue.routingDecision.routingVersion,
        confidence: issue.routingDecision.confidence,
        reason: issue.routingDecision.reason,
      } : null,
      action_plan: issue.actionPlan ?? null,
      verification: issue.verification ?? null,
      area_category: (rawAI as any)?.area_category ?? "Residential Area",
      area_confidence: (rawAI as any)?.area_confidence ?? 0.95,
      area_reasoning: (rawAI as any)?.area_reasoning ?? null,
      ai: {
        issue_type: issue.aiObservations?.issueTypeDisplayName ?? "Civic Issue",
        severity: issue.aiObservations?.visualSeverity ?? "medium",
        confidence: issue.aiObservations?.confidence ?? 1.0,
        summary: (rawAI as any)?.summary || (issue.aiObservations as any)?.visualObservations?.join(". ") || issue.rawDescription,
        safety_risk: issue.aiObservations?.safetyRiskDescription ?? "Standard safety maintenance required",
        responsible_authority: issue.assignedAgencyName,
        functional_importance: (rawAI as any)?.functional_importance ?? null,
        likely_daily_activity: (rawAI as any)?.likely_daily_activity ?? null,
        affected_groups: (rawAI as any)?.affected_groups ?? [],
        estimated_population_impact: (rawAI as any)?.estimated_population_impact ?? null,
        impact_score: (rawAI as any)?.impact_score ?? 8.0,
        impact_reasoning: (rawAI as any)?.impact_reasoning ?? null,
        priority_score: issue.aiObservations?.priorityScore ?? (rawAI as any)?.priority_score ?? 8.0,
        priority_reasoning: issue.aiObservations?.priorityReasoning ?? (rawAI as any)?.priority_reasoning ?? null,
        context_used: (rawAI as any)?.context_used ?? false,
        context_influence: (rawAI as any)?.context_influence ?? "none",
        repair_complexity: (rawAI as any)?.repair_complexity ?? "medium",
        repair_category: (rawAI as any)?.repair_category ?? "utility_repair",
        estimated_work_hours: (rawAI as any)?.estimated_work_hours ?? 8,
        weather_sensitive: (rawAI as any)?.weather_sensitive ?? false,
        inspection_required: (rawAI as any)?.inspection_required ?? true,
        temporary_public_safety_required: (rawAI as any)?.temporary_public_safety_required ?? true,
        required_equipment: (rawAI as any)?.required_equipment ?? [],
        required_skills: (rawAI as any)?.required_skills ?? [],
        operational_constraints: (rawAI as any)?.operational_constraints ?? [],
        verification_checkpoints: (rawAI as any)?.verification_checkpoints ?? [],
        category: issue.aiObservations?.categoryKey ?? issue.categoryKey,
        observations: issue.aiObservations?.visualObservations ?? [],
      },
      ai_observations: issue.aiObservations ?? null,
    };

    return sanitizeFirestorePayload(rawDoc);
  }
}

/**
 * Recursive sanitizer ensuring ZERO `undefined` values can ever reach `docRef.set()`.
 */
function sanitizeFirestorePayload(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== "object") return val;
  if (val instanceof Date) return val;
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeFirestorePayload(item));
  }
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(val)) {
    const propVal = val[key];
    sanitized[key] = propVal === undefined ? null : sanitizeFirestorePayload(propVal);
  }
  return sanitized;
}

function getFallbackAgencyIssues(agencyId: string): CanonicalCivicIssue[] {
  const now = new Date().toISOString();
  return [
    {
      id: "iss_water_leak_demo_01",
      cityId: "bengaluru",
      location: {
        coordinates: { latitude: 13.14743, longitude: 77.61998 },
        country: "India",
        state: "Karnataka",
        districtName: "Bengaluru Urban",
        talukName: "Yelahanka taluku",
        cityId: "bengaluru",
        localityName: "Kodagalahatti",
        fullAddress: "Hunasamaranahalli, Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
        provider: "FallbackAdapter",
        rawAddress: {},
      },
      categoryKey: "water",
      assignedAgencyId: agencyId || "bengaluru_bwssb",
      assignedAgencyName: "Water Supply & Sewerage Board (BWSSB)",
      primaryStatus: "analyzed",
      departmentStage: "assigned",
      reporterUid: "demo_reporter",
      rawDescription: "Major Water Pipeline Rupture & High-Pressure Leakage",
      imageUrl: "https://images.unsplash.com/photo-1542013936693-884638332954",
      submittedAt: now,
      updatedAt: now,
      confirmationCount: 1,
      commentCount: 0,
      isEscalated: false,
      aiObservations: {
        categoryKey: "water",
        subcategoryKey: "pipe_burst",
        issueTypeKey: "pipe_burst",
        visualSeverity: "critical",
        confidence: 0.98,
        issueTypeDisplayName: "Major Water Pipeline Rupture & High-Pressure Leakage",
        safetyRiskDescription: "Severe flooding hazard and potential potable water contamination.",
        priorityScore: 9.5,
        priorityReasoning: "High-pressure main distribution leak with community safety risk.",
        visualObservations: ["Pipe rupture", "High-pressure leak"],
      },
      ai: {
        summary: "High-pressure main water distribution pipe rupture causing severe road inundation.",
        severity: "critical",
        confidence: 0.98,
        observations: ["Pipe rupture", "High-pressure leak"],
        description: "Severe flooding hazard and potential potable water contamination.",
        responsible_authority: "Water Supply & Sewerage Board (BWSSB)",
      },
    },
  ];
}
