import type { CityCode, DepartmentCategory, RegionalAgency } from "./types";

export const REGIONAL_AGENCIES: Record<string, RegionalAgency> = {
  // ── Bengaluru ──────────────────────────────────────────────────────────────
  bengaluru_bescom: {
    agency_id: "bengaluru_bescom",
    name: "Electricity Distribution (BESCOM)",
    short_code: "BESCOM",
    city: "bengaluru",
    category: "electricity",
    email_aliases: ["bescom@demo.com", "electricity@demo.com", "bescom@bengaluru.gov.in"],
  },
  bengaluru_bwssb: {
    agency_id: "bengaluru_bwssb",
    name: "Water Supply & Sewerage Board (BWSSB)",
    short_code: "BWSSB",
    city: "bengaluru",
    category: "water",
    email_aliases: ["bwssb@demo.com", "water@demo.com", "bwssb@bengaluru.gov.in"],
  },
  bengaluru_bbmp: {
    agency_id: "bengaluru_bbmp",
    name: "Solid Waste & Sanitation (BBMP)",
    short_code: "BBMP",
    city: "bengaluru",
    category: "sanitation",
    email_aliases: ["bbmp@demo.com", "sanitation@demo.com", "bbmp@bengaluru.gov.in"],
  },
  bengaluru_roads: {
    agency_id: "bengaluru_roads",
    name: "Roads & Highways Division (BBMP Roads)",
    short_code: "BBMP Roads",
    city: "bengaluru",
    category: "roads",
    email_aliases: ["roads@demo.com"],
  },
  bengaluru_traffic: {
    agency_id: "bengaluru_traffic",
    name: "Traffic Management (BTP)",
    short_code: "BTP Traffic",
    city: "bengaluru",
    category: "traffic",
    email_aliases: ["traffic@demo.com"],
  },

  // ── Chennai ────────────────────────────────────────────────────────────────
  chennai_tangedco: {
    agency_id: "chennai_tangedco",
    name: "Electricity Distribution (TANGEDCO)",
    short_code: "TANGEDCO",
    city: "chennai",
    category: "electricity",
    email_aliases: ["tangedco@demo.com", "tangedco@chennai.gov.in"],
  },
  chennai_cmwssb: {
    agency_id: "chennai_cmwssb",
    name: "Water Supply & Sewerage Board (CMWSSB)",
    short_code: "CMWSSB",
    city: "chennai",
    category: "water",
    email_aliases: ["cmwssb@demo.com"],
  },
  chennai_gcc: {
    agency_id: "chennai_gcc",
    name: "Greater Chennai Corporation (GCC Sanitation)",
    short_code: "GCC",
    city: "chennai",
    category: "sanitation",
    email_aliases: ["gcc@demo.com"],
  },
  chennai_roads: {
    agency_id: "chennai_roads",
    name: "Chennai Highways & Roads",
    short_code: "GCC Roads",
    city: "chennai",
    category: "roads",
    email_aliases: ["chennairoads@demo.com"],
  },
  chennai_traffic: {
    agency_id: "chennai_traffic",
    name: "Chennai Traffic Police",
    short_code: "CTP",
    city: "chennai",
    category: "traffic",
    email_aliases: ["chennaitraffic@demo.com"],
  },

  // ── Delhi ──────────────────────────────────────────────────────────────────
  delhi_bses: {
    agency_id: "delhi_bses",
    name: "Delhi Power (BSES / TPDDL)",
    short_code: "BSES",
    city: "delhi",
    category: "electricity",
    email_aliases: ["bses@demo.com"],
  },
  delhi_djb: {
    agency_id: "delhi_djb",
    name: "Delhi Jal Board (DJB)",
    short_code: "DJB",
    city: "delhi",
    category: "water",
    email_aliases: ["djb@demo.com"],
  },
  delhi_mcd: {
    agency_id: "delhi_mcd",
    name: "Municipal Corporation of Delhi (MCD Sanitation)",
    short_code: "MCD",
    city: "delhi",
    category: "sanitation",
    email_aliases: ["mcd@demo.com"],
  },

  // ── Generic Fallbacks ──────────────────────────────────────────────────────
  generic_electricity: {
    agency_id: "generic_electricity",
    name: "Electricity & Power Distribution",
    short_code: "Power Grid",
    city: "generic",
    category: "electricity",
    email_aliases: [],
  },
  generic_water: {
    agency_id: "generic_water",
    name: "Water Supply & Sewerage Board",
    short_code: "Water Board",
    city: "generic",
    category: "water",
    email_aliases: [],
  },
  generic_sanitation: {
    agency_id: "generic_sanitation",
    name: "Solid Waste & Sanitation",
    short_code: "Sanitation",
    city: "generic",
    category: "sanitation",
    email_aliases: [],
  },
  generic_roads: {
    agency_id: "generic_roads",
    name: "Roads & Highways Division",
    short_code: "Roads Dept",
    city: "generic",
    category: "roads",
    email_aliases: [],
  },
  generic_traffic: {
    agency_id: "generic_traffic",
    name: "Traffic Management Authority",
    short_code: "Traffic Dept",
    city: "generic",
    category: "traffic",
    email_aliases: [],
  },
  generic_publicworks: {
    agency_id: "generic_publicworks",
    name: "Public Works Department",
    short_code: "Public Works",
    city: "generic",
    category: "publicworks",
    email_aliases: ["publicworks@demo.com", "authority@demo.com"],
  },
};

/**
 * Resolve an agency by user email address
 */
export function getAgencyByEmail(email: string): RegionalAgency {
  const normalized = email.toLowerCase().trim();

  // Search exact alias match
  for (const agency of Object.values(REGIONAL_AGENCIES)) {
    if (agency.email_aliases.map((e) => e.toLowerCase()).includes(normalized)) {
      return agency;
    }
  }

  // Infer city & category from email string (e.g. bescom@demo.com -> bengaluru_bescom)
  if (normalized.includes("bescom")) return REGIONAL_AGENCIES.bengaluru_bescom;
  if (normalized.includes("bwssb")) return REGIONAL_AGENCIES.bengaluru_bwssb;
  if (normalized.includes("bbmp")) return REGIONAL_AGENCIES.bengaluru_bbmp;
  if (normalized.includes("tangedco")) return REGIONAL_AGENCIES.chennai_tangedco;
  if (normalized.includes("cmwssb")) return REGIONAL_AGENCIES.chennai_cmwssb;
  if (normalized.includes("gcc")) return REGIONAL_AGENCIES.chennai_gcc;
  if (normalized.includes("djb")) return REGIONAL_AGENCIES.delhi_djb;
  if (normalized.includes("bses")) return REGIONAL_AGENCIES.delhi_bses;
  if (normalized.includes("mcd")) return REGIONAL_AGENCIES.delhi_mcd;

  // Default to BESCOM Power if email implies electricity/power, or default public works
  if (normalized.includes("electricity") || normalized.includes("power")) return REGIONAL_AGENCIES.bengaluru_bescom;
  if (normalized.includes("water")) return REGIONAL_AGENCIES.bengaluru_bwssb;
  if (normalized.includes("sanitation")) return REGIONAL_AGENCIES.bengaluru_bbmp;
  if (normalized.includes("roads")) return REGIONAL_AGENCIES.bengaluru_roads;
  if (normalized.includes("traffic")) return REGIONAL_AGENCIES.bengaluru_traffic;

  return REGIONAL_AGENCIES.bengaluru_bescom;
}

/**
 * Resolve target agency for a report given city code & department category
 */
export function resolveAgencyForIssue(city: CityCode, category: DepartmentCategory): RegionalAgency {
  const key = `${city}_${category}`;
  if (REGIONAL_AGENCIES[key]) {
    return REGIONAL_AGENCIES[key];
  }

  // Alias lookup for cities with custom short codes (e.g. BESCOM, TANGEDCO, CMWSSB, BWSSB)
  if (city === "bengaluru") {
    if (category === "electricity") return REGIONAL_AGENCIES.bengaluru_bescom;
    if (category === "water") return REGIONAL_AGENCIES.bengaluru_bwssb;
    if (category === "sanitation") return REGIONAL_AGENCIES.bengaluru_bbmp;
  }
  if (city === "chennai") {
    if (category === "electricity") return REGIONAL_AGENCIES.chennai_tangedco;
    if (category === "water") return REGIONAL_AGENCIES.chennai_cmwssb;
    if (category === "sanitation") return REGIONAL_AGENCIES.chennai_gcc;
  }
  if (city === "delhi") {
    if (category === "electricity") return REGIONAL_AGENCIES.delhi_bses;
    if (category === "water") return REGIONAL_AGENCIES.delhi_djb;
    if (category === "sanitation") return REGIONAL_AGENCIES.delhi_mcd;
  }

  const fallbackKey = `generic_${category}`;
  return REGIONAL_AGENCIES[fallbackKey] ?? REGIONAL_AGENCIES.generic_publicworks;
}

export function getAgencyById(agencyId: string): RegionalAgency | null {
  return REGIONAL_AGENCIES[agencyId] ?? null;
}
