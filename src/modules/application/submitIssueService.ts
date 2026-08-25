import type {
  AIProvider,
  CanonicalCivicIssue,
  GeoCoordinates,
  GeoProvider,
  IssueClassification,
  IssueRepository,
} from "@/src/modules/contracts";
import { err, ok, Result, ValidationError } from "@/src/modules/core";
import { DeterministicRoutingEngine } from "@/src/modules/routing";
import { TaxonomyEngine } from "@/src/modules/taxonomy";
import { LifecycleStateMachine } from "@/src/modules/lifecycle";
import { LifecycleService } from "@/src/modules/lifecycle/lifecycleService";

export interface SubmitIssueDTO {
  coordinates: GeoCoordinates;
  imageBase64: string;
  userDescription?: string;
  reporterUid: string;
  imageUrl?: string;
  mockClassification?: IssueClassification; // Explicit TEST/MOCK classification for backend testing without Gemini API quota blocks
}

export class SubmitIssueService {
  constructor(
    private geoProvider: GeoProvider,
    private aiProvider: AIProvider,
    private issueRepository: IssueRepository
  ) {}

  public async submitIssue(dto: SubmitIssueDTO): Promise<Result<CanonicalCivicIssue, ValidationError>> {
    if (!dto.coordinates || typeof dto.coordinates.latitude !== "number" || typeof dto.coordinates.longitude !== "number") {
      return err(new ValidationError("Valid coordinates latitude and longitude are required", "coordinates"));
    }
    if (!dto.reporterUid || !dto.reporterUid.trim()) {
      return err(new ValidationError("reporterUid must be a non-empty string", "reporterUid"));
    }

    // 1. Geocode location via GeoProvider
    const geoContext = await this.geoProvider.reverseGeocode(dto.coordinates);

    // 2. Perform AI visual observation via AIProvider or use explicit TEST/MOCK classification
    let aiClassification: IssueClassification;
    if (dto.mockClassification) {
      aiClassification = dto.mockClassification;
    } else {
      try {
        aiClassification = await this.aiProvider.analyzeImage(
          dto.imageBase64 || "data:image/jpeg;base64,mock",
          dto.userDescription
        );
      } catch {
        aiClassification = {
          status: "FAILED",
          categoryKey: "unknown" as any,
          subcategoryKey: "unknown",
          issueTypeKey: "unclassified",
          issueTypeDisplayName: "Unclassified Report (AI Execution Failed)",
          visualSeverity: "medium" as const,
          confidence: 0.0,
          safetyRiskDescription: "AI execution failed or timed out",
          priorityScore: 0.0,
          priorityReasoning: "Unallocated due to AI failure",
          visualObservations: ["AI network call timed out or failed"],
        };
      }
    }

    // 3. Validate taxonomy category (allow 'unknown' for AI failure routing)
    if ((aiClassification.categoryKey as string) !== "unknown" && !TaxonomyEngine.isSupportedCategory(aiClassification.categoryKey)) {
      return err(new ValidationError(`Unsupported taxonomy category '${aiClassification.categoryKey}'`, "categoryKey"));
    }

    // 4. Construct Issue ID and execute single atomic CREATE_AND_ROUTE transaction
    const issueId = `iss_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const createResult = await LifecycleService.createAndRoute({
      issueId,
      photoUrl: dto.imageUrl ?? "https://placeholder.civicpulse.ai/issue.jpg",
      userDescription: dto.userDescription ?? "",
      geoContext,
      classification: aiClassification,
      reporterUid: dto.reporterUid,
    });

    const issue: CanonicalCivicIssue = {
      id: issueId,
      cityId: geoContext.cityId || "unresolved_city",
      location: geoContext,
      categoryKey: aiClassification.categoryKey,
      assignedAgencyId: createResult.assignedAgencyId,
      assignedAgencyName: createResult.assignedAgencyId === "UNRESOLVED" ? "Unresolved Manual Review Queue" : "Authoritative Regional Agency",
      state: "ROUTED" as any,
      primaryStatus: "submitted",
      departmentStage: "assigned",
      reporterUid: dto.reporterUid,
      rawDescription: dto.userDescription ?? "",
      imageUrl: dto.imageUrl ?? "https://placeholder.civicpulse.ai/issue.jpg",
      submittedAt: timestamp,
      updatedAt: timestamp,
      confirmationCount: 1,
      commentCount: 0,
      isEscalated: false,
      parentIssueId: null,
      childIssueIds: [],
      excludedAgencies: [],
      reassignmentCount: 0,
      aiObservations: aiClassification,
    };

    return ok(issue);
  }
}
