import { Timestamp } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import { getAdminDb } from "@/lib/firebase/admin";
import { reverseGeocode, type GeocodedLocation } from "@/lib/geocode";
import { generateEscalationBrief } from "./generateBrief";
import { mapToDepartment } from "@/lib/departments";

// ── Gemini response shape ────────────────────────────────────────────────────

interface AiResult {
  // Core classification
  issue_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  safety_risk: string;
  responsible_authority: string;

  // Area intelligence
  area_category: string;
  area_confidence: number;
  area_reasoning: string;
  affected_entity_type: string | null;
  functional_importance: string;
  likely_daily_activity: string;

  // Impact analysis
  affected_groups: string[];
  estimated_population_impact: string;
  impact_score: number;
  impact_reasoning: string;

  // Priority — Gemini owns this entirely
  priority_score: number;
  priority_reasoning: string;

  // Context explainability
  context_used: boolean;
  context_influence: "none" | "low" | "medium" | "high";

  // Repair intelligence — consumed by downstream agents, not displayed to citizens
  repair_complexity: "low" | "medium" | "high" | "complex";
  repair_category: string;
  estimated_work_hours: number;
  weather_sensitive: boolean;
  inspection_required: boolean;
  temporary_public_safety_required: boolean;
  required_equipment: string[];
  required_skills: string[];
  operational_constraints: string[];
  verification_checkpoints: string[];
  routing_reasoning: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

const VALID_AREA_CATEGORIES = new Set([
  "Residential Area",
  "Commercial Area",
  "IT & Research District",
  "Educational Campus",
  "Healthcare Zone",
  "Industrial Estate",
  "Transport Hub",
  "Government Zone",
  "Mixed Use Area",
]);

const VALID_INFLUENCES = new Set(["none", "low", "medium", "high"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function mimeTypeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Pre-detects a likely area category from the address text before calling Gemini.
 * Provides a strong hint so the model doesn't anchor on the generic zone_type label.
 */
function detectLandmarkCategory(address: string, areaName: string): string | null {
  const text = `${address} ${areaName}`;
  if (/iitm|iit[\s-]?madras|research park|it park|tech park|ramanujan|tidel|rajiv gandhi it|cognizant|infosys|wipro|zoho|freshworks|tcs|hcl|accenture|software park/i.test(text))
    return "IT & Research District";
  if (/apollo|fortis|manipal|miot|stanley|global hospital|health city|medical college|government hospital|district hospital|primary health|clinic|hospital/i.test(text))
    return "Healthcare Zone";
  if (/anna university|iim|iit|nit|srm|vit|sathyabama|loyola|madras university|school|college|university|polytechnic|vidyalaya|matriculation|cbse|campus/i.test(text))
    return "Educational Campus";
  if (/railway station|central station|egmore|tambaram|bus stand|bus terminus|airport|metro station|koyambedu/i.test(text))
    return "Transport Hub";
  if (/secretariat|collectorate|high court|police station|government office|municipal office|corporation office|taluk office/i.test(text))
    return "Government Zone";
  if (/sipcot|tidco|industrial estate|industrial area|manufacturing|factory|warehouse/i.test(text))
    return "Industrial Estate";
  if (/mall|shopping centre|shopping complex|market|bazaar|commercial complex|supermarket/i.test(text))
    return "Commercial Area";
  return null;
}

function buildPrompt(
  description: string,
  lat: number,
  lng: number,
  geo: GeocodedLocation | null,
  contextHint: string | null,
): string {
  const detectedCategory = detectLandmarkCategory(geo?.address ?? "", geo?.area_name ?? "");

  const locationLines = geo
    ? [
        `Address: ${geo.address}`,
        `Locality: ${geo.area_name}${geo.city ? `, ${geo.city}` : ""}${geo.state ? `, ${geo.state}` : ""}`,
        `Administrative land-use label (weak signal — often wrong for named landmarks): ${geo.zone_type.replace(/_/g, " ")}`,
        detectedCategory
          ? `DETECTED FUNCTIONAL LANDMARK IN ADDRESS → Suggested area_category: ${detectedCategory} (override if image evidence contradicts this)`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : `GPS coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const contextSection = contextHint
    ? `\nCITIZEN-PROVIDED CONTEXT HINT: "${contextHint}"
NOTE: This is optional user-provided context. The address and detected landmark above are stronger signals. Use this hint to resolve ambiguity, not to override clear landmark evidence.`
    : `\nNo additional context hint was provided by the citizen.`;

  return `You are a civic issue analysis agent for Community Hero AI, a municipal operations platform.

A citizen has submitted a photo of a community infrastructure problem.

Analyze the image and all provided context to produce a complete structured assessment. Focus on the FUNCTIONAL IMPORTANCE of the area, not just administrative labels.

REPORTER DESCRIPTION: "${description}"
${locationLines}
${contextSection}

Return a JSON object with ALL of the following fields:

{
  "issue_type": "concise label (e.g. Pothole, Garbage Dump, Broken Streetlight, Waterlogging, Open Manhole, Road Cave-in, Damaged Footpath, Sewage Leak, Stray Animals, Traffic Signal Fault)",
  "severity": "low | medium | high | critical",
  "confidence": 0.0 to 1.0,
  "summary": "2-3 sentences describing the issue for a municipal authority",
  "safety_risk": "one sentence describing the public safety risk if unaddressed",
  "responsible_authority": "MUST be exactly one of: Roads & Highways Division | Water Supply & Sewerage (CMWSSB) | Electricity Distribution | Solid Waste & Sanitation | Traffic Management | Public Works Department",

  "area_category": "one of: Residential Area | Commercial Area | IT & Research District | Educational Campus | Healthcare Zone | Industrial Estate | Transport Hub | Government Zone | Mixed Use Area",
  "area_confidence": 0.0 to 1.0,
  "area_reasoning": "1-2 sentences explaining why you classified this area functionally, referencing landmarks and daily use rather than just the generic administrative zone",
  "affected_entity_type": "the primary nearby entity type if relevant (e.g. hospital, school, it_park, bus_stand, railway_station, government_office) or null",
  "functional_importance": "1-2 sentences describing the real-world functional importance of this location (e.g. 'Major technology and innovation campus serving thousands of daily tech employees.')",
  "likely_daily_activity": "Short phrase describing the typical activity here (e.g. 'Heavy employee traffic during office hours', 'Pedestrian student activity', 'Constant emergency vehicle access')",

  "affected_groups": ["list of affected groups, e.g. Residents, Students, Commuters, Hospital patients, IT employees"],
  "estimated_population_impact": "estimated number of people affected (e.g. 200+ daily commuters, ~500 residents)",
  "impact_score": 0.0 to 10.0,
  "impact_reasoning": "2-3 sentences assessing the practical impact of the issue on the likely daily activity and functional importance of this location",

  "priority_score": 0.0 to 10.0,
  "priority_reasoning": "2-3 sentences explaining why this priority score was assigned, referencing severity, area context, and safety risk",

  "context_used": true or false (whether the citizen's context hint influenced your analysis),
  "context_influence": "none | low | medium | high (how much the context hint changed your assessment compared to GPS-only analysis)",

  "repair_complexity": "low | medium | high | complex",
  "repair_category": "one of: patching | resurfacing | utility_repair | drainage | electrical | structural | clearing | waterway | signage | other",
  "estimated_work_hours": realistic number of hours for a Chennai municipal crew to fully resolve this issue,
  "weather_sensitive": true or false (will rain or extreme heat significantly delay or complicate this repair?),
  "inspection_required": true or false (does this require a pre-repair site inspection by an engineer or supervisor before work begins?),
  "temporary_public_safety_required": true or false (does the repair require road closure, barriers, traffic diversions, or crowd control?),
  "required_equipment": ["specific equipment categories needed, e.g. 'JCB excavator', 'road roller', 'suction pump', 'electrical testing kit', 'concrete mixer'"],
  "required_skills": ["specific crew skills or certifications required, e.g. 'licensed electrician', 'plumber', 'structural engineer', 'heavy machinery operator'"],
  "operational_constraints": ["maximum 3 constraints the field crew must know, e.g. 'avoid peak traffic 8am-10am and 5pm-8pm', 'requires utility shutdown permit from TANGEDCO', 'night work only due to traffic'"],
  "verification_checkpoints": ["maximum 3 specific physical checks to confirm repair is complete, e.g. 'road surface flush and smooth with no edges', 'drain freely flowing with no backwater', 'manhole cover secure and flush with road level'"],
  "routing_reasoning": "1-2 sentences explaining exactly why this issue belongs to the assigned department and not another"
}

REPAIR INTELLIGENCE GUIDE (fields are consumed by downstream AI agents — not shown to citizens):
- repair_complexity: how complex is the actual repair work? low=simple patch/clean, medium=standard repair, high=specialized work, complex=multi-day or multi-department
- repair_category: the primary type of work required (patching, resurfacing, utility_repair, drainage, electrical, structural, clearing, waterway, signage, other)
- estimated_work_hours: realistic total crew-hours including setup, work, and cleanup; for Chennai municipal conditions
- operational_constraints: site-specific constraints the crew must respect — not generic advice, but constraints from the image and location
- verification_checkpoints: specific, observable physical states that confirm the repair is done; must be checkable without specialist equipment
- routing_reasoning: cite the specific service domain (roads, water, electricity, waste, traffic, public works) and why this department owns it

SEVERITY GUIDE:
- critical: immediate danger to life (open sewer, collapsed road, downed power lines, serious flooding)
- high: significant injury risk or major disruption (large pothole, broken streetlight on busy road, main water break)
- medium: noticeable impact on daily life (moderate road damage, intermittent signal fault, recurring illegal dumping)
- low: minor inconvenience with low risk (small crack, scattered litter, cosmetic damage)

AREA INTELLIGENCE RULES (CRITICAL — read carefully before assigning area_category):
- The "Administrative land-use label" in the location section (e.g. 'residential', 'commercial') is a WEAK SIGNAL from a generic geocoder. It is often WRONG for named landmarks.
- Your job is to determine the FUNCTIONAL use of the location — what actually happens there daily — NOT to repeat the geocoder's administrative label.
- If a "DETECTED FUNCTIONAL LANDMARK" line is present above, it is a strong pre-computed hint based on address text. You MUST use it as your area_category UNLESS the image clearly shows something different.
- Even without a detected landmark: scan the Address and Locality lines carefully for named entities (hospitals, IT parks, schools, stations, government buildings, etc.) and let those override any generic zone label.
- EXAMPLES of correct functional override:
  • Address has 'IITM Research Park' but admin label is 'residential' → area_category MUST BE 'IT & Research District'
  • Address has 'Apollo Hospital' → area_category MUST BE 'Healthcare Zone'
  • Address has 'Anna University' → area_category MUST BE 'Educational Campus'
  • Address has 'Chennai Central Railway Station' → area_category MUST BE 'Transport Hub'
  • Address has 'Secretariat' or 'High Court' → area_category MUST BE 'Government Zone'
- Only use 'Residential Area' if the address has no named landmarks AND the image shows a clearly residential neighbourhood.

PRIORITY RULES:
- Healthcare Zones, Transport Hubs: issues here affect vulnerable populations — reflect this in priority_score
- Educational Campuses: pedestrian hazards near schools are especially critical during arrival/departure hours
- IT & Research Districts, Commercial Areas: disruptions affect employee commute, business operations, and delivery services
- Active safety hazards visible in the image: never assign priority_score below 6.0

Return only valid JSON. No markdown, no code fences, no explanation.`;
}

const RETRY_DELAYS_MS = [2_000, 4_000] as const;
const GEMINI_TIMEOUT_MS = 25_000;
const IMAGE_FETCH_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No complete JSON object found in response: ${text.substring(0, 120)}`);
  }
  return text.slice(start, end + 1);
}

function isRetryable(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  // Never retry 429 — quota exhausted or rate limited, fall back to deterministic immediately
  if (msg.includes("429")) return false;
  return (
    msg.includes("No complete JSON") ||
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("Service Unavailable")
  );
}

// ── Deterministic fallback ───────────────────────────────────────────────────

function deterministicAnalysis(description: string): AiResult {
  const text = description.toLowerCase();

  let issue_type = "Infrastructure Issue";
  let responsible_authority: AiResult["responsible_authority"] = "Public Works Department";
  let repair_category: AiResult["repair_category"] = "other";

  if (/pothole|road|crack|pavement|footpath|kerb|tar|asphalt|concrete|surface/i.test(text)) {
    issue_type = "Road Damage";
    responsible_authority = "Roads & Highways Division";
    repair_category = "patching";
  } else if (/water|pipe|leak|sewage|sewer|drain|flood|waterlog|manhole|gutter/i.test(text)) {
    issue_type = /sewer|sewage/.test(text) ? "Sewage Leak" : /flood|waterlog/.test(text) ? "Waterlogging" : "Water Pipe Leak";
    responsible_authority = "Water Supply & Sewerage (CMWSSB)";
    repair_category = /flood|waterlog/.test(text) ? "drainage" : "utility_repair";
  } else if (/light|streetlight|electric|power|wire|transformer|voltage/i.test(text)) {
    issue_type = "Electrical Issue";
    responsible_authority = "Electricity Distribution";
    repair_category = "electrical";
  } else if (/garbage|waste|trash|litter|dump|rubbish|bin/i.test(text)) {
    issue_type = "Garbage Dump";
    responsible_authority = "Solid Waste & Sanitation";
    repair_category = "clearing";
  } else if (/traffic|signal|sign|marking|junction/i.test(text)) {
    issue_type = "Traffic Signal Fault";
    responsible_authority = "Traffic Management";
    repair_category = "signage";
  }

  let severity: AiResult["severity"] = "medium";
  if (/critical|emergency|danger|urgent|collapse|dead|injur|accident|fire|electr/i.test(text)) {
    severity = "critical";
  } else if (/large|major|serious|significant|broken|bust|overflow|flood/i.test(text)) {
    severity = "high";
  } else if (/minor|small|little|slight|crack/i.test(text)) {
    severity = "low";
  }

  const priorityMap: Record<AiResult["severity"], number> = { critical: 9, high: 7, medium: 5, low: 3 };
  const impactMap: Record<AiResult["severity"], number> = { critical: 8, high: 6, medium: 4, low: 2 };

  return {
    issue_type,
    severity,
    confidence: 0.5,
    summary: description.slice(0, 200) || "Issue reported by citizen. Gemini analysis unavailable — deterministic fallback used.",
    safety_risk: severity === "critical" || severity === "high"
      ? "Potential hazard to public safety. Manual inspection recommended."
      : "Low immediate safety risk. Monitor and schedule routine repair.",
    responsible_authority,
    area_category: "Residential Area",
    area_confidence: 0.3,
    area_reasoning: "Area classification unavailable without AI image analysis.",
    affected_entity_type: null,
    functional_importance: "Standard community area.",
    likely_daily_activity: "General community activity.",
    affected_groups: ["Residents", "Commuters"],
    estimated_population_impact: "~100 residents",
    impact_score: impactMap[severity],
    impact_reasoning: "Impact estimated from reported severity. Full AI analysis unavailable.",
    priority_score: priorityMap[severity],
    priority_reasoning: "Priority assigned from severity keywords. Full AI analysis unavailable.",
    context_used: false,
    context_influence: "none",
    repair_complexity: severity === "critical" ? "complex" : severity === "high" ? "high" : "medium",
    repair_category,
    estimated_work_hours: severity === "critical" ? 16 : severity === "high" ? 8 : 4,
    weather_sensitive: false,
    inspection_required: severity === "critical" || severity === "high",
    temporary_public_safety_required: severity === "critical",
    required_equipment: [],
    required_skills: [],
    operational_constraints: [],
    verification_checkpoints: ["Visual inspection confirms issue is resolved"],
    routing_reasoning: `Assigned to ${responsible_authority} based on issue type keywords in the description.`,
  };
}

async function callWithRetry<T>(fn: () => Promise<T>, issueId: string): Promise<T> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= RETRY_DELAYS_MS.length;
      if (isLast || !isRetryable(err)) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[${issueId}] Retryable error — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1_000}s:`,
        err instanceof Error ? err.message : String(err),
      );
      await sleep(delay);
    }
  }
  throw new Error("callWithRetry: exhausted all retries without returning or throwing.");
}

// ── Duplicate detection ──────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function checkDuplicate(
  db: ReturnType<typeof getAdminDb>,
  issueId: string,
  issueType: string,
  lat: number,
  lng: number,
): Promise<{ isDuplicate: boolean; duplicateOf?: string; distance?: number }> {
  const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const snap = await db.collection("issues")
    .where("submitted_at", ">", thirtyDaysAgo)
    .orderBy("submitted_at", "desc")
    .limit(50)
    .get();

  let closestId: string | undefined;
  let closestDist = Infinity;

  for (const docSnap of snap.docs) {
    if (docSnap.id === issueId) continue;
    const d = docSnap.data();
    const aiData = d.ai as Record<string, unknown> | null;
    if (aiData?.issue_type !== issueType) continue;
    const loc = d.location as { lat: number; lng: number } | null;
    if (!loc) continue;
    const dist = haversineMeters(lat, lng, loc.lat, loc.lng);
    if (dist < 50 && dist < closestDist) {
      closestDist = dist;
      closestId = docSnap.id;
    }
  }

  return closestId
    ? { isDuplicate: true, duplicateOf: closestId, distance: Math.round(closestDist) }
    : { isDuplicate: false };
}

// ── Main analysis function ───────────────────────────────────────────────────

export async function analyzeIssue(issueId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let issueRef: any = null;

  try {
    const db = getAdminDb();
    issueRef = db.collection("issues").doc(issueId);
    const snap = await issueRef.get();
    if (!snap.exists) {
      console.error(`[${issueId}] Issue not found in Firestore.`);
      return;
    }
    const data = snap.data()!;

    if (data.status !== "processing") {
      console.info(`[${issueId}] Status is "${data.status as string}", skipping.`);
      return;
    }

    const imageUrl = data.image_url as string;
    const location = data.location as { lat: number; lng: number };
    const contextHint = (data.context_hint as string | null) ?? null;

    // Fetch geocode and image in parallel
    const [geo, imageRes] = await Promise.all([
      reverseGeocode(location.lat, location.lng),
      withTimeout(fetch(imageUrl), IMAGE_FETCH_TIMEOUT_MS, "Image fetch"),
    ]);

    if (!imageRes.ok) {
      throw new Error(`Image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
    }
    const imageBase64 = Buffer.from(await imageRes.arrayBuffer()).toString("base64");
    const mimeType = mimeTypeFromUrl(imageUrl);

    // Write address fields immediately so UI can show them while Gemini runs
    if (geo) {
      await issueRef.update({
        "location.address": geo.address,
        "location.area_name": geo.area_name,
        "location.zone_type": geo.zone_type,
      });
    }

    const description = (data.raw_description as string | undefined) ?? "";
    const prompt = buildPrompt(
      description.trim() || "No description provided.",
      location.lat,
      location.lng,
      geo,
      contextHint,
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment.");

    const ai = new GoogleGenAI({ apiKey });

    let aiResult: AiResult;
    let usedFallback = false;

    try {
      aiResult = await callWithRetry(async () => {
        const response = await withTimeout(
          ai.models.generateContent({
            model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { data: imageBase64, mimeType } },
                  { text: prompt },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 4096,
            },
          }),
          GEMINI_TIMEOUT_MS,
          "Gemini generateContent",
        );

        const rawText = (response.text ?? "").trim();
        const jsonText = extractJson(rawText);
        return JSON.parse(jsonText) as AiResult;
      }, issueId);
    } catch (geminiErr) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      console.warn(`[${issueId}] Gemini failed (${msg.slice(0, 80)}), using deterministic fallback.`);
      aiResult = deterministicAnalysis(description.trim());
      usedFallback = true;
    }

    // ── Validate & sanitise ────────────────────────────────────────────────

    const requiredFields: (keyof AiResult)[] = [
      "issue_type", "severity", "confidence", "summary",
      "safety_risk", "responsible_authority",
      "area_category", "area_confidence", "area_reasoning",
      "functional_importance", "likely_daily_activity",
      "affected_groups", "estimated_population_impact", "impact_score", "impact_reasoning",
      "priority_score", "priority_reasoning",
    ];
    for (const field of requiredFields) {
      if (!(field in aiResult)) {
        throw new Error(`Gemini response missing required field: "${field}"`);
      }
    }

    // Sanitise enums and ranges
    if (!VALID_SEVERITIES.has(aiResult.severity)) aiResult.severity = "medium";
    aiResult.confidence = Math.min(1, Math.max(0, Number(aiResult.confidence) || 0));

    if (!VALID_AREA_CATEGORIES.has(aiResult.area_category)) aiResult.area_category = "Mixed Use Area";
    aiResult.area_confidence = Math.min(1, Math.max(0, Number(aiResult.area_confidence) || 0));

    // Backend only validates — Gemini owns the score
    aiResult.priority_score = Math.min(10, Math.max(0, Number(aiResult.priority_score) || 5));
    aiResult.impact_score = Math.min(10, Math.max(0, Number(aiResult.impact_score) || 0));

    // String field fallbacks
    aiResult.functional_importance = String(aiResult.functional_importance ?? "");
    aiResult.likely_daily_activity = String(aiResult.likely_daily_activity ?? "");
    aiResult.impact_reasoning = String(aiResult.impact_reasoning ?? "");

    if (!Array.isArray(aiResult.affected_groups)) aiResult.affected_groups = [];
    if (!VALID_INFLUENCES.has(aiResult.context_influence)) aiResult.context_influence = "none";
    aiResult.context_used = Boolean(aiResult.context_used);

    // Repair intelligence validation
    const VALID_COMPLEXITIES = new Set(["low", "medium", "high", "complex"]);
    if (!VALID_COMPLEXITIES.has(aiResult.repair_complexity)) aiResult.repair_complexity = "medium";
    if (!aiResult.repair_category) aiResult.repair_category = "other";
    aiResult.estimated_work_hours = Math.max(0.5, Math.min(240, Number(aiResult.estimated_work_hours) || 4));
    aiResult.weather_sensitive = Boolean(aiResult.weather_sensitive);
    aiResult.inspection_required = Boolean(aiResult.inspection_required);
    aiResult.temporary_public_safety_required = Boolean(aiResult.temporary_public_safety_required);
    if (!Array.isArray(aiResult.required_equipment)) aiResult.required_equipment = [];
    if (!Array.isArray(aiResult.required_skills)) aiResult.required_skills = [];
    if (!Array.isArray(aiResult.operational_constraints)) aiResult.operational_constraints = [];
    if (!Array.isArray(aiResult.verification_checkpoints)) aiResult.verification_checkpoints = [];
    aiResult.routing_reasoning = String(aiResult.routing_reasoning ?? "");

    const shouldEscalate = aiResult.severity === "critical" && !(data.escalated as boolean);

    // ── Routing Agent (deterministic — no AI) ─────────────────────────────
    const dept = mapToDepartment(aiResult.responsible_authority, aiResult.issue_type);

    // ── Write to Firestore ─────────────────────────────────────────────────

    await issueRef.update({
      // Area intelligence at document ROOT — clean for querying
      area_category: aiResult.area_category,
      area_confidence: aiResult.area_confidence,
      area_reasoning: aiResult.area_reasoning,
      affected_entity_type: aiResult.affected_entity_type ?? null,

      // Department assignment (Routing Agent result)
      assigned_department: dept.key,
      assigned_department_name: dept.name,
      assigned_department_email: dept.email,
      assigned_at: Timestamp.now(),
      assigned_by: "AI Analysis Agent",
      assignment_method: "AI Analysis + Rule Mapping",

      // AI analysis blob
      ai: {
        issue_type: aiResult.issue_type,
        severity: aiResult.severity,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        safety_risk: aiResult.safety_risk,
        responsible_authority: aiResult.responsible_authority,
        functional_importance: aiResult.functional_importance,
        likely_daily_activity: aiResult.likely_daily_activity,
        affected_groups: aiResult.affected_groups,
        estimated_population_impact: aiResult.estimated_population_impact,
        impact_score: aiResult.impact_score,
        impact_reasoning: aiResult.impact_reasoning,
        priority_score: aiResult.priority_score,
        priority_reasoning: aiResult.priority_reasoning,
        context_used: aiResult.context_used,
        context_influence: aiResult.context_influence,
        generated_at: Timestamp.now(),

        // Whether Gemini or deterministic fallback was used
        ai_fallback: usedFallback,

        // Repair intelligence — consumed by downstream agents
        repair_complexity: aiResult.repair_complexity,
        repair_category: aiResult.repair_category,
        estimated_work_hours: aiResult.estimated_work_hours,
        weather_sensitive: aiResult.weather_sensitive,
        inspection_required: aiResult.inspection_required,
        temporary_public_safety_required: aiResult.temporary_public_safety_required,
        required_equipment: aiResult.required_equipment,
        required_skills: aiResult.required_skills,
        operational_constraints: aiResult.operational_constraints,
        verification_checkpoints: aiResult.verification_checkpoints,
        routing_reasoning: aiResult.routing_reasoning,
      },

      status: "analyzed",
      updated_at: Timestamp.now(),
      ...(shouldEscalate
        ? {
            escalated: true,
            escalated_at: Timestamp.now(),
            escalation_reason: "Auto-escalated: AI classified severity as critical",
          }
        : {}),
    });

    console.info(
      `[${issueId}] Analysis complete: ${aiResult.issue_type} / ${aiResult.severity} / ` +
      `area=${aiResult.area_category} / priority=${aiResult.priority_score}`,
    );

    // Non-critical path: duplicate detection + escalation brief
    const [dupResult] = await Promise.all([
      checkDuplicate(db, issueId, aiResult.issue_type, location.lat, location.lng),
    ]);

    if (dupResult.isDuplicate && dupResult.duplicateOf) {
      const conf = dupResult.distance! < 20 ? "high" : dupResult.distance! < 35 ? "medium" : "low";
      await issueRef.update({
        duplicate_candidate: true,
        duplicate_of: dupResult.duplicateOf,
        duplicate_distance_meters: dupResult.distance,
        duplicate_confidence: conf,
      });
      console.info(`[${issueId}] Duplicate of ${dupResult.duplicateOf} at ${dupResult.distance}m (${conf})`);
    }

    if (shouldEscalate) {
      await generateEscalationBrief(issueId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${issueId}] Analysis failed:`, message);

    if (issueRef) {
      await issueRef.update({
        status: "error",
        "ai.error": message,
        updated_at: Timestamp.now(),
      }).catch((e: unknown) => {
        console.error(`[${issueId}] Failed to write error status:`, e);
      });
    }
  }
}
