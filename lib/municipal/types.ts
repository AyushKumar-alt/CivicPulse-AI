export type CityCode = "bengaluru" | "chennai" | "delhi" | "mumbai" | "generic";

export type DepartmentCategory =
  | "electricity"
  | "water"
  | "sanitation"
  | "roads"
  | "traffic"
  | "publicworks";

export interface RegionalAgency {
  agency_id: string;               // Unique key, e.g. "bengaluru_bescom", "chennai_tangedco"
  name: string;                    // Full display name, e.g. "Electricity Distribution (BESCOM)"
  short_code: string;              // Agency acronym, e.g. "BESCOM", "TANGEDCO", "BWSSB", "CMWSSB"
  city: CityCode;                  // City scope, e.g. "bengaluru"
  category: DepartmentCategory;    // Primary department category
  email_aliases: string[];         // Login emails mapped to this agency
}
