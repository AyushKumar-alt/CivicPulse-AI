export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { prompt, userDescription, imageBase64, mimeType } = (await request.json()) as {
      prompt?: string;
      userDescription?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      console.error("[GEMINI PROXY ERROR] Missing Gemini API key in process.env");
      return Response.json(
        { error: "GEMINI_API_KEY is not configured on server", status: "FAILED" },
        { status: 500 }
      );
    }

    const defaultPrompt = `You are a senior municipal infrastructure inspection AI for CivicPulse AI. Analyze this civic issue photo carefully. User description: "${userDescription || ""}".

Return ONLY valid JSON matching this exact structure with rich, highly descriptive field values:

{
  "categoryKey": "electricity | water | sanitation | roads | traffic | publicworks",
  "subcategoryKey": "concise subcategory",
  "issueTypeKey": "concise issue key",
  "issueTypeDisplayName": "Descriptive Title (e.g. Major Water Main Pipe Burst / Severe Flooding)",
  "visualSeverity": "low | medium | high | critical",
  "confidence": 0.95,
  "summary": "2-3 comprehensive, detailed sentences describing the exact physical damage, exposed infrastructure, standing water, and surrounding activity visible in the photo.",
  "safetyRiskDescription": "1-2 detailed sentences explaining public safety hazards to pedestrians, commuters, or nearby residents if left unaddressed.",
  "area_category": "Residential Area | Commercial Area | IT & Research District | Educational Campus | Healthcare Zone | Industrial Estate | Transport Hub | Government Zone | Mixed Use Area",
  "area_confidence": 0.95,
  "area_reasoning": "Detailed 2-sentence explanation of visible background indicators (buildings, vehicles, land use) determining this area classification.",
  "functional_importance": "1-2 sentences describing the real-world importance of this road or access route for daily community access and emergency services.",
  "likely_daily_activity": "Commuting, local errands, pedestrian movement, local business access",
  "affected_groups": ["Residents", "Commuters", "Pedestrians", "Local Businesses"],
  "estimated_population_impact": "500-1000",
  "impact_score": 8.5,
  "impact_reasoning": "Detailed 2-3 sentence assessment of traffic disruption, utility service interruption, and inconvenience to surrounding households.",
  "priority_score": 8.5,
  "priority_reasoning": "Detailed priority score justification based on safety risk, location criticality, and service disruption.",
  "context_used": true,
  "context_influence": "high",
  "repair_complexity": "medium",
  "repair_category": "patching | resurfacing | utility_repair | drainage | electrical | structural | clearing | waterway | signage | other",
  "estimated_work_hours": 12,
  "weather_sensitive": true,
  "inspection_required": true,
  "temporary_public_safety_required": true,
  "required_equipment": ["Excavator", "Dewatering Pumps", "Pipe Sealant", "Safety Barriers"],
  "required_skills": ["Plumbing", "Heavy Machinery Operation", "Civil Engineering Repair"],
  "operational_constraints": ["Traffic Rerouting Required", "Utility Feed Shutdown Needed"],
  "verification_checkpoints": ["Pressure Leak Test Passed", "Asphalt Surface Restoration Confirmed"],
  "visualObservations": [
    "Detailed observation of physical damage or excavation",
    "Detailed observation of safety hazard or exposed utilities"
  ]
}`;

    const parts: Record<string, unknown>[] = [];
    const cleanBase64 = imageBase64?.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    if (cleanBase64 && cleanBase64.length > 100) {
      parts.push({
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: cleanBase64,
        },
      });
    }
    parts.push({ text: prompt || defaultPrompt });

    const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const modelsToTry = Array.from(new Set([configuredModel, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]));
    let lastError = "";

    for (const m of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 4096,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          const data = await response.json();
          return Response.json(data);
        } else {
          lastError = await response.text().catch(() => "");
          console.warn(`[GEMINI PROXY WARNING] ${m} HTTP ${response.status}: ${lastError.slice(0, 150)}`);
          if (response.status === 404 || response.status === 503 || response.status === 429) {
            continue;
          }
          break;
        }
      } catch (e) {
        lastError = String(e);
      }
    }

    return Response.json(
      { error: `Gemini API HTTP Error: ${lastError.slice(0, 300)}`, status: "FAILED" },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
