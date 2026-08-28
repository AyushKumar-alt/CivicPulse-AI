import { GoogleGenAI } from "@google/genai";
import type { IssueIntelligenceReport } from "./types";

export interface BriefingIssueGovernance {
  report?: {
    decision?: string;
    department_performance?: string;
    completion_quality?: string;
    accountability_required?: boolean;
    rework_required?: boolean;
  } | null;
  history?: unknown[];
}

export interface BriefingIssue {
  id: string;
  iir: IssueIntelligenceReport | null;
  address: string | null;
  assigned_department_name: string | null;
  status: string;
  department_status: string | null;
  escalated: boolean;
  citizen_concern_level: string | null;
  submitted_at: number | null;
  governance: BriefingIssueGovernance | null;
}

export interface BriefingInput {
  issues: BriefingIssue[];
  totalOpen: number;
  criticalCount: number;
  escalatedCount: number;
}

// ── Deterministic fallback ───────────────────────────────────────────────────

function deterministicBriefing(input: BriefingInput): string {
  const { issues, totalOpen, criticalCount, escalatedCount } = input;

  if (totalOpen === 0) {
    return [
      "SITUATION SUMMARY",
      "No active issues in the system. City operations are running normally.",
      "",
      "PRIORITY DEPARTMENTS",
      "All departments report no pending issues at this time.",
      "",
      "OPERATIONAL CONCERNS",
      "None identified.",
      "",
      "RECOMMENDED EXECUTIVE ACTIONS",
      "Maintain routine monitoring and preventive maintenance inspections.",
    ].join("\n");
  }

  // ── Group by department ──
  const byDept = new Map<string, BriefingIssue[]>();
  for (const issue of issues) {
    const dept = issue.assigned_department_name ?? "Unassigned";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(issue);
  }

  // ── Rank departments by weighted load ──
  type DeptEntry = { dept: string; issues: BriefingIssue[]; score: number };
  const deptRanked: DeptEntry[] = [...byDept.entries()]
    .map(([dept, dIssues]) => {
      const score = dIssues.reduce((s, i) => {
        const ai = i.iir;
        return s
          + (ai?.severity === "critical" ? 10 : 0)
          + (i.escalated ? 5 : 0)
          + ((ai?.priority_score ?? 0))
          + (i.department_status === "needs_rework" ? 3 : 0)
          + (["assigned", "accepted"].includes(i.department_status ?? "") ? 1 : 0);
      }, 0);
      return { dept, issues: dIssues, score };
    })
    .sort((a, b) => b.score - a.score);

  // ── Issue type frequency (pattern detection) ──
  const typeCounts = new Map<string, number>();
  for (const issue of issues) {
    const t = issue.iir?.issue_type;
    if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const patterns = [...typeCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]);

  // ── Area hotspots ──
  const areaCounts = new Map<string, number>();
  for (const issue of issues) {
    const area = issue.iir?.area_category;
    if (area) areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  }
  const hotspots = [...areaCounts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);

  // ── Critical issues list ──
  const criticals = issues.filter(i => i.iir?.severity === "critical");
  const weatherSensitive = issues.filter(i => i.iir?.weather_sensitive);
  const reworkIssues = issues.filter(i => i.department_status === "needs_rework");
  const complexIssues = issues.filter(i =>
    i.iir?.repair_complexity === "complex" || i.iir?.repair_complexity === "high",
  );

  // ── Governance intelligence ──
  const accountabilityFlagged = issues.filter(
    i => i.governance?.report?.accountability_required,
  );
  // Departments with repeated accountability flags
  const deptAccountability = new Map<string, number>();
  for (const issue of accountabilityFlagged) {
    const dept = issue.assigned_department_name ?? "Unassigned";
    deptAccountability.set(dept, (deptAccountability.get(dept) ?? 0) + 1);
  }
  const unsatisfactoryDepts = issues.filter(
    i => i.governance?.report?.department_performance === "unsatisfactory",
  );
  const deptNamesUnsatisfactory = [
    ...new Set(unsatisfactoryDepts.map(i => i.assigned_department_name).filter(Boolean)),
  ];

  // ── SITUATION SUMMARY ──
  const topDept = deptRanked[0];
  const secondDept = deptRanked[1];
  const sitParts: string[] = [
    `${totalOpen} active issue${totalOpen !== 1 ? "s" : ""} citywide — ${criticalCount} critical, ${escalatedCount} escalated${reworkIssues.length > 0 ? `, ${reworkIssues.length} requiring rework` : ""}.`,
  ];
  if (topDept) {
    const topCrit = topDept.issues.filter(i => i.iir?.severity === "critical").length;
    sitParts.push(
      `${topDept.dept} carries the highest operational load (${topDept.issues.length} issue${topDept.issues.length !== 1 ? "s" : ""}${topCrit > 0 ? `, including ${topCrit} critical` : ""})${secondDept ? `; ${secondDept.dept} follows with ${secondDept.issues.length} pending` : ""}.`,
    );
  }
  const situationSummary = sitParts.join(" ");

  // ── PRIORITY DEPARTMENTS ──
  const priorityLines = deptRanked.slice(0, 3).map(({ dept, issues: dIssues }) => {
    const parts: string[] = [];
    const c = dIssues.filter(i => i.iir?.severity === "critical").length;
    const r = dIssues.filter(i => i.department_status === "needs_rework").length;
    const e = dIssues.filter(i => i.escalated).length;
    if (c > 0) parts.push(`${c} critical`);
    if (r > 0) parts.push(`${r} rework`);
    if (e > 0) parts.push(`${e} escalated`);
    return `${dept}: ${dIssues.length} issue${dIssues.length !== 1 ? "s" : ""}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  });
  const priorityDepts = priorityLines.join(". ") + ".";

  // ── OPERATIONAL CONCERNS ──
  const concernParts: string[] = [];

  if (patterns.length > 0) {
    const [type, count] = patterns[0];
    const locations = issues
      .filter(i => i.iir?.issue_type === type && i.address)
      .map(i => i.address!)
      .slice(0, 2)
      .join(" and ");
    concernParts.push(
      `Recurring pattern: ${type} reported ${count} times${locations ? ` — locations include ${locations}` : ""} — possible systemic infrastructure failure requiring engineering review`,
    );
  }

  if (hotspots.length > 0) {
    const [area, count] = hotspots[0];
    concernParts.push(
      `Area concentration: ${count} issue${count !== 1 ? "s" : ""} in ${area} zones — consider targeted infrastructure audit`,
    );
  }

  if (weatherSensitive.length > 0) {
    const types = [...new Set(weatherSensitive.map(i => i.iir?.repair_category ?? "repair"))];
    concernParts.push(
      `${weatherSensitive.length} weather-sensitive ${types.join(" / ")} operation${weatherSensitive.length !== 1 ? "s" : ""} pending — monsoon / rain may delay completion`,
    );
  }

  if (complexIssues.length > 0) {
    concernParts.push(
      `${complexIssues.length} high/complex-complexity repair${complexIssues.length !== 1 ? "s" : ""} in progress — senior supervision required at site`,
    );
  }

  // Governance concerns
  if (accountabilityFlagged.length > 0) {
    const topDepts = [...deptAccountability.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([dept, count]) => `${dept} (${count} flag${count !== 1 ? "s" : ""})`)
      .join(", ");
    concernParts.push(
      `Governance accountability flags raised for ${accountabilityFlagged.length} issue${accountabilityFlagged.length !== 1 ? "s" : ""} — ${topDepts} — supervisory review required`,
    );
  }

  if (deptNamesUnsatisfactory.length > 0) {
    concernParts.push(
      `Department performance rated unsatisfactory for ${deptNamesUnsatisfactory.join(", ")} — consider crew reassignment or escalation`,
    );
  }

  if (concernParts.length === 0) concernParts.push("No major operational concerns identified at this time");

  const operationalConcerns = concernParts.join(". ") + ".";

  // ── RECOMMENDED EXECUTIVE ACTIONS ──
  const actionParts: string[] = [];

  if (criticals.length > 0) {
    const critDepts = [...new Set(criticals.map(i => i.assigned_department_name ?? "Unassigned"))];
    actionParts.push(
      `Verify on-site deployment for all ${criticals.length} critical issue${criticals.length !== 1 ? "s" : ""} — follow up with ${critDepts.join(", ")} by noon`,
    );
  }

  if (reworkIssues.length > 0) {
    actionParts.push(
      `Review rework cases with department supervisors — ${reworkIssues.length} issue${reworkIssues.length !== 1 ? "s" : ""} failed verification and require corrective action plan`,
    );
  }

  if (patterns.length > 0) {
    actionParts.push(
      `Initiate infrastructure audit for recurring ${patterns[0][0]} reports — coordinate with Chief Engineer, ${topDept?.dept ?? "relevant department"}`,
    );
  } else if (topDept && topDept.issues.length >= 3) {
    actionParts.push(
      `Direct ${topDept.dept} to submit status update on all ${topDept.issues.length} pending issues — review for resource augmentation`,
    );
  }

  if (accountabilityFlagged.length > 0) {
    actionParts.push(
      `Address ${accountabilityFlagged.length} governance accountability flag${accountabilityFlagged.length !== 1 ? "s" : ""} — schedule supervisory review meetings with flagged department heads`,
    );
  }

  if (actionParts.length < 2) {
    actionParts.push("Maintain standard operational protocols — focus on clearing priority backlog before end of shift");
  }

  const executiveActions = actionParts.join(". ") + ".";

  return [
    "SITUATION SUMMARY",
    situationSummary,
    "",
    "PRIORITY DEPARTMENTS",
    priorityDepts,
    "",
    "OPERATIONAL CONCERNS",
    operationalConcerns,
    "",
    "RECOMMENDED EXECUTIVE ACTIONS",
    executiveActions,
  ].join("\n");
}

// ── Gemini prompt formatter ──────────────────────────────────────────────────

function formatBriefingIssue(issue: BriefingIssue, index: number): string {
  const iir = issue.iir;
  if (!iir) {
    return `[${index + 1}] Unknown issue — ${issue.status} | Dept: ${issue.assigned_department_name ?? "Unassigned"} | ${issue.address ?? "Unknown location"}`;
  }

  const gov = issue.governance?.report;
  const flags = [
    issue.escalated ? "⚡ ESCALATED" : null,
    iir.severity === "critical" ? "🔴 CRITICAL" : null,
    issue.citizen_concern_level === "high" ? "🏘️ HIGH COMMUNITY CONCERN" : null,
    issue.department_status === "needs_rework" ? "↩ NEEDS REWORK" : null,
    gov?.accountability_required ? "⚠ ACCOUNTABILITY FLAG" : null,
    gov?.department_performance === "unsatisfactory" ? "✗ DEPT UNDERPERFORMING" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const govLine = gov
    ? `  Governance: ${gov.decision ?? "pending"} | Dept Performance: ${gov.department_performance ?? "?"} | Quality: ${gov.completion_quality ?? "?"}`
    : "";

  return `[${index + 1}] ${iir.issue_type ?? "Unknown"} — ${iir.severity ?? "?"} severity ${flags ? `| ${flags}` : ""}
  Dept: ${issue.assigned_department_name ?? "Unassigned"} | Stage: ${issue.department_status ?? issue.status}
  Location: ${issue.address ?? "Unknown"} | Area: ${iir.area_category ?? "?"}
  Summary: ${iir.summary ?? ""}
  Safety: ${iir.safety_risk ?? ""}
  Impact: ${iir.estimated_population_impact ?? ""} | Priority: ${iir.priority_score ?? "?"}/10
  Repair: ${iir.repair_complexity ?? "?"} complexity — ~${iir.estimated_work_hours ?? "?"}h${iir.weather_sensitive ? " | WEATHER SENSITIVE" : ""}
  Functional: ${iir.functional_importance ?? ""}${govLine ? `\n${govLine}` : ""}`;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateMorningBriefing(input: BriefingInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[MorningBriefing] No API key — using deterministic briefing engine");
    return deterministicBriefing(input);
  }

  const issueReports = input.issues
    .slice(0, 20)
    .map((issue, i) => formatBriefingIssue(issue, i))
    .join("\n\n");

  const prompt = `You are the Municipal AI Command Center. Today you are reading Issue Intelligence Reports submitted across the city.

────────────────────────────────────────────────
ACTIVE ISSUE INTELLIGENCE REPORTS (${input.issues.length} active issues, ${input.criticalCount} critical, ${input.escalatedCount} escalated)
────────────────────────────────────────────────
${issueReports || "No active issues."}
────────────────────────────────────────────────

Read these Issue Intelligence Reports carefully. Do NOT re-analyze individual issues. Instead, reason across them to identify:
1. City-wide trends and patterns (recurring issue types, problem zones, failing infrastructure)
2. Departments under pressure or falling behind
3. Specific safety risks that need immediate Command Center attention today
4. Operational bottlenecks (weather-sensitive repairs, complex jobs with no crew assigned, overdue critical issues)

Produce a structured operational briefing in exactly this format — plain text, no markdown symbols:

SITUATION SUMMARY
[2 sentences: overall city status with specific numbers]

PRIORITY DEPARTMENTS
[1-3 sentences: which departments need attention and why — cite specific issues]

OPERATIONAL CONCERNS
[2-3 sentences: patterns, trends, recurring failures, risks — be specific about issue types and locations]

RECOMMENDED EXECUTIVE ACTIONS
[2-3 specific, actionable directives for the Command Center duty officer today]

Rules: Be direct. Name specific departments, issue types, and locations. No bullet points. No markdown. Reference the IIR data you were given.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 600 },
    });
    const text = (response.text ?? "").trim();
    if (!text) {
      console.warn("[MorningBriefing] Empty Gemini response — using deterministic briefing engine");
      return deterministicBriefing(input);
    }
    return text;
  } catch (err) {
    console.error("[MorningBriefing] Gemini failed — using deterministic briefing engine:", err instanceof Error ? err.message : err);
    return deterministicBriefing(input);
  }
}
