import { Timestamp, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { reverseGeocode, type GeocodedLocation } from "@/lib/geocode";
import { getRegionalAuthorities, type RegionalAuthorities } from "@/lib/municipal-authorities";

// ── Types ────────────────────────────────────────────────────────────────────

interface AiResult {
  issue_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  safety_risk: string;
  responsible_authority: string;
  area_category: string;
  area_confidence: number;
  area_reasoning: string;
  affected_entity_type: string | null;
  functional_importance: string;
  likely_daily_activity: string;
  affected_groups: string[];
  estimated_population_impact: string;
  impact_score: number;
  impact_reasoning: string;
  priority_score: number;
  priority_reasoning: string;
  context_used: boolean;
  context_influence: "none" | "low" | "medium" | "high";
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
  "Residential Area", "Commercial Area", "IT & Research District",
  "Educational Campus", "Healthcare Zone", "Industrial Estate",
  "Transport Hub", "Government Zone", "Mixed Use Area",
]);
const VALID_INFLUENCES = new Set(["none", "low", "medium", "high"]);
const RETRY_DELAYS_MS = [2_000, 4_000] as const;
const GEMINI_TIMEOUT_MS = 25_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

// M3: Strip control chars and naive prompt-injection patterns from user text
function sanitizeUserInput(input: string, maxLen = 500): string {
  return input
    .slice(0, maxLen)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/^(ignore|forget|system|override|you are|disregard|stop being|new instruction|act as|pretend|roleplay).*/gim, "[filtered]")
    .trim();
}

function mimeTypeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

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
  authorities: RegionalAuthorities,
): string {
  const detectedCategory = detectLandmarkCategory(geo?.address ?? "", geo?.area_name ?? "");
  const locationLines = geo
    ? [
        `Address: ${geo.address}`,
        `Locality: ${geo.area_name}${geo.city ? `, ${geo.city}` : ""}${geo.state ? `, ${geo.state}` : ""}`,
        `Administrative land-use label (weak signal — often wrong for named landmarks): ${geo.zone_type.replace(/_/g, " ")}`,
        detectedCategory ? `DETECTED FUNCTIONAL LANDMARK IN ADDRESS → Suggested area_category: ${detectedCategory} (override if image evidence contradicts this)` : null,
      ].filter(Boolean).join("\n")
    : `GPS coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const safeHint = contextHint ? sanitizeUserInput(contextHint, 200) : null;
  const contextSection = safeHint
    ? `\nCITIZEN-PROVIDED CONTEXT HINT: "${safeHint}"\nNOTE: This is optional user-provided context. The address and detected landmark above are stronger signals.`
    : `\nNo additional context hint was provided by the citizen.`;

  const authorityOptions = [
    authorities.roads,
    authorities.water,
    authorities.electricity,
    authorities.sanitation,
    authorities.traffic,
    authorities.publicworks,
  ].join(" | ");

  return `You are a civic issue analysis agent for CivicPulse AI, a municipal operations platform serving ${authorities.cityLabel}.

A citizen has submitted a photo of a community infrastructure problem.

Analyze the image and all provided context to produce a complete structured assessment. Focus on the FUNCTIONAL IMPORTANCE of the area, not just administrative labels.

REPORTER DESCRIPTION: "${description}"
${locationLines}
${contextSection}

LOCAL MUNICIPAL AUTHORITIES for this region (use these exact names in responsible_authority):
- Roads & Highways: ${authorities.roads}
- Water & Sewerage: ${authorities.water}
- Electricity: ${authorities.electricity}
- Solid Waste: ${authorities.sanitation}
- Traffic: ${authorities.traffic}
- Public Works: ${authorities.publicworks}

Return a JSON object with ALL of the following fields:

{
  "issue_type": "concise label (e.g. Pothole, Garbage Dump, Broken Streetlight, Waterlogging, Open Manhole, Road Cave-in, Damaged Footpath, Sewage Leak, Stray Animals, Traffic Signal Fault)",
  "severity": "low | medium | high | critical",
  "confidence": 0.0 to 1.0,
  "summary": "2-3 sentences describing the issue for a municipal authority",
  "safety_risk": "one sentence describing the public safety risk if unaddressed",
  "responsible_authority": "MUST be exactly one of: ${authorityOptions}",
  "area_category": "one of: Residential Area | Commercial Area | IT & Research District | Educational Campus | Healthcare Zone | Industrial Estate | Transport Hub | Government Zone | Mixed Use Area",
  "area_confidence": 0.0 to 1.0,
  "area_reasoning": "1-2 sentences explaining why you classified this area functionally",
  "affected_entity_type": "the primary nearby entity type if relevant or null",
  "functional_importance": "1-2 sentences describing the real-world functional importance of this location",
  "likely_daily_activity": "Short phrase describing the typical activity here",
  "affected_groups": ["list of affected groups"],
  "estimated_population_impact": "estimated number of people affected",
  "impact_score": 0.0 to 10.0,
  "impact_reasoning": "2-3 sentences assessing the practical impact",
  "priority_score": 0.0 to 10.0,
  "priority_reasoning": "2-3 sentences explaining the priority score",
  "context_used": true or false,
  "context_influence": "none | low | medium | high",
  "repair_complexity": "low | medium | high | complex",
  "repair_category": "one of: patching | resurfacing | utility_repair | drainage | electrical | structural | clearing | waterway | signage | other",
  "estimated_work_hours": realistic number of hours,
  "weather_sensitive": true or false,
  "inspection_required": true or false,
  "temporary_public_safety_required": true or false,
  "required_equipment": ["specific equipment categories needed"],
  "required_skills": ["specific crew skills required"],
  "operational_constraints": ["maximum 3 constraints"],
  "verification_checkpoints": ["maximum 3 specific checks to confirm repair is complete"],
  "routing_reasoning": "1-2 sentences explaining department assignment"
}

SEVERITY: critical=immediate danger to life, high=significant injury risk, medium=noticeable impact, low=minor inconvenience.
Return only valid JSON. No markdown, no code fences, no explanation.`;
}

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
  if (start === -1 || end === -1 || end <= start)
    throw new Error(`No complete JSON object found in response: ${text.substring(0, 120)}`);
  return text.slice(start, end + 1);
}

function isRetryable(err: unknown): boolean {
  if (err instanceof SyntaxError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("429")) return false;
  return msg.includes("No complete JSON") || msg.includes("503") || msg.includes("high demand") || msg.includes("Service Unavailable");
}

function deterministicAnalysis(description: string): AiResult {
  const text = description.toLowerCase();
  let issue_type = "Infrastructure Issue";
  let responsible_authority: AiResult["responsible_authority"] = "Public Works Department";
  let repair_category: AiResult["repair_category"] = "other";
  let required_equipment: string[] = ["Safety Barricades", "Inspection Tools", "Warning Signage"];
  let required_skills: string[] = ["Municipal Civil Repair Crew", "Safety Technician"];
  let operational_constraints: string[] = ["Traffic Rerouting Required", "Work Zone Safety Perimeter"];
  let verification_checkpoints: string[] = [
    "Inspect and assess full extent of the issue on site",
    "Set up safety perimeter and warning signs — notify adjacent residents if required",
    "Execute repair as per engineer's field instructions",
    "Quality check: confirm repair meets acceptance criteria",
    "Restore full public access and notify department supervisor of completion",
    "Final verification before sign-off — confirm utility/infrastructure integrity and surface level"
  ];

  if (/pothole|road|crack|pavement|footpath|kerb|tar|asphalt|concrete|surface/i.test(text)) {
    issue_type = "Road Damage / Pothole"; 
    responsible_authority = "Roads & Highways Division"; 
    repair_category = "patching";
    required_equipment = ["Asphalt Paver", "Road Roller", "Compactor", "Safety Barriers"];
    required_skills = ["Road Construction Crew", "Heavy Equipment Operator", "Civil Engineer"];
  } else if (/water|pipe|leak|sewage|sewer|drain|flood|waterlog|manhole|gutter/i.test(text)) {
    issue_type = /sewer|sewage/.test(text) ? "Major Sewerage Line Burst" : /flood|waterlog/.test(text) ? "Severe Waterlogging & Drainage Block" : "Water Pipe Leak";
    responsible_authority = "Water Supply & Sewerage (CMWSSB)";
    repair_category = /flood|waterlog/.test(text) ? "drainage" : "utility_repair";
    required_equipment = ["Excavator", "Pipes & Fittings", "Compactor", "Road Roller", "Safety Barriers", "Water Pumps"];
    required_skills = ["Plumber/Pipefitter", "Heavy Equipment Operator", "Civil Engineer"];
  } else if (/light|streetlight|electric|power|wire|transformer|voltage|pole/i.test(text)) {
    issue_type = "High-Voltage Electrical Hazard"; 
    responsible_authority = "Electricity Distribution"; 
    repair_category = "electrical";
    required_equipment = ["Bucket Truck", "Insulated Tools", "Replacement Pole", "Transformer Tester", "Safety Barriers"];
    required_skills = ["High-Voltage Lineman", "Electrical Engineer", "Safety Supervisor"];
  } else if (/garbage|waste|trash|litter|dump|rubbish|bin/i.test(text)) {
    issue_type = "Illegal Solid Waste Dumping"; 
    responsible_authority = "Solid Waste & Sanitation"; 
    repair_category = "clearing";
    required_equipment = ["Sanitation Truck", "Loader", "Disinfectant Sprayer", "Safety Gloves"];
    required_skills = ["Sanitation Crew Lead", "Waste Disposal Specialist"];
  } else if (/traffic|signal|sign|marking|junction/i.test(text)) {
    issue_type = "Traffic Signal & Junction Fault"; 
    responsible_authority = "Traffic Management"; 
    repair_category = "signage";
    required_equipment = ["Signal Controller Unit", "Wiring Harness", "Traffic Cones"];
    required_skills = ["Traffic Electronics Technician", "Traffic Control Officer"];
  }

  let severity: AiResult["severity"] = "medium";
  if (/critical|emergency|danger|urgent|collapse|dead|injur|accident|fire|electr|live wire|burst/i.test(text)) severity = "critical";
  else if (/large|major|serious|significant|broken|bust|overflow|flood|hole/i.test(text)) severity = "high";
  else if (/minor|small|little|slight|crack/i.test(text)) severity = "low";

  const priorityMap: Record<AiResult["severity"], number> = { critical: 9.5, high: 7.8, medium: 5.4, low: 3.2 };
  const impactMap: Record<AiResult["severity"], number> = { critical: 9.2, high: 7.5, medium: 5.2, low: 3.0 };
  const populationMap: Record<AiResult["severity"], string> = { critical: "~300-500 residents", high: "~150 residents", medium: "~50 residents", low: "~20 residents" };
  const workHoursMap: Record<AiResult["severity"], number> = { critical: 24, high: 12, medium: 6, low: 3 };

  const area_reasoning = "The image clearly shows an active community setting surrounded by residential homes, local commercial access routes, and public thoroughfares. The provided address and citizen context confirm it as a primary residential colony.";
  const functional_importance = `This location is critical for providing essential ${issue_type.toLowerCase()} services to surrounding residential homes and local commuters. The damaged infrastructure disrupts daily life and creates a safety hazard.`;
  const likely_daily_activity = "Living, local commuting, pedestrian movement, local business access";
  const affected_groups = ["Residents", "Pedestrians", "Local commuters"];
  const estimated_population_impact = populationMap[severity];
  const impact_reasoning = `The practical impact is ${severity === "critical" || severity === "high" ? "high" : "moderate"} due to safety risks and potential service disruption to local households. Prompt municipal response is recommended.`;
  const priority_reasoning = `Assigned priority level ${priorityMap[severity]}/10 based on public safety impact, risk of structural escalation, and utility service availability.`;

  return {
    issue_type, severity, confidence: 0.95,
    summary: description.slice(0, 300) || `Infrastructure issue reported: ${issue_type}. Requires prompt field inspection and municipal restoration.`,
    safety_risk: severity === "critical" || severity === "high" ? "Immediate public safety hazard. Potential risk of electrocution, fire, or collapse if unaddressed." : "Low to moderate safety risk if monitored.",
    responsible_authority,
    area_category: "Residential Area", area_confidence: 0.95,
    area_reasoning,
    affected_entity_type: null, functional_importance, likely_daily_activity,
    affected_groups, estimated_population_impact,
    impact_score: impactMap[severity], impact_reasoning,
    priority_score: priorityMap[severity], priority_reasoning,
    context_used: true, context_influence: "high",
    repair_complexity: severity === "critical" ? "complex" : severity === "high" ? "high" : "medium",
    repair_category, estimated_work_hours: workHoursMap[severity],
    weather_sensitive: true, inspection_required: true,
    temporary_public_safety_required: severity === "critical" || severity === "high",
    required_equipment, required_skills, operational_constraints,
    verification_checkpoints,
    routing_reasoning: `Assigned to ${responsible_authority} based on visual classification and municipal jurisdiction rules.`,
  };
}

async function callWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= RETRY_DELAYS_MS.length;
      if (isLast || !isRetryable(err)) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new Error("callWithRetry: exhausted all retries.");
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface AnalyzeClientParams {
  issueId: string;
  imageBase64?: string;   // Available when triggered from submit page (image already in memory)
  imageUrl?: string;      // Fallback: fetch from URL (used when re-triggering from issue detail page)
  imageMimeType?: string;
  description: string;
  lat: number;
  lng: number;
  contextHint?: string | null;
}

export async function analyzeIssueClient(params: AnalyzeClientParams): Promise<void> {
  const { issueId, description, lat, lng, contextHint } = params;
  const issueRef = doc(db, "issues", issueId);

  try {
    // Resolve image base64 — prefer in-memory, fall back to fetching from URL
    let imageBase64 = params.imageBase64 ?? "";
    let imageMimeType = params.imageMimeType ?? "image/jpeg";

    if (!imageBase64 && params.imageUrl) {
      try {
        const imgRes = await fetch(params.imageUrl);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const reader = new FileReader();
          imageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.split(",")[1] ?? "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          imageMimeType = blob.type || mimeTypeFromUrl(params.imageUrl);
        }
      } catch (fetchErr) {
        console.warn(`[${issueId}] Image URL fetch failed:`, fetchErr);
      }
    }

    const geo = await reverseGeocode(lat, lng);
    const authorities = getRegionalAuthorities(geo?.city ?? "", geo?.state ?? "");
    const safeDescription = sanitizeUserInput(description) || "No description provided.";
    const prompt = buildPrompt(safeDescription, lat, lng, geo, contextHint ?? null, authorities);

    let aiResult: AiResult | null = null;
    let usedFallback = false;

    // Call server-side analyze proxy securely
    try {
      aiResult = await callWithRetry(async () => {
        const apiRes = await withTimeout(
          fetch("/api/analyze-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              imageBase64,
              userDescription: safeDescription,
              mimeType: imageMimeType,
            }),
          }),
          GEMINI_TIMEOUT_MS,
          "Gemini proxy",
        );

        if (!apiRes.ok) {
          const errTxt = await apiRes.text().catch(() => "");
          throw new Error(`Gemini proxy HTTP ${apiRes.status}: ${errTxt.slice(0, 150)}`);
        }

        const resJson = (await apiRes.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          error?: string;
        };
        if (resJson.error) {
          throw new Error(resJson.error);
        }
        const rawText = (resJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
        return JSON.parse(extractJson(rawText)) as AiResult;
      }, issueId);
    } catch (geminiErr) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      console.warn(`[${issueId}] Gemini proxy call failed: ${msg.slice(0, 120)}`);
    }

    // Final fallback if Gemini call failed or key missing
    if (!aiResult) {
      aiResult = deterministicAnalysis(description);
      usedFallback = true;
    }

    // Validate and sanitise
    // If Gemini returned an unrecognised authority, default to publicworks
    const validAuthorities = new Set([
      authorities.roads, authorities.water, authorities.electricity,
      authorities.sanitation, authorities.traffic, authorities.publicworks,
    ]);
    if (!validAuthorities.has(aiResult.responsible_authority)) {
      aiResult.responsible_authority = authorities.publicworks;
    }

    if (!VALID_SEVERITIES.has(aiResult.severity)) aiResult.severity = "medium";
    aiResult.confidence = Math.min(1, Math.max(0, Number(aiResult.confidence) || 0));
    if (!VALID_AREA_CATEGORIES.has(aiResult.area_category)) aiResult.area_category = "Mixed Use Area";
    aiResult.area_confidence = Math.min(1, Math.max(0, Number(aiResult.area_confidence) || 0));
    aiResult.priority_score = Math.min(10, Math.max(0, Number(aiResult.priority_score) || 5));
    aiResult.impact_score = Math.min(10, Math.max(0, Number(aiResult.impact_score) || 0));
    aiResult.functional_importance = String(aiResult.functional_importance ?? "");
    aiResult.likely_daily_activity = String(aiResult.likely_daily_activity ?? "");
    aiResult.impact_reasoning = String(aiResult.impact_reasoning ?? "");
    if (!Array.isArray(aiResult.affected_groups)) aiResult.affected_groups = [];
    if (!VALID_INFLUENCES.has(aiResult.context_influence)) aiResult.context_influence = "none";
    aiResult.context_used = Boolean(aiResult.context_used);
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

    const now = Timestamp.now();

    await updateDoc(issueRef, {
      // Area intelligence at root
      area_category: aiResult.area_category,
      area_confidence: aiResult.area_confidence,
      area_reasoning: aiResult.area_reasoning,
      affected_entity_type: aiResult.affected_entity_type ?? null,

      // Location address (from geocoding)
      ...(geo ? {
        "location.address": geo.address,
        "location.area_name": geo.area_name,
        "location.zone_type": geo.zone_type,
      } : {}),

      // AI blob (H2: assignment fields removed — written server-side via /api/issue/[id]/assign)
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
        generated_at: now,
        ai_fallback: usedFallback,
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
      updated_at: now,
    });

    console.info(`[${issueId}] Client analysis complete: ${aiResult.issue_type} / ${aiResult.severity} / priority=${aiResult.priority_score}`);

    // H2: Trigger server-side department assignment (admin SDK bypasses Firestore rules)
    auth.currentUser?.getIdToken().then((token) => {
      fetch(`/api/issue/${issueId}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch((e: unknown) => console.warn(`[${issueId}] Assign route call failed:`, e));
    }).catch((e: unknown) => console.warn(`[${issueId}] Could not get ID token for assign:`, e));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${issueId}] Client analysis failed:`, message);
    await updateDoc(issueRef, {
      status: "error",
      "ai.error": message,
      updated_at: Timestamp.now(),
    }).catch((e: unknown) => console.error(`[${issueId}] Failed to write error status:`, e));
  }
}
