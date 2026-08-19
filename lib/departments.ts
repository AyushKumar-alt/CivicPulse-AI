export type DepartmentKey =
  | "roads"
  | "water"
  | "cmwssb"
  | "electricity"
  | "sanitation"
  | "traffic"
  | "publicworks";

export interface DepartmentInfo {
  key: DepartmentKey;
  name: string;          // full display name
  shortName: string;     // compact version for badges
  email: string;
  icon: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
  activeBgClass: string;
  // Demo crew availability data
  crewAvailable: number;
  crewTotal: number;
  avgResponseTime: string;
}

export const DEPARTMENTS: Record<DepartmentKey, DepartmentInfo> = {
  roads: {
    key: "roads",
    name: "Roads & Highways Division",
    shortName: "Roads",
    email: "roads@demo.com",
    icon: "🛣️",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-200",
    textClass: "text-orange-700",
    badgeClass: "bg-orange-100 text-orange-800",
    activeBgClass: "bg-orange-600",
    crewAvailable: 3,
    crewTotal: 6,
    avgResponseTime: "4–6 hrs",
  },
  water: {
    key: "water",
    name: "Water Supply & Sewerage Board",
    shortName: "Water & Sewerage",
    email: "water@demo.com",
    icon: "💧",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    textClass: "text-blue-700",
    badgeClass: "bg-blue-100 text-blue-800",
    activeBgClass: "bg-blue-600",
    crewAvailable: 3,
    crewTotal: 6,
    avgResponseTime: "3–5 hrs",
  },
  cmwssb: {
    key: "cmwssb",
    name: "Water Supply & Sewerage Board",
    shortName: "Water & Sewerage",
    email: "cmwssb@demo.com",
    icon: "💧",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    textClass: "text-blue-700",
    badgeClass: "bg-blue-100 text-blue-800",
    activeBgClass: "bg-blue-600",
    crewAvailable: 3,
    crewTotal: 6,
    avgResponseTime: "3–5 hrs",
  },
  electricity: {
    key: "electricity",
    name: "Electricity & Power Distribution",
    shortName: "Electricity",
    email: "electricity@demo.com",
    icon: "⚡",
    bgClass: "bg-yellow-50",
    borderClass: "border-yellow-200",
    textClass: "text-yellow-700",
    badgeClass: "bg-yellow-100 text-yellow-800",
    activeBgClass: "bg-yellow-500",
    crewAvailable: 4,
    crewTotal: 6,
    avgResponseTime: "2–4 hrs",
  },
  sanitation: {
    key: "sanitation",
    name: "Solid Waste & Sanitation",
    shortName: "Sanitation",
    email: "sanitation@demo.com",
    icon: "🗑️",
    bgClass: "bg-green-50",
    borderClass: "border-green-200",
    textClass: "text-green-700",
    badgeClass: "bg-green-100 text-green-800",
    activeBgClass: "bg-green-600",
    crewAvailable: 5,
    crewTotal: 8,
    avgResponseTime: "2–3 hrs",
  },
  traffic: {
    key: "traffic",
    name: "Traffic Management",
    shortName: "Traffic",
    email: "traffic@demo.com",
    icon: "🚦",
    bgClass: "bg-red-50",
    borderClass: "border-red-200",
    textClass: "text-red-700",
    badgeClass: "bg-red-100 text-red-800",
    activeBgClass: "bg-red-600",
    crewAvailable: 2,
    crewTotal: 4,
    avgResponseTime: "1–2 hrs",
  },
  publicworks: {
    key: "publicworks",
    name: "Public Works Department",
    shortName: "Public Works",
    email: "publicworks@demo.com",
    icon: "🏛️",
    bgClass: "bg-gray-50",
    borderClass: "border-gray-200",
    textClass: "text-gray-600",
    badgeClass: "bg-gray-100 text-gray-700",
    activeBgClass: "bg-gray-700",
    crewAvailable: 3,
    crewTotal: 7,
    avgResponseTime: "5–8 hrs",
  },
};

// Distinct list of canonical functional departments (excludes duplicate cmwssb key alias for UI lists)
export const DEPARTMENT_LIST: DepartmentInfo[] = [
  DEPARTMENTS.roads,
  DEPARTMENTS.water,
  DEPARTMENTS.electricity,
  DEPARTMENTS.sanitation,
  DEPARTMENTS.traffic,
  DEPARTMENTS.publicworks,
];

// Deterministic routing: maps responsible_authority / issue_type → universal department key
const ROUTING_RULES: Array<[RegExp, DepartmentKey]> = [
  [/pole|electric|streetlight|street\s*light|lighting|power|tneb|bescom|tesspdcl|msedcl|tata power|adani|lamp post|wire|cable|high-tension/i, "electricity"],
  [/traffic|signal|junction|intersection/i, "traffic"],
  [/water|sewerage|sewage|drainage|pipeline|leakage|waterlogging|flooding|cmwssb|bwssb|djb|hmwssb|jal board|storm drain/i, "water"],
  [/sanit|garbage|waste|rubbish|trash|solid waste|dump|litter|sweeping|bbmp solid waste|mcd/i, "sanitation"],
  [/road|highway|pothole|footpath|pavement|sidewalk|bitumen|tar road|asphalt|nhai|transport|bbmp/i, "roads"],
  [/public works|infrastructure|building|structural|civic maintenance|pwd/i, "publicworks"],
];

export function mapToDepartment(responsibleAuthority: string, issueType?: string): DepartmentInfo {
  const combined = [responsibleAuthority, issueType].filter(Boolean).join(" ");
  for (const [pattern, key] of ROUTING_RULES) {
    if (pattern.test(combined)) return DEPARTMENTS[key];
  }
  return DEPARTMENTS.publicworks;
}

export function getDepartmentByKey(key: string): DepartmentInfo | null {
  if (key === "cmwssb") return DEPARTMENTS.water;
  return DEPARTMENTS[key as DepartmentKey] ?? null;
}

// Human-readable labels for department workflow stages
export const DEPT_STAGE_LABEL: Record<string, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  crew_assigned: "Crew Assigned",
  repair_started: "Repair Started",
  repair_completed: "Repair Completed",
  ready_for_verification: "Submitted for Verification",
  needs_rework: "Rework Required",
  command_center_approved: "Approved",
  command_center_rejected: "Sent Back for Rework",
};

// Valid forward stage transitions from current dept_status
export const STAGE_TRANSITIONS: Record<string, string> = {
  assigned: "accepted",
  accepted: "crew_assigned",
  crew_assigned: "repair_started",
  needs_rework: "accepted",
};
