/**
 * CIVICPULSE AI — CANONICAL DOMAIN CONTRACTS
 * 
 * Strict boundary rules:
 * - NO Firebase SDK imports
 * - NO Gemini SDK imports
 * - NO Next.js / React imports
 * - NO Leaflet / Browser imports
 * - NO external HTTP or database dependencies
 */

// ── Geographic Domain ────────────────────────────────────────────────────────
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeoContext {
  coordinates: GeoCoordinates;
  country: string;                    // e.g. "India"
  state: string;                      // e.g. "Karnataka", "Tamil Nadu"
  countyName?: string;                // e.g. "Bangalore Rural", "Bengaluru Urban"
  districtName?: string;              // e.g. "Bangalore Rural", "Chennai"
  stateDistrictName?: string;         // e.g. "Bengaluru Division"
  talukName?: string;                 // e.g. "Devanahalli"
  municipalityName?: string;          // e.g. "BBMP", "GCC"
  cityName?: string;                  // e.g. "Bengaluru", "Devanahalli"
  townName?: string;                  // e.g. "Devanahalli"
  suburbName?: string;                // e.g. "Yelahanka"
  neighbourhoodName?: string;         // e.g. "Bettenahalli"
  villageName?: string;               // e.g. "Bettenahalli"
  cityId: string;                     // e.g. "bengaluru", "chennai", "unresolved_city"
  corporationId?: string;             // e.g. "gba_bbmp", "gcc"
  zoneId?: string;                    // e.g. "yelahanka", "royapuram"
  wardId?: string;                    // e.g. "ward_004"
  localityName: string;               // e.g. "Bettenahalli", "Hunasamaranahalli"
  fullAddress: string;
  provider: string;                   // e.g. "NominatimGeoAdapter"
  rawAddress?: Record<string, string>; // Unmodified provider key-value map
}

export interface AdministrativeJurisdiction {
  country: string;
  state: string;
  cityId: string;
}

export interface GeoPolygonBoundary {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface AgencyJurisdictionScope {
  state: string;
  supportedDistricts?: string[];      // e.g. ["bengaluru urban", "bangalore rural", "ramanagara", ...]
  supportedMunicipalities?: string[]; // e.g. ["bbmp", "gba", "gcc"]
  supportedCities?: string[];         // e.g. ["bengaluru", "devanahalli", "yelahanka"]
  excludedDistricts?: string[];       // Explicitly excluded districts
  polygonBoundary?: GeoPolygonBoundary; // Extensible GeoJSON point-in-polygon boundary
}

// ── Taxonomy Domain ──────────────────────────────────────────────────────────
export type DepartmentCategoryKey =
  | "electricity"
  | "water"
  | "sanitation"
  | "roads"
  | "traffic"
  | "publicworks";

export type SeverityLevel = "low" | "medium" | "high" | "critical";

export interface IssueSubcategory {
  key: string;
  displayName: string;
}

export interface IssueTypeDefinition {
  key: string;
  displayName: string;
  categoryKey: DepartmentCategoryKey;
  subcategoryKey: string;
  defaultSeverity: SeverityLevel;
}

export interface IssueClassification {
  status?: "SUCCESS" | "LOW_CONFIDENCE" | "FAILED";
  categoryKey: DepartmentCategoryKey;
  subcategoryKey: string;
  issueTypeKey: string;
  issueTypeDisplayName: string;
  visualSeverity: SeverityLevel;
  confidence: number;
  safetyRiskDescription: string;
  priorityScore: number;
  priorityReasoning: string;
  visualObservations: string[];
  rawAIOutput?: Record<string, unknown>;
}

// ── SLA & Governance Domain ─────────────────────────────────────────────────
export interface SLAPolicy {
  resolutionHours: Record<SeverityLevel, number>;
}

// ── Agency Domain ────────────────────────────────────────────────────────────
export interface Agency {
  agencyId: string;                   // e.g. "bengaluru_bescom", "chennai_tangedco"
  cityId: string;                     // Primary regional hub
  categoryKey: DepartmentCategoryKey;
  officialName: string;
  shortCode: string;                  // e.g. "BESCOM", "TANGEDCO"
  contactEmail: string;
  emailAliases: string[];
  jurisdiction?: AgencyJurisdictionScope; // Declarative operational jurisdiction
  slaPolicy?: SLAPolicy;
}

// ── Routing Domain ───────────────────────────────────────────────────────────
export type RoutingMethod =
  | "DETERMINISTIC_EXACT"
  | "JURISDICTION_FALLBACK"
  | "UNRESOLVED_MANUAL_REVIEW";

export interface RoutingDecision {
  routingId: string;
  timestamp: string;                  // ISO Timestamp
  cityId?: string | null;             // Optional municipal city hub (null for rural locations)
  corporationId?: string | null;
  zoneId?: string | null;
  wardId?: string | null;
  categoryKey: DepartmentCategoryKey;
  subcategoryKey: string;
  issueTypeKey: string;
  agencyId: string | "UNRESOLVED";    // Safe failure state
  agencyName: string;
  routingMethod: RoutingMethod;
  routingVersion: string;             // e.g. "1.0.0"
  confidence: number;
  reason: string;
}

// ── Issue Lifecycle Domain ───────────────────────────────────────────────────
export type PrimaryIssueStatus =
  | "submitted"
  | "processing"
  | "analyzed"
  | "routed"
  | "in_repair"
  | "resolved"
  | "rejected"
  | "unresolved_review";

export type DepartmentStage =
  | "assigned"
  | "accepted"
  | "crew_assigned"
  | "repair_started"
  | "ready_for_verification"
  | "needs_rework"
  | "closed";

export interface LifecycleTransitionEvent {
  previousStatus: PrimaryIssueStatus | DepartmentStage;
  newStatus: PrimaryIssueStatus | DepartmentStage;
  timestamp: string;
  actor: string;
  reason?: string;
}

export interface IssueLifecycleState {
  currentStatus: PrimaryIssueStatus;
  departmentStage: DepartmentStage;
  updatedAt: string;
  updatedBy: string;
  history: LifecycleTransitionEvent[];
}

// ── Auth & RBAC Domain ───────────────────────────────────────────────────────
export type SystemRole =
  | "citizen"
  | "department_officer"
  | "department_admin"
  | "command_center_admin"
  | "super_admin";

export interface UserIdentity {
  uid: string;
  email: string;
  role: SystemRole;
  cityScope?: string | null;          // e.g. "bengaluru" (undefined = super admin / all cities)
  agencyScope?: string | null;        // e.g. "bengaluru_bescom"
  departmentId?: string | null;
  unitId?: string | null;
  teamId?: string | null;
  jurisdictionScope?: {
    corporationId?: string;
    zoneId?: string;
    wardId?: string;
  };
  permissions: string[];
}

// ── Operational Assignment Domain ────────────────────────────────────────────
export interface OperationalAssignment {
  agencyId: string;
  unitId?: string | null;
  unitName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  crewId?: string | null;
  crewName?: string | null;
  officerId?: string | null;
  officerName?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
}

export interface RoutingOverride {
  previousAgencyId: string;
  newAgencyId: string;
  newAgencyName: string;
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
  method: "ADMIN_OVERRIDE";
}

// ── Audit Logging Domain ─────────────────────────────────────────────────────
export type AuditAction =
  | "ISSUE_SUBMITTED"
  | "ISSUE_ROUTED"
  | "ISSUE_ACKNOWLEDGED"
  | "ISSUE_ASSIGNED"
  | "STATUS_CHANGED"
  | "ROUTING_OVERRIDDEN"
  | "ISSUE_RESOLVED"
  | "ISSUE_REOPENED";

export interface AuditLogRecord {
  auditId: string;
  issueId: string;
  actorId: string;
  actorEmail: string;
  actorRole: SystemRole;
  action: AuditAction;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
  timestamp: string;
}

export interface ResolutionPayload {
  summary: string;
  evidenceImageUrls?: string[];
  resolvedAt: string;
  resolvedByUid: string;
  resolvedByName: string;
}

// ── Auxiliary Operational Types ──────────────────────────────────────────────
export interface ActionPlan {
  crew_required: string;
  estimated_workers: number;
  estimated_duration: string;
  repair_steps: string[];
  traffic_management: string;
  safety_protocols: string[];
  expected_completion: string;
  reasoning?: string;
}

export interface Verification {
  verified: boolean;
  confidence: number;
  notes: string;
  verified_at?: string;
  verified_by?: string;
}

// ── Canonical Issue Model ────────────────────────────────────────────────────
export interface CanonicalCivicIssue {
  id: string;
  cityId: string;                     // "bengaluru", "chennai", "mumbai"
  location: GeoContext;
  categoryKey: DepartmentCategoryKey;
  assignedAgencyId: string;
  assignedAgencyName: string;
  routingDecision?: RoutingDecision;
  routingOverride?: RoutingOverride | null;
  assignment?: OperationalAssignment | null;
  resolution?: ResolutionPayload | null;
  primaryStatus: PrimaryIssueStatus;
  departmentStage: DepartmentStage;
  lifecycleState?: IssueLifecycleState;
  reporterUid: string;
  rawDescription: string;
  imageUrl: string;
  submittedAt: string;
  updatedAt: string;
  confirmationCount: number;
  commentCount: number;
  isEscalated: boolean;
  aiObservations?: IssueClassification;
  ai?: Record<string, any>;
  actionPlan?: ActionPlan | null;
  verification?: Verification | null;
  isLegacyDocument?: boolean;
  state?: string;
  parentIssueId?: string | null;
  childIssueIds?: string[];
  excludedAgencies?: string[];
  reassignmentCount?: number;
  citizenSlaDueAt?: any;
  ackDueAt?: any;
  slaDueAt?: any;
  slaRemainingMs?: number | null;
  acknowledgedAt?: any;
  resolutionSubmittedAt?: any;
  closedAt?: any;
  closedBy?: string | null;
  resolutionSubmittedBy?: string | null;
  afterEvidenceUrl?: string | null;
  lastReasonCode?: string | null;
}

// ── City Configuration Contract ──────────────────────────────────────────────
export interface CityConfig {
  cityId: string;
  name: string;
  state: string;
  country: string;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  addressKeywords: string[];
  administrativeHierarchy: {
    corporationName: string;
    hasZones: boolean;
    hasWards: boolean;
    zones?: Array<{ id: string; name: string }>;
    wards?: Array<{ id: string; name: string; code: string }>;
  };
  agencies: Agency[];
  routingRules?: Array<{
    categoryKey: DepartmentCategoryKey;
    subcategoryKey?: string;
    zoneId?: string;
    wardId?: string;
    assignedAgencyId: string;
  }>;
  slaPolicies?: Record<DepartmentCategoryKey, Record<SeverityLevel, number>>;
  version: string;
}

// ── Provider Ports / Interfaces ─────────────────────────────────────────────
export interface GeoProvider {
  name: string;
  reverseGeocode(coords: GeoCoordinates): Promise<GeoContext>;
}

export interface AIProvider {
  name: string;
  analyzeImage(imageBase64: string, userDescription?: string): Promise<IssueClassification>;
  verifyRepair(beforeImage: string, afterImage: string): Promise<Verification>;
}

export interface StorageProvider {
  uploadImage(fileBuffer: Buffer | string, path: string): Promise<string>;
}

export interface IssueRepository {
  getById(issueId: string): Promise<CanonicalCivicIssue | null>;
  save(issue: CanonicalCivicIssue): Promise<void>;
  updateLifecycle(issueId: string, newState: IssueLifecycleState): Promise<void>;
  queryByAgency(agencyId: string, cityId: string): Promise<CanonicalCivicIssue[]>;
  subscribeToAgency(agencyId: string, cityId: string, callback: (issues: CanonicalCivicIssue[]) => void): () => void;
}
