// Maps GPS-derived city/state to the correct local municipal authority names.
// Used to make the Gemini prompt regionally accurate instead of Chennai-specific.

export interface RegionalAuthorities {
  water: string;
  electricity: string;
  roads: string;
  sanitation: string;
  traffic: string;
  publicworks: string;
  cityLabel: string; // human-readable city/region name for display
}

// City-level overrides (normalized lowercase keys)
const CITY_AUTHORITIES: Record<string, Partial<RegionalAuthorities>> = {
  // ── Tamil Nadu ────────────────────────────────────────────────────────────
  "chennai": {
    water: "Water Supply & Sewerage (CMWSSB)", electricity: "Electricity Distribution (TANGEDCO)",
    roads: "Roads & Highways Division (GCC/NHAI)", sanitation: "Solid Waste & Sanitation (GCC)",
    traffic: "Traffic Management (CCTP)", cityLabel: "Chennai",
  },
  "coimbatore": {
    water: "Water Supply & Sewerage (TWAD Board / CMC)", electricity: "Electricity Distribution (TANGEDCO)",
    roads: "Roads & Highways Division (CMC/NHAI)", sanitation: "Solid Waste & Sanitation (CMC)",
    traffic: "Traffic Management (Coimbatore City Traffic Police)", cityLabel: "Coimbatore",
  },
  "madurai": {
    water: "Water Supply & Sewerage (TWAD Board / MCC)", electricity: "Electricity Distribution (TANGEDCO)",
    roads: "Roads & Highways Division (MCC/PWD)", sanitation: "Solid Waste & Sanitation (MCC)",
    traffic: "Traffic Management (Madurai City Traffic Police)", cityLabel: "Madurai",
  },

  // ── Karnataka ─────────────────────────────────────────────────────────────
  "bengaluru": {
    water: "Water Supply & Sewerage (BWSSB)", electricity: "Electricity Distribution (BESCOM)",
    roads: "Roads & Highways Division (BBMP/NHAI)", sanitation: "Solid Waste & Sanitation (BBMP)",
    traffic: "Traffic Management (Bengaluru Traffic Police)", cityLabel: "Bengaluru",
  },
  "bangalore": {
    water: "Water Supply & Sewerage (BWSSB)", electricity: "Electricity Distribution (BESCOM)",
    roads: "Roads & Highways Division (BBMP/NHAI)", sanitation: "Solid Waste & Sanitation (BBMP)",
    traffic: "Traffic Management (Bengaluru Traffic Police)", cityLabel: "Bengaluru",
  },
  "mysuru": {
    water: "Water Supply & Sewerage (Mysuru City Corporation)", electricity: "Electricity Distribution (CESC/MESCOM)",
    roads: "Roads & Highways Division (MCC/PWD)", sanitation: "Solid Waste & Sanitation (MCC)",
    traffic: "Traffic Management (Mysuru City Traffic Police)", cityLabel: "Mysuru",
  },

  // ── Telangana ─────────────────────────────────────────────────────────────
  "hyderabad": {
    water: "Water Supply & Sewerage (HMWSSB)", electricity: "Electricity Distribution (TSSPDCL)",
    roads: "Roads & Highways Division (GHMC/NHAI)", sanitation: "Solid Waste & Sanitation (GHMC)",
    traffic: "Traffic Management (Hyderabad Traffic Police)", cityLabel: "Hyderabad",
  },
  "warangal": {
    water: "Water Supply & Sewerage (GWMC / TSMDP)", electricity: "Electricity Distribution (TSNPDCL)",
    roads: "Roads & Highways Division (GWMC/PWD)", sanitation: "Solid Waste & Sanitation (GWMC)",
    traffic: "Traffic Management (Warangal Traffic Police)", cityLabel: "Warangal",
  },

  // ── Maharashtra ───────────────────────────────────────────────────────────
  "mumbai": {
    water: "Water Supply & Sewerage (MCGM / BMC)", electricity: "Electricity Distribution (BEST/Adani/Tata Power)",
    roads: "Roads & Highways Division (BMC/MMRDA)", sanitation: "Solid Waste & Sanitation (BMC)",
    traffic: "Traffic Management (Mumbai Traffic Police)", cityLabel: "Mumbai",
  },
  "pune": {
    water: "Water Supply & Sewerage (PMC)", electricity: "Electricity Distribution (MSEDCL)",
    roads: "Roads & Highways Division (PMC/PMRDA)", sanitation: "Solid Waste & Sanitation (PMC)",
    traffic: "Traffic Management (Pune Traffic Police)", cityLabel: "Pune",
  },
  "nagpur": {
    water: "Water Supply & Sewerage (NMC)", electricity: "Electricity Distribution (MSEDCL/Mahagenco)",
    roads: "Roads & Highways Division (NMC/PWD)", sanitation: "Solid Waste & Sanitation (NMC)",
    traffic: "Traffic Management (Nagpur Traffic Police)", cityLabel: "Nagpur",
  },
  "nashik": {
    water: "Water Supply & Sewerage (NMC Nashik)", electricity: "Electricity Distribution (MSEDCL)",
    roads: "Roads & Highways Division (NMC/PWD)", sanitation: "Solid Waste & Sanitation (NMC)",
    traffic: "Traffic Management (Nashik Traffic Police)", cityLabel: "Nashik",
  },
  "aurangabad": {
    water: "Water Supply & Sewerage (AMC Aurangabad)", electricity: "Electricity Distribution (MSEDCL)",
    roads: "Roads & Highways Division (AMC/PWD)", sanitation: "Solid Waste & Sanitation (AMC)",
    traffic: "Traffic Management (Aurangabad Traffic Police)", cityLabel: "Aurangabad",
  },

  // ── Delhi / NCR ───────────────────────────────────────────────────────────
  "delhi": {
    water: "Water Supply & Sewerage (Delhi Jal Board)", electricity: "Electricity Distribution (BRPL/BYPL/TPDDL)",
    roads: "Roads & Highways Division (PWD Delhi/NDMC)", sanitation: "Solid Waste & Sanitation (MCD/NDMC)",
    traffic: "Traffic Management (Delhi Traffic Police)", cityLabel: "Delhi",
  },
  "new delhi": {
    water: "Water Supply & Sewerage (Delhi Jal Board)", electricity: "Electricity Distribution (BRPL/BYPL/TPDDL)",
    roads: "Roads & Highways Division (PWD Delhi/NDMC)", sanitation: "Solid Waste & Sanitation (MCD/NDMC)",
    traffic: "Traffic Management (Delhi Traffic Police)", cityLabel: "Delhi",
  },
  "gurugram": {
    water: "Water Supply & Sewerage (GMDA/Haryana PHED)", electricity: "Electricity Distribution (DHBVN)",
    roads: "Roads & Highways Division (MCG/NHAI)", sanitation: "Solid Waste & Sanitation (MCG)",
    traffic: "Traffic Management (Gurugram Traffic Police)", cityLabel: "Gurugram",
  },
  "noida": {
    water: "Water Supply & Sewerage (Noida Authority / UP Jal Nigam)", electricity: "Electricity Distribution (PVVNL)",
    roads: "Roads & Highways Division (Noida Authority/NHAI)", sanitation: "Solid Waste & Sanitation (Noida Authority)",
    traffic: "Traffic Management (Noida Traffic Police)", cityLabel: "Noida",
  },
  "ghaziabad": {
    water: "Water Supply & Sewerage (GDA / UP Jal Nigam)", electricity: "Electricity Distribution (PVVNL)",
    roads: "Roads & Highways Division (GDA/NHAI)", sanitation: "Solid Waste & Sanitation (GMC)",
    traffic: "Traffic Management (Ghaziabad Traffic Police)", cityLabel: "Ghaziabad",
  },

  // ── West Bengal ───────────────────────────────────────────────────────────
  "kolkata": {
    water: "Water Supply & Sewerage (Kolkata Municipal Corporation)", electricity: "Electricity Distribution (CESC)",
    roads: "Roads & Highways Division (KMC/KMDA)", sanitation: "Solid Waste & Sanitation (KMC)",
    traffic: "Traffic Management (Kolkata Traffic Police)", cityLabel: "Kolkata",
  },
  "asansol": {
    water: "Water Supply & Sewerage (Asansol Municipal Corporation)", electricity: "Electricity Distribution (DVC/WBSEDCL)",
    roads: "Roads & Highways Division (Asansol Municipal Corporation)", sanitation: "Solid Waste & Sanitation (Asansol Municipal Corporation)",
    traffic: "Traffic Management (Asansol Traffic Police)", cityLabel: "Asansol",
  },
  "durgapur": {
    water: "Water Supply & Sewerage (Durgapur Municipal Corporation)", electricity: "Electricity Distribution (DVC/WBSEDCL)",
    roads: "Roads & Highways Division (DMC/NHAI)", sanitation: "Solid Waste & Sanitation (DMC)",
    traffic: "Traffic Management (Durgapur Traffic Police)", cityLabel: "Durgapur",
  },
  "howrah": {
    water: "Water Supply & Sewerage (Howrah Municipal Corporation)", electricity: "Electricity Distribution (CESC/WBSEDCL)",
    roads: "Roads & Highways Division (HMC/KMC)", sanitation: "Solid Waste & Sanitation (HMC)",
    traffic: "Traffic Management (Howrah Traffic Police)", cityLabel: "Howrah",
  },
  "siliguri": {
    water: "Water Supply & Sewerage (SMC / WBPHED)", electricity: "Electricity Distribution (WBSEDCL)",
    roads: "Roads & Highways Division (SMC/NHAI)", sanitation: "Solid Waste & Sanitation (SMC)",
    traffic: "Traffic Management (Siliguri Traffic Police)", cityLabel: "Siliguri",
  },

  // ── Gujarat ───────────────────────────────────────────────────────────────
  "ahmedabad": {
    water: "Water Supply & Sewerage (AMC / GWSSB)", electricity: "Electricity Distribution (Torrent Power)",
    roads: "Roads & Highways Division (AMC/AUDA)", sanitation: "Solid Waste & Sanitation (AMC)",
    traffic: "Traffic Management (Ahmedabad Traffic Police)", cityLabel: "Ahmedabad",
  },
  "surat": {
    water: "Water Supply & Sewerage (SMC / GWSSB)", electricity: "Electricity Distribution (DGVCL/Torrent)",
    roads: "Roads & Highways Division (SMC/SUDA)", sanitation: "Solid Waste & Sanitation (SMC)",
    traffic: "Traffic Management (Surat Traffic Police)", cityLabel: "Surat",
  },
  "vadodara": {
    water: "Water Supply & Sewerage (VMC / GWSSB)", electricity: "Electricity Distribution (MGVCL)",
    roads: "Roads & Highways Division (VMC/PWD)", sanitation: "Solid Waste & Sanitation (VMC)",
    traffic: "Traffic Management (Vadodara Traffic Police)", cityLabel: "Vadodara",
  },

  // ── Rajasthan ─────────────────────────────────────────────────────────────
  "jaipur": {
    water: "Water Supply & Sewerage (JMC / PHED Rajasthan)", electricity: "Electricity Distribution (JVVNL)",
    roads: "Roads & Highways Division (JMC/NHAI)", sanitation: "Solid Waste & Sanitation (JMC)",
    traffic: "Traffic Management (Jaipur Traffic Police)", cityLabel: "Jaipur",
  },
  "jodhpur": {
    water: "Water Supply & Sewerage (JMC Jodhpur / PHED)", electricity: "Electricity Distribution (JDVVNL)",
    roads: "Roads & Highways Division (JMC/PWD)", sanitation: "Solid Waste & Sanitation (JMC)",
    traffic: "Traffic Management (Jodhpur Traffic Police)", cityLabel: "Jodhpur",
  },

  // ── Uttar Pradesh ─────────────────────────────────────────────────────────
  "lucknow": {
    water: "Water Supply & Sewerage (LMC / UP Jal Nigam)", electricity: "Electricity Distribution (DVVNL/UPPCL)",
    roads: "Roads & Highways Division (LMC/UP PWD)", sanitation: "Solid Waste & Sanitation (LMC)",
    traffic: "Traffic Management (Lucknow Traffic Police)", cityLabel: "Lucknow",
  },
  "kanpur": {
    water: "Water Supply & Sewerage (KNN / UP Jal Nigam)", electricity: "Electricity Distribution (DVVNL)",
    roads: "Roads & Highways Division (KMC/UP PWD)", sanitation: "Solid Waste & Sanitation (KMC)",
    traffic: "Traffic Management (Kanpur Traffic Police)", cityLabel: "Kanpur",
  },
  "agra": {
    water: "Water Supply & Sewerage (AMC / UP Jal Nigam)", electricity: "Electricity Distribution (PVVNL)",
    roads: "Roads & Highways Division (AMC/UP PWD)", sanitation: "Solid Waste & Sanitation (AMC)",
    traffic: "Traffic Management (Agra Traffic Police)", cityLabel: "Agra",
  },
  "varanasi": {
    water: "Water Supply & Sewerage (VMC / UP Jal Nigam)", electricity: "Electricity Distribution (PVVNL)",
    roads: "Roads & Highways Division (VMC/NHAI)", sanitation: "Solid Waste & Sanitation (VMC)",
    traffic: "Traffic Management (Varanasi Traffic Police)", cityLabel: "Varanasi",
  },

  // ── Madhya Pradesh ────────────────────────────────────────────────────────
  "bhopal": {
    water: "Water Supply & Sewerage (BMC / PHE Dept MP)", electricity: "Electricity Distribution (MPEZ/MPPKVVCL)",
    roads: "Roads & Highways Division (BMC/PWD)", sanitation: "Solid Waste & Sanitation (BMC)",
    traffic: "Traffic Management (Bhopal Traffic Police)", cityLabel: "Bhopal",
  },
  "indore": {
    water: "Water Supply & Sewerage (IMC / PHE Dept MP)", electricity: "Electricity Distribution (MPPKVVCL)",
    roads: "Roads & Highways Division (IMC/PWD)", sanitation: "Solid Waste & Sanitation (IMC)",
    traffic: "Traffic Management (Indore Traffic Police)", cityLabel: "Indore",
  },

  // ── Punjab / Chandigarh ───────────────────────────────────────────────────
  "chandigarh": {
    water: "Water Supply & Sewerage (MC Chandigarh)", electricity: "Electricity Distribution (CSPDCL)",
    roads: "Roads & Highways Division (MC Chandigarh/PWD)", sanitation: "Solid Waste & Sanitation (MC Chandigarh)",
    traffic: "Traffic Management (Chandigarh Traffic Police)", cityLabel: "Chandigarh",
  },
  "ludhiana": {
    water: "Water Supply & Sewerage (MC Ludhiana)", electricity: "Electricity Distribution (PSPCL)",
    roads: "Roads & Highways Division (MC Ludhiana/PWD)", sanitation: "Solid Waste & Sanitation (MC Ludhiana)",
    traffic: "Traffic Management (Ludhiana Traffic Police)", cityLabel: "Ludhiana",
  },
  "amritsar": {
    water: "Water Supply & Sewerage (MC Amritsar)", electricity: "Electricity Distribution (PSPCL)",
    roads: "Roads & Highways Division (MC Amritsar/NHAI)", sanitation: "Solid Waste & Sanitation (MC Amritsar)",
    traffic: "Traffic Management (Amritsar Traffic Police)", cityLabel: "Amritsar",
  },

  // ── Andhra Pradesh ────────────────────────────────────────────────────────
  "visakhapatnam": {
    water: "Water Supply & Sewerage (GVMC)", electricity: "Electricity Distribution (APEPDCL)",
    roads: "Roads & Highways Division (GVMC/NHAI)", sanitation: "Solid Waste & Sanitation (GVMC)",
    traffic: "Traffic Management (Visakhapatnam Traffic Police)", cityLabel: "Visakhapatnam",
  },
  "vijayawada": {
    water: "Water Supply & Sewerage (VMC Vijayawada)", electricity: "Electricity Distribution (APEPDCL)",
    roads: "Roads & Highways Division (VMC/NHAI)", sanitation: "Solid Waste & Sanitation (VMC)",
    traffic: "Traffic Management (Vijayawada Traffic Police)", cityLabel: "Vijayawada",
  },

  // ── Kerala ────────────────────────────────────────────────────────────────
  "kochi": {
    water: "Water Supply & Sewerage (Kerala Water Authority)", electricity: "Electricity Distribution (KSEB)",
    roads: "Roads & Highways Division (GCDA/PWD Kerala)", sanitation: "Solid Waste & Sanitation (Kochi Corporation)",
    traffic: "Traffic Management (Kochi City Traffic Police)", cityLabel: "Kochi",
  },
  "thiruvananthapuram": {
    water: "Water Supply & Sewerage (Kerala Water Authority)", electricity: "Electricity Distribution (KSEB)",
    roads: "Roads & Highways Division (TCC/PWD Kerala)", sanitation: "Solid Waste & Sanitation (TCC)",
    traffic: "Traffic Management (Thiruvananthapuram Traffic Police)", cityLabel: "Thiruvananthapuram",
  },

  // ── Odisha ────────────────────────────────────────────────────────────────
  "bhubaneswar": {
    water: "Water Supply & Sewerage (BMC / WATCO Odisha)", electricity: "Electricity Distribution (TPCODL)",
    roads: "Roads & Highways Division (BMC/NHAI)", sanitation: "Solid Waste & Sanitation (BMC)",
    traffic: "Traffic Management (Bhubaneswar Traffic Police)", cityLabel: "Bhubaneswar",
  },

  // ── Assam ─────────────────────────────────────────────────────────────────
  "guwahati": {
    water: "Water Supply & Sewerage (GMC / PHED Assam)", electricity: "Electricity Distribution (APDCL)",
    roads: "Roads & Highways Division (GMC/NHAI)", sanitation: "Solid Waste & Sanitation (GMC)",
    traffic: "Traffic Management (Guwahati Traffic Police)", cityLabel: "Guwahati",
  },

  // ── Jharkhand ─────────────────────────────────────────────────────────────
  "ranchi": {
    water: "Water Supply & Sewerage (RMC / DWSD Jharkhand)", electricity: "Electricity Distribution (JBVNL)",
    roads: "Roads & Highways Division (RMC/RCD)", sanitation: "Solid Waste & Sanitation (RMC)",
    traffic: "Traffic Management (Ranchi Traffic Police)", cityLabel: "Ranchi",
  },

  // ── Chhattisgarh ──────────────────────────────────────────────────────────
  "raipur": {
    water: "Water Supply & Sewerage (RMC / PHE Dept CG)", electricity: "Electricity Distribution (CSPDCL)",
    roads: "Roads & Highways Division (RMC/PWD)", sanitation: "Solid Waste & Sanitation (RMC)",
    traffic: "Traffic Management (Raipur Traffic Police)", cityLabel: "Raipur",
  },

  // ── Uttarakhand ───────────────────────────────────────────────────────────
  "dehradun": {
    water: "Water Supply & Sewerage (DMC / UK Jal Sansthan)", electricity: "Electricity Distribution (UPCL)",
    roads: "Roads & Highways Division (DMC/PWD)", sanitation: "Solid Waste & Sanitation (DMC)",
    traffic: "Traffic Management (Dehradun Traffic Police)", cityLabel: "Dehradun",
  },
};

// State-level fallbacks when city is not in the city lookup
const STATE_AUTHORITIES: Record<string, Partial<RegionalAuthorities>> = {
  "tamil nadu": {
    water: "Water Supply & Sewerage (TWAD Board)", electricity: "Electricity Distribution (TANGEDCO)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "karnataka": {
    water: "Water Supply & Sewerage (KUIDFC / Municipal Board)", electricity: "Electricity Distribution (BESCOM/MESCOM/GESCOM)",
    roads: "Roads & Highways Division (BDA/State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "telangana": {
    water: "Water Supply & Sewerage (TSMDP / Municipal)", electricity: "Electricity Distribution (TSSPDCL/TSNPDCL)",
    roads: "Roads & Highways Division (R&B Dept Telangana)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "andhra pradesh": {
    water: "Water Supply & Sewerage (APWSSB)", electricity: "Electricity Distribution (APEPDCL/APSPDCL)",
    roads: "Roads & Highways Division (R&B Dept AP)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "maharashtra": {
    water: "Water Supply & Sewerage (Municipal Water Works)", electricity: "Electricity Distribution (MSEDCL)",
    roads: "Roads & Highways Division (Municipal Corporation/PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "gujarat": {
    water: "Water Supply & Sewerage (GWSSB)", electricity: "Electricity Distribution (PGVCL/UGVCL/MGVCL/DGVCL)",
    roads: "Roads & Highways Division (Municipal Corporation/PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "rajasthan": {
    water: "Water Supply & Sewerage (PHED Rajasthan)", electricity: "Electricity Distribution (JVVNL/JDVVNL/AVVNL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "uttar pradesh": {
    water: "Water Supply & Sewerage (UP Jal Nigam)", electricity: "Electricity Distribution (UPPCL)",
    roads: "Roads & Highways Division (UP PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "madhya pradesh": {
    water: "Water Supply & Sewerage (PHE Dept MP)", electricity: "Electricity Distribution (MPPKVVCL/MPEZ)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "west bengal": {
    water: "Water Supply & Sewerage (WBPHED / Municipal Corporation)", electricity: "Electricity Distribution (WBSEDCL/CESC)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "punjab": {
    water: "Water Supply & Sewerage (PSWSS / Municipal Corporation)", electricity: "Electricity Distribution (PSPCL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "haryana": {
    water: "Water Supply & Sewerage (HSVP / Municipal Corporation)", electricity: "Electricity Distribution (DHBVN/UHBVN)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "kerala": {
    water: "Water Supply & Sewerage (Kerala Water Authority)", electricity: "Electricity Distribution (KSEB)",
    roads: "Roads & Highways Division (PWD Kerala)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "odisha": {
    water: "Water Supply & Sewerage (PHED Odisha)", electricity: "Electricity Distribution (TPWODL/TPNODL/TPCODL/TPSODL)",
    roads: "Roads & Highways Division (Works Dept Odisha)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "assam": {
    water: "Water Supply & Sewerage (PHED Assam)", electricity: "Electricity Distribution (APDCL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "jharkhand": {
    water: "Water Supply & Sewerage (DWSD Jharkhand)", electricity: "Electricity Distribution (JBVNL)",
    roads: "Roads & Highways Division (RCD Jharkhand)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "chhattisgarh": {
    water: "Water Supply & Sewerage (PHE Dept CG)", electricity: "Electricity Distribution (CSPDCL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "himachal pradesh": {
    water: "Water Supply & Sewerage (IPH Dept HP)", electricity: "Electricity Distribution (HPSEBL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "uttarakhand": {
    water: "Water Supply & Sewerage (UK Jal Sansthan)", electricity: "Electricity Distribution (UPCL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
  "goa": {
    water: "Water Supply & Sewerage (PWD Goa)", electricity: "Electricity Distribution (Goa Electricity Dept)",
    roads: "Roads & Highways Division (PWD Goa)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (Goa Traffic Police)",
  },
  "bihar": {
    water: "Water Supply & Sewerage (PHED Bihar)", electricity: "Electricity Distribution (BSPHCL)",
    roads: "Roads & Highways Division (State PWD)", sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
    traffic: "Traffic Management (City Traffic Police)",
  },
};

const GENERIC_DEFAULTS: RegionalAuthorities = {
  water: "Water Supply & Sewerage (Municipal Water Board)",
  electricity: "Electricity Distribution (State Electricity Board)",
  roads: "Roads & Highways Division (Municipal Corporation/PWD)",
  sanitation: "Solid Waste & Sanitation (Municipal Corporation)",
  traffic: "Traffic Management (City Traffic Police)",
  publicworks: "Public Works Department",
  cityLabel: "your area",
};

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getRegionalAuthorities(city: string, state: string): RegionalAuthorities {
  const cityKey = normalise(city);
  const stateKey = normalise(state);

  const cityMatch = CITY_AUTHORITIES[cityKey];
  const stateMatch = STATE_AUTHORITIES[stateKey];

  return {
    water: cityMatch?.water ?? stateMatch?.water ?? GENERIC_DEFAULTS.water,
    electricity: cityMatch?.electricity ?? stateMatch?.electricity ?? GENERIC_DEFAULTS.electricity,
    roads: cityMatch?.roads ?? stateMatch?.roads ?? GENERIC_DEFAULTS.roads,
    sanitation: cityMatch?.sanitation ?? stateMatch?.sanitation ?? GENERIC_DEFAULTS.sanitation,
    traffic: cityMatch?.traffic ?? stateMatch?.traffic ?? GENERIC_DEFAULTS.traffic,
    publicworks: GENERIC_DEFAULTS.publicworks,
    cityLabel: cityMatch?.cityLabel ?? (city || state || "your area"),
  };
}

/**
 * Returns human-friendly regional agency label for a given functional department key and city.
 * E.g., ('water', 'Bengaluru') -> 'BWSSB (Water Supply & Sewerage)'
 * E.g., ('water', 'Chennai') -> 'CMWSSB (Water Supply & Sewerage)'
 * E.g., ('electricity', 'Bengaluru') -> 'BESCOM (Electricity Distribution)'
 */
export function getRegionalAgencyLabel(deptKey: string, city?: string, fallbackText?: string): string {
  if (fallbackText && fallbackText.trim().length > 0 && !fallbackText.includes("Municipal")) {
    return fallbackText;
  }

  const cleanCity = city ? city.split(",")[0].trim() : "";
  const auth = getRegionalAuthorities(cleanCity, cleanCity);
  const key = deptKey === "cmwssb" ? "water" : deptKey;

  switch (key) {
    case "water":
      return auth.water;
    case "electricity":
      return auth.electricity;
    case "roads":
      return auth.roads;
    case "sanitation":
      return auth.sanitation;
    case "traffic":
      return auth.traffic;
    case "publicworks":
      return auth.publicworks;
    default:
      return fallbackText || "Public Works Department";
  }
}

export const CITIES_LIST = [
  "All Municipalities",
  "Bengaluru",
  "Chennai",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Pune",
  "Coimbatore",
  "Madurai",
  "Kolkata",
  "Ahmedabad",
];

