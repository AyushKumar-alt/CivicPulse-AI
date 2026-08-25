import type {
  ActionPlan,
  CanonicalCivicIssue,
  DepartmentCategoryKey,
  DepartmentStage,
  PrimaryIssueStatus,
  Verification,
} from "@/src/modules/contracts";

export class LegacySchemaNormalizer {
  /**
   * Pure in-memory normalizer that converts raw legacy Firestore documents
   * (e.g. initial Chennai prototype docs lacking city_code or assigned_agency_id)
   * into canonical CanonicalCivicIssue models.
   * 
   * Boundaries:
   * - ZERO database calls
   * - ZERO network calls
   * - ZERO Gemini SDK calls
   * - Deterministic execution
   */
  public static normalize(id: string, data: Record<string, unknown>): CanonicalCivicIssue {
    const loc = (data.location as Record<string, unknown>) ?? {};
    const lat = typeof loc.lat === "number" ? loc.lat : 13.0827;
    const lng = typeof loc.lng === "number" ? loc.lng : 80.2707;
    const address = String(loc.address || loc.area_name || "");

    const addressLower = address.toLowerCase();
    const rawDept = String(data.assigned_department || "").toLowerCase();

    // 1. Resolve cityId deterministically from city_code or legacy address/department hints (NO AI fields used)
    let cityId = String(data.city_code || "");
    if (!cityId) {
      if (
        addressLower.includes("chennai") ||
        addressLower.includes("ambika street") ||
        addressLower.includes("cmwssb") ||
        addressLower.includes("tangedco") ||
        addressLower.includes("royapuram") ||
        addressLower.includes("adyar") ||
        addressLower.includes("anna nagar") ||
        rawDept.includes("cmwssb") ||
        rawDept.includes("tangedco")
      ) {
        cityId = "chennai";
      } else if (
        addressLower.includes("bengaluru") ||
        addressLower.includes("bangalore") ||
        addressLower.includes("bescom") ||
        addressLower.includes("bwssb") ||
        addressLower.includes("bbmp") ||
        addressLower.includes("yelahanka") ||
        addressLower.includes("hunasamaranahalli") ||
        addressLower.includes("kodagalahatti")
      ) {
        cityId = "bengaluru";
      } else {
        cityId = "unresolved_city";
      }
    }

    // 2. Resolve categoryKey
    let categoryKey: DepartmentCategoryKey = "publicworks";
    if (rawDept.includes("water") || rawDept.includes("cmwssb") || rawDept.includes("bwssb")) {
      categoryKey = "water";
    } else if (rawDept.includes("electric") || rawDept.includes("tangedco") || rawDept.includes("bescom") || rawDept.includes("power")) {
      categoryKey = "electricity";
    } else if (rawDept.includes("sanitation") || rawDept.includes("gcc") || rawDept.includes("bbmp")) {
      categoryKey = "sanitation";
    } else if (rawDept.includes("road")) {
      categoryKey = "roads";
    } else if (rawDept.includes("traffic")) {
      categoryKey = "traffic";
    } else if (data.category_key) {
      categoryKey = String(data.category_key) as DepartmentCategoryKey;
    }

    // 3. Resolve assignedAgencyId deterministically (NO AI fields used)
    let assignedAgencyId = String(data.assigned_agency_id || "");
    if (!assignedAgencyId) {
      if (cityId === "chennai") {
        if (categoryKey === "water" || rawDept.includes("cmwssb")) {
          assignedAgencyId = "chennai_cmwssb";
        } else if (categoryKey === "electricity" || rawDept.includes("tangedco")) {
          assignedAgencyId = "chennai_tangedco";
        } else if (categoryKey === "sanitation" || rawDept.includes("gcc")) {
          assignedAgencyId = "chennai_gcc";
        } else if (categoryKey === "roads") {
          assignedAgencyId = "chennai_roads";
        } else if (categoryKey === "traffic") {
          assignedAgencyId = "chennai_traffic";
        } else {
          assignedAgencyId = "generic_publicworks";
        }
      } else if (cityId === "bengaluru") {
        if (categoryKey === "electricity" || rawDept.includes("bescom")) {
          assignedAgencyId = "bengaluru_bescom";
        } else if (categoryKey === "water" || rawDept.includes("bwssb")) {
          assignedAgencyId = "bengaluru_bwssb";
        } else if (categoryKey === "sanitation" || rawDept.includes("bbmp")) {
          assignedAgencyId = "bengaluru_bbmp";
        } else if (categoryKey === "roads") {
          assignedAgencyId = "bengaluru_roads";
        } else if (categoryKey === "traffic") {
          assignedAgencyId = "bengaluru_traffic";
        } else {
          assignedAgencyId = "generic_publicworks";
        }
      } else {
        assignedAgencyId = "UNRESOLVED";
      }
    }

    const assignedAgencyName = String(
      data.assigned_department_name ||
        (assignedAgencyId !== "UNRESOLVED" ? assignedAgencyId : "Unassigned Agency")
    );

    const cityName =
      cityId === "chennai"
        ? "Chennai"
        : cityId === "bengaluru"
        ? "Bengaluru"
        : "Unresolved Location";

    const state =
      cityId === "chennai"
        ? "Tamil Nadu"
        : cityId === "bengaluru"
        ? "Karnataka"
        : "Unknown State";

    return {
      id,
      cityId,
      location: {
        coordinates: { latitude: lat, longitude: lng },
        country: "India",
        state,
        cityId,
        cityName,
        localityName: String(loc.area_name || "Locality"),
        fullAddress: address || `Location (${lat}, ${lng})`,
        provider: "LegacySchemaNormalizer",
      },
      categoryKey,
      assignedAgencyId,
      assignedAgencyName,
      primaryStatus: (data.status as PrimaryIssueStatus) || "analyzed",
      departmentStage: (data.department_status as DepartmentStage) || "assigned",
      reporterUid: String(data.reporter_uid || "anonymous"),
      rawDescription: String(data.raw_description || data.description || ""),
      imageUrl: String(data.image_url || ""),
      submittedAt: String(data.submitted_at || new Date().toISOString()),
      updatedAt: String(data.updated_at || new Date().toISOString()),
      confirmationCount: Number(data.confirmation_count ?? 0),
      commentCount: Number(data.comment_count ?? 0),
      isEscalated: Boolean(data.escalated ?? false),
      actionPlan: (data.action_plan as ActionPlan) ?? null,
      verification: (data.verification as Verification) ?? null,
      isLegacyDocument: true,
    };
  }
}
