import { GoogleGenAI } from "@google/genai";
import { getPrimaryGeminiModel } from "@/lib/ai/geminiModelResolver";
import type { IssueIntelligenceReport } from "./types";

export interface ActionPlanInput {
  iir: IssueIntelligenceReport;
  departmentName: string;
  address: string | null;
}

export interface ActionPlan {
  crew_required: string;
  estimated_workers: number;
  equipment: string[];
  estimated_duration: string;
  traffic_management: string;
  safety_protocols: string[];
  repair_steps: string[];
  materials: string[];
  expected_completion: string;
  reasoning: string;
}

// ── Deterministic lookup tables ─────────────────────────────────────────────

const CREW_BY_CATEGORY: Record<string, string> = {
  patching:     "Road Maintenance Crew (bituminous patching specialists)",
  resurfacing:  "Road Resurfacing Crew (hot-mix asphalt and compaction specialists)",
  excavation:   "Civil Works Crew (excavation, shoring, and reinstatement team)",
  waterworks:   "Water Supply Crew (pipe repair and pressure-testing specialists)",
  drainage:     "Drainage Works Crew (desilting and stormwater-channel specialists)",
  electrical:   "Electrical Maintenance Crew (HT/LT certified linemen)",
  structural:   "Structural Repair Crew (RCC masonry and concrete specialists)",
  tree_removal: "Horticulture Crew (licensed arborists and debris-clearance team)",
  cleaning:     "Sanitation Field Crew (mechanical sweeping and manual cleaning)",
  signal:       "Traffic Signal Maintenance Crew (ITS-certified technicians)",
  marking:      "Road Marking Crew (thermoplastic paint and retroreflectivity specialists)",
  other:        "Municipal Works Field Crew",
};

const WORKERS_BY_COMPLEXITY: Record<string, number> = {
  low: 3,
  medium: 5,
  high: 8,
  complex: 12,
};

const DEFAULT_EQUIPMENT_BY_CATEGORY: Record<string, string[]> = {
  patching:     ["Plate compactor", "Asphalt saw / crack router", "Bitumen tack coat sprayer", "Pothole patching trailer", "Traffic cones and barriers", "PPE kit"],
  resurfacing:  ["Milling machine", "Asphalt paver (finisher)", "Vibratory roller (8–10 tonne)", "Tack coat sprayer", "Dump trucks for HMA", "Traffic management equipment"],
  excavation:   ["JCB / backhoe loader", "Hydraulic rock breaker", "Dewatering pump", "Plate compactor", "Trench shoring equipment", "Traffic barriers and signage"],
  waterworks:   ["Pipe-cutting and welding tools", "Hydraulic pipe clamps", "Pressure testing kit", "Dewatering pump", "Excavation equipment", "Valve isolation tools"],
  drainage:     ["Suction jetting vehicle (gully emptier)", "Manual desilting tools", "CCTV drain camera", "Safety harness (confined space)", "Dewatering pump"],
  electrical:   ["Insulated tools set (1000V rated)", "Cable drum and winch", "Earthing equipment", "Cable jointing kit", "Aerial work platform / bucket truck"],
  structural:   ["Concrete mixer", "Shuttering / formwork", "Bar-bending machine", "Poker vibrator", "Scaffolding", "Core drilling rig"],
  tree_removal: ["Chainsaw (DGFS-certified operator)", "Wood chipper", "Rope and rigging kit", "Crane / aerial work platform", "Debris-removal truck"],
  cleaning:     ["Mechanical road sweeper", "High-pressure water jetting unit", "Compactor garbage truck", "Manual tools and PPE"],
  signal:       ["Signal controller test kit", "Loop detector equipment", "Cable splicer", "Portable traffic signals", "Hi-reach access equipment"],
  marking:      ["Thermoplastic road-marking machine", "Preheater", "Glass bead applicator", "Road stencil set", "Traffic cones"],
  other:        ["Standard municipal tools", "Safety barriers and cones", "PPE kit"],
};

const MATERIALS_BY_CATEGORY: Record<string, string[]> = {
  patching:     ["Dense bituminous macadam (DBM) or cold-mix patch compound", "Bitumen tack coat (RS-1 grade)", "Coarse aggregate (20mm and 10mm)", "Premix bituminous material"],
  resurfacing:  ["Hot-mix asphalt — DBM layer + bituminous concrete (BC) wearing course", "VG-30 / PG 64 binder", "Aggregate (10mm and 20mm IRC graded)", "Bitumen primer coat"],
  excavation:   ["Granular sub-base (GSB) for reinstatement", "Concrete M25 for haunching and surround", "Backfill sand / murrum", "Pipe materials as per specification"],
  waterworks:   ["DI / HDPE pipes (OD as per design)", "Rubber-ring / flanged couplings", "Valve and fittings", "Cement mortar for masonry collar"],
  drainage:     ["RCC hume pipes or UPVC drain pipes", "Bedding sand and aggregate", "Cement concrete M20 for channel lining", "Manhole cover and frame (if replacement)"],
  electrical:   ["XLPE armoured cable (size as per load)", "Heat-shrink termination kits", "LT distribution box / fuse unit", "Insulators, clamps, and binding wire"],
  structural:   ["Cement concrete M25 / M30", "TMT steel bars Fe-500", "Brickwork / hollow blocks", "Plaster sand and bonding compound"],
  tree_removal: ["Nil — all debris to be transported to designated horticulture yard"],
  cleaning:     ["Disinfectant / deodorant concentrate", "Heavy-duty garbage bags and bins"],
  signal:       ["Signal lamp modules (LED)", "Signal controller card / PLC board (as applicable)", "Co-axial / armoured cable", "Signal head and housing (if replacement)"],
  marking:      ["Thermoplastic road-marking paint (IRC white/yellow grade)", "Glass beads (BS EN 1423 class)", "Primer for road surface"],
  other:        ["Materials as per engineer's specification"],
};

const REPAIR_STEPS_BY_CATEGORY: Record<string, string[]> = {
  patching: [
    "Mark repair boundary with chalk / spray paint — square or rectangular profile",
    "Deploy traffic cones and 'Road Works Ahead' warning signs",
    "Saw-cut or mill the damaged area to clean, vertical edges",
    "Remove all loose debris and clean the base — blow out with compressed air if available",
    "Apply bitumen tack coat (RS-1) uniformly — allow to cure until tacky",
    "Fill with DBM or cold-mix in 50mm layers — compact each layer with plate compactor",
    "Final compaction to surface level flush with surrounding carriageway",
    "Check surface profile — correct any level difference before opening to traffic",
    "Remove warning signs and traffic cones — restore normal traffic flow",
  ],
  resurfacing: [
    "Obtain traffic management clearance — notify Traffic Police and adjacent residents",
    "Deploy full-width traffic diversions and 'Road Closed' signage",
    "Milling operation: scarify existing surface to design depth (40–60mm typical)",
    "Remove milled material from site using dump trucks",
    "Clean and sweep base — repair any base failures before overlay",
    "Apply bitumen tack coat uniformly — allow to cure",
    "Lay DBM layer using asphalt paver — compact with vibratory roller to design density",
    "Lay bituminous concrete (BC) wearing course — compact to IRC specification",
    "Apply thermoplastic road markings — centre line, lane lines, edge lines",
    "Remove traffic diversions — stage reopening to allow curing time",
  ],
  excavation: [
    "Obtain road-cutting permit from civic body — mark all underground utilities (gas, water, telecom, power)",
    "Deploy traffic diversions and protective barricading for full excavation length",
    "Excavate using backhoe loader to required depth — shore sides if >1.2m or in unstable ground",
    "Execute pipe / duct / structure work as per approved design",
    "Conduct performance test (pressure test / continuity test) before backfill",
    "Backfill in 150mm compacted layers — test compaction at each level",
    "Reinstate sub-base layers (GSB + WMM) to original specification",
    "Reinstate road surface to match existing pavement using hot-mix",
    "Demobilise barricades — inspect reinstated surface before opening to traffic",
  ],
  waterworks: [
    "Locate and isolate affected pipe section using gate valves — inform consumers via PA/WhatsApp group",
    "Excavate to expose damaged pipe with appropriate trench shoring",
    "Cut out defective pipe section or fitting using hydraulic pipe cutter",
    "Prepare pipe ends — remove burrs, clean socket",
    "Install replacement pipe / fitting with correct joint type (rubber ring or flanged)",
    "Conduct hydrostatic pressure test at 1.5× working pressure for 30 minutes",
    "Backfill and compact around pipe in layers — maintain minimum cover",
    "Reinstate road surface and markings",
    "Restore water supply through isolating valve — check pressure at consumer ends",
  ],
  drainage: [
    "Inspect drain / culvert to determine blockage extent — use CCTV or manual rodding",
    "Position suction jetting vehicle downwind and set up exclusion zone",
    "Clear blockage using high-pressure jetting from downstream end working upstream",
    "Suction out accumulated silt and debris — transport to approved disposal site",
    "Inspect drain invert and walls for cracks or damage after clearing",
    "Repair any structural defects found — patch cracks with cement mortar or replace pipe section",
    "Confirm outfall is clear and water flows freely to receiving drain / channel",
    "Restore manhole covers, gratings, and surrounding pavement",
  ],
  electrical: [
    "Isolate affected circuit at substation — obtain written permit to work from shift engineer",
    "Verify isolation using approved voltage-testing equipment on all conductors",
    "Locate fault using cable fault locator / TDR or visual inspection of overhead lines",
    "Excavate to expose underground fault (if underground cable) — shore trench if required",
    "Execute cable jointing / replacement per TANGEDCO / utility specification",
    "Test insulation resistance (IR test) and continuity before energising",
    "Re-energise circuit — monitor load at distribution board for stable reading",
    "Reinstate excavation and road surface if underground work",
    "Document fault, repair, and test readings in maintenance register",
  ],
  structural: [
    "Structural assessment by engineer — determine if load-bearing elements are affected",
    "Prop or shore adjacent structure if required to prevent collapse during repair",
    "Break out damaged concrete using jackhammer / concrete saw to sound material",
    "Clean exposed reinforcement bars — treat corrosion with rust-inhibiting primer",
    "Fix shuttering and formwork as per repair design drawings",
    "Pour concrete M25 / M30 — vibrate thoroughly to eliminate air pockets",
    "Wet-cure concrete for minimum 7 days (apply curing compound or hessian / polythene cover)",
    "Strike shuttering after curing period — inspect surface for defects",
    "Apply waterproofing coat if repair is exposed to weather / water",
  ],
  tree_removal: [
    "Assess tree for stability, lean angle, and root condition — determine safe felling direction",
    "Establish exclusion zone to radius of 1.5× tree height — cordon with barriers and rope",
    "Deploy traffic cones and lane closure if tree overhangs carriageway",
    "Trim crown sections using chainsaw — lower using ropes and rigging to controlled fall",
    "Fell remaining trunk in manageable sections from top downwards",
    "Feed branches and small wood through wood chipper on site",
    "Remove logs and stumps — grind stump if stump poses hazard to pedestrians / vehicles",
    "Clear all debris from carriageway and footpath — restore surface",
    "Remove traffic controls and restore normal access",
  ],
  cleaning: [
    "Deploy mechanical road sweeper along affected stretch — two passes if heavily soiled",
    "Manual cleaning of gutters, drains, and areas inaccessible to sweeper",
    "Collect and bag all solid waste — separate recyclables where possible",
    "High-pressure water jetting for stubborn detritus, oil spills, or biological waste",
    "Apply disinfectant / deodorant spray to drain openings and affected pavement",
    "Load all waste into compactor garbage truck for transport to processing facility",
    "Final inspection — confirm area meets cleanliness standard before signing off",
  ],
  signal: [
    "Place portable traffic signals at junction — set conservative manual phase timing",
    "Isolate faulty signal at controller cabinet — tag out circuit breaker",
    "Diagnose fault: check controller, signal heads, cable continuity, loop detectors",
    "Replace defective component — lamp module, controller card, junction box, or cable as needed",
    "Test all signal phases sequentially including pedestrian pushbutton and countdown",
    "Synchronise timing plan with adjoining intersections using SCATS / UTC if applicable",
    "Remove portable signals — restore automatic fixed-time or adaptive operation",
    "Log fault and repair details in Traffic Management Centre record",
  ],
  marking: [
    "Survey existing marking condition and confirm alignment with IRC markings plan",
    "Clean road surface — sweeper pass and targeted pressure washing",
    "Apply thermoplastic primer to prepared surface — allow 5 minutes flash-off",
    "Apply thermoplastic paint using road-marking machine at specification thickness",
    "Immediately apply glass beads by broadcast applicator for retroreflectivity",
    "Allow 15–20 minutes curing before opening to traffic",
    "Inspect retroreflectivity with retroreflectometer — confirm IRC 35 / IS 5813 compliance",
  ],
  other: [
    "Inspect and assess full extent of the issue on site",
    "Set up safety perimeter and warning signs — notify adjacent residents if required",
    "Execute repair as per engineer's field instructions",
    "Quality check: confirm repair meets acceptance criteria",
    "Clear site — remove all debris, barriers, and equipment",
    "Restore full public access and notify department supervisor of completion",
  ],
};

const SAFETY_BY_SEVERITY: Record<string, string[]> = {
  critical: [
    "IMMEDIATE site isolation — minimum 10m exclusion zone before any work",
    "PPE mandatory: hard hat, hi-vis vest Class 3, safety boots, gloves, and face shield where applicable",
    "Full traffic management plan in place BEFORE crew enters work zone",
    "Supervisor on site at all times — no unsupervised work permitted",
    "First aid kit and fire extinguisher at site — 108 ambulance pre-alerted",
    "Adjacent utilities isolated (water, gas, electricity) before excavation",
  ],
  high: [
    "PPE mandatory: hard hat, hi-vis vest, safety boots, and gloves",
    "Traffic management in place before work commences",
    "Supervisor to conduct toolbox talk and sign site safety checklist before commencement",
    "First aid kit available at site",
    "Adjacent utility owners notified — dial 'Before You Dig' clearance obtained",
  ],
  medium: [
    "PPE mandatory: hi-vis vest and safety boots minimum",
    "Traffic cones, warning lamps, and 'Road Works Ahead' signs deployed",
    "Toolbox talk — crew aware of specific hazards for this work type",
    "Adjacent residents and businesses notified if access may be affected",
  ],
  low: [
    "PPE mandatory: hi-vis vest and safety boots",
    "Warning signs deployed at work perimeter",
    "Work to be completed during daylight hours",
  ],
};

// ── Helper functions ─────────────────────────────────────────────────────────

function inferCategory(iir: IssueIntelligenceReport): string {
  if (iir.repair_category) return iir.repair_category;
  const t = (iir.issue_type ?? "").toLowerCase();
  if (t.includes("pothole") || t.includes("patch")) return "patching";
  if (t.includes("resurface") || t.includes("road surface")) return "resurfacing";
  if (t.includes("cave") || t.includes("sinkhole") || t.includes("trench")) return "excavation";
  if (t.includes("water") && (t.includes("pipe") || t.includes("main") || t.includes("leak") || t.includes("break"))) return "waterworks";
  if (t.includes("drain") || t.includes("sewage") || t.includes("sewer") || t.includes("flood")) return "drainage";
  if (t.includes("electr") || t.includes("power") || t.includes("light") || t.includes("cable")) return "electrical";
  if (t.includes("tree") || t.includes("branch") || t.includes("fallen")) return "tree_removal";
  if (t.includes("garbage") || t.includes("waste") || t.includes("dump") || t.includes("litter")) return "cleaning";
  if (t.includes("signal") || t.includes("traffic light")) return "signal";
  if (t.includes("marking") || t.includes("line paint")) return "marking";
  if (t.includes("wall") || t.includes("structure") || t.includes("RCC") || t.includes("concrete")) return "structural";
  return "other";
}

function deterministicActionPlan(input: ActionPlanInput): ActionPlan {
  const iir = input.iir;
  const category = inferCategory(iir);
  const complexity = iir.repair_complexity ?? "medium";
  const hours = iir.estimated_work_hours ?? 4;
  const skills = iir.required_skills ?? [];

  const crewBase = CREW_BY_CATEGORY[category] ?? CREW_BY_CATEGORY.other;
  const crew = skills.length
    ? `${crewBase} — skilled in ${skills.join(", ")}`
    : crewBase;

  const workers = WORKERS_BY_COMPLEXITY[complexity] ?? 5;

  const equipment = (iir.required_equipment?.length)
    ? iir.required_equipment
    : DEFAULT_EQUIPMENT_BY_CATEGORY[category] ?? DEFAULT_EQUIPMENT_BY_CATEGORY.other;

  const materials = MATERIALS_BY_CATEGORY[category] ?? MATERIALS_BY_CATEGORY.other;

  const baseSteps = REPAIR_STEPS_BY_CATEGORY[category] ?? REPAIR_STEPS_BY_CATEGORY.other;
  const steps = [...baseSteps];
  if (iir.verification_checkpoints?.length) {
    steps.push(
      `Final verification before sign-off — confirm: ${iir.verification_checkpoints.join("; ")}`,
    );
  }

  let traffic: string;
  if (!iir.temporary_public_safety_required) {
    traffic = "Advisory cones at work perimeter — no full lane closure required";
  } else if (category === "resurfacing") {
    traffic = "Full carriageway closure — implement traffic diversion, deploy VMS boards, coordinate with Chennai Traffic Police";
  } else if (category === "excavation" || category === "waterworks") {
    traffic = "Lane closure with contra-flow — deploy stop/go boards, coordinate with Traffic Police for arterial roads";
  } else {
    traffic = "Lane closure with traffic cones, barriers, and flagmen at each end of work zone — coordinate with Traffic Police";
  }

  const severityKey = (["critical","high","medium","low"].includes(iir.severity ?? "")) ? iir.severity as string : "medium";
  const baseProtocols = SAFETY_BY_SEVERITY[severityKey] ?? SAFETY_BY_SEVERITY.medium;
  const extraProtocols: string[] = [];
  if (iir.weather_sensitive) extraProtocols.push("Monitor weather — suspend bituminous / electrical work during rain or high winds");
  if (iir.inspection_required) extraProtocols.push("Engineer or supervisor must inspect and clear site before crew commences repair");
  if (iir.operational_constraints?.length) {
    iir.operational_constraints.forEach(c => extraProtocols.push(`Operational constraint: ${c}`));
  }
  const safety = [...baseProtocols, ...extraProtocols];

  let duration: string;
  if (hours <= 2)       duration = `${hours} hours`;
  else if (hours <= 8)  duration = `${hours} hours (single shift)`;
  else if (hours <= 16) duration = `${hours} hours across 2 shifts`;
  else                  duration = `${Math.ceil(hours / 8)} working days (~${hours} man-hours total)`;

  const nightOnly = iir.operational_constraints?.some(c =>
    c.toLowerCase().includes("night") || c.toLowerCase().includes("off-peak") || c.toLowerCase().includes("non-peak"),
  );
  let completion: string;
  if (nightOnly) completion = `${Math.ceil(hours / 6)} night shift(s) required (off-peak hours only)`;
  else if (hours <= 4) completion = "Same day";
  else if (hours <= 8) completion = "Within 1 working day";
  else completion = `${Math.ceil(hours / 8)} working day(s)${iir.weather_sensitive ? " — subject to weather clearance" : ""}`;

  return {
    crew_required: crew,
    estimated_workers: workers,
    equipment,
    estimated_duration: duration,
    traffic_management: traffic,
    safety_protocols: safety,
    repair_steps: steps,
    materials,
    expected_completion: completion,
    reasoning: `Deterministic plan from IIR: ${iir.issue_type ?? "unknown issue"} — ${complexity} complexity ${category} repair at ${input.address ?? "site"}. Crew, equipment, and steps derived from repair intelligence fields.`,
  };
}

// ── Gemini prompt builder ────────────────────────────────────────────────────

function formatIIR(iir: IssueIntelligenceReport, address: string | null): string {
  const repair = iir.repair_complexity
    ? `
REPAIR INTELLIGENCE (Analysis Agent):
- Complexity: ${iir.repair_complexity} | Category: ${iir.repair_category ?? "other"}
- Estimated work hours: ${iir.estimated_work_hours ?? "unknown"}
- Weather sensitive: ${iir.weather_sensitive ? "YES — consider weather window" : "No"}
- Pre-repair inspection required: ${iir.inspection_required ? "YES — engineer/supervisor must clear site first" : "No"}
- Traffic/public safety management required: ${iir.temporary_public_safety_required ? "YES — road closure or barriers needed" : "No"}
- Required equipment: ${iir.required_equipment?.join(", ") || "TBD on-site"}
- Required skills: ${iir.required_skills?.join(", ") || "Standard crew"}
- Operational constraints: ${iir.operational_constraints?.join(" | ") || "None specified"}
- Verification checkpoints: ${iir.verification_checkpoints?.join(" | ") || "None specified"}`
    : "";

  return `ISSUE CLASSIFICATION:
- Type: ${iir.issue_type} | Severity: ${iir.severity} | Priority: ${iir.priority_score ?? "?"}/10
- Location: ${address ?? "Unknown"} | Area: ${iir.area_category ?? "Unknown"}
- Summary: ${iir.summary}
- Safety Risk: ${iir.safety_risk}

IMPACT:
- Affected Groups: ${iir.affected_groups?.join(", ") || "General public"}
- Population Impact: ${iir.estimated_population_impact || "Unknown"}
- Functional Importance: ${iir.functional_importance || ""}
- Daily Activity: ${iir.likely_daily_activity || ""}
- Impact Reasoning: ${iir.impact_reasoning || ""}
- Priority Reasoning: ${iir.priority_reasoning || ""}
${iir.citizen_concern_level ? `\nCOMMUNITY:\n- Concern Level: ${iir.citizen_concern_level}\n- ${iir.community_summary ?? ""}` : ""}
${repair}`;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateActionPlan(input: ActionPlanInput, _keyOverride?: string): Promise<ActionPlan> {
  const apiKey = _keyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[ActionPlan] No API key — using deterministic planner");
    return deterministicActionPlan(input);
  }

  const iirText = formatIIR(input.iir, input.address);
  console.log(`[ActionPlan:generate] IIR summary: "${input.iir.summary?.substring(0, 80)}"`);
  console.log(`[ActionPlan:generate] Model: ${getPrimaryGeminiModel()}`);

  const prompt = `You are the Operational Planning Agent for ${input.departmentName}.

IMPORTANT: You are NOT analyzing the issue. The Analysis Agent has already completed the Issue Intelligence Report below. Treat every field in this report as authoritative. Do not re-classify the issue. Do not re-assess severity or impact. Do not reinterpret the uploaded image. Your sole responsibility is to generate an operational execution plan.

────────────────────────────────────────────────
ISSUE INTELLIGENCE REPORT
────────────────────────────────────────────────
${iirText}
────────────────────────────────────────────────

Based on the Issue Intelligence Report above, generate a detailed execution plan for ${input.departmentName}.

Use the repair intelligence fields (complexity, required equipment, skills, constraints) as direct operational inputs — they were determined by the Analysis Agent and must be treated as facts, not suggestions.

If verification checkpoints are listed, they must be reflected in the repair steps so the crew knows what to confirm upon completion.

Generate a realistic plan for Chennai municipal conditions.

Return ONLY valid JSON — no markdown, no extra text:
{
  "crew_required": "specific crew description referencing the required skills from the IIR",
  "estimated_workers": number,
  "equipment": ["items from required_equipment in the IIR plus any additional needed"],
  "estimated_duration": "duration consistent with estimated_work_hours from the IIR",
  "traffic_management": "specific traffic plan — YES if temporary_public_safety_required is true",
  "safety_protocols": ["specific protocols for this issue type and area"],
  "repair_steps": ["ordered steps — the final step must check the verification checkpoints"],
  "materials": ["materials needed for repair_category from the IIR"],
  "expected_completion": "realistic timeframe given constraints",
  "reasoning": "brief explanation of how the plan was derived from the IIR"
}`;

  try {
    console.log(`[ActionPlan:generate] Calling Gemini API...`);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getPrimaryGeminiModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1400,
        responseMimeType: "application/json",
      },
    });

    const text = (response.text ?? "").trim();
    console.log(`[ActionPlan:generate] Raw Gemini response (first 300 chars): ${text.substring(0, 300)}`);
    console.log(`[ActionPlan:generate] Response length: ${text.length} chars`);

    if (!text) {
      console.warn("[ActionPlan:generate] Empty response — using deterministic planner");
      return deterministicActionPlan(input);
    }

    let parsed: ActionPlan;
    try {
      parsed = JSON.parse(text) as ActionPlan;
    } catch (parseErr) {
      console.error("[ActionPlan:generate] JSON.parse FAILED. Full response text:", text);
      console.error("[ActionPlan:generate] Parse error:", parseErr);
      return deterministicActionPlan(input);
    }

    if (!parsed.repair_steps || !Array.isArray(parsed.repair_steps)) {
      console.warn("[ActionPlan:generate] Parsed object missing repair_steps — using deterministic planner");
      return deterministicActionPlan(input);
    }

    console.log(`[ActionPlan:generate] Gemini success — ${parsed.repair_steps.length} steps, crew: "${parsed.crew_required}"`);
    return parsed;
  } catch (err) {
    console.error("[ActionPlan:generate] Gemini call FAILED — using deterministic planner. Full error:", err);
    return deterministicActionPlan(input);
  }
}
