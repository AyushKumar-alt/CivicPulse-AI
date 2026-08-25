import type { DepartmentCategoryKey, IssueSubcategory } from "@/src/modules/contracts";

export const CANONICAL_CATEGORIES: Record<DepartmentCategoryKey, { displayName: string; subcategories: IssueSubcategory[] }> = {
  electricity: {
    displayName: "Electricity Distribution",
    subcategories: [
      { key: "fallen_pole", displayName: "Fallen Electricity Pole" },
      { key: "power_outage", displayName: "Power Outage" },
      { key: "dangling_wires", displayName: "Dangling High-Tension Wires" },
      { key: "transformer_damage", displayName: "Transformer Damage" },
      { key: "streetlight_out", displayName: "Streetlight Failure" },
    ],
  },
  water: {
    displayName: "Water Supply & Sewerage",
    subcategories: [
      { key: "pipe_leakage", displayName: "Water Pipe Leakage" },
      { key: "burst_pipeline", displayName: "Burst Main Water Pipeline" },
      { key: "sewage_overflow", displayName: "Sewage Overflow" },
      { key: "waterlogging", displayName: "Waterlogging & Flooding" },
      { key: "drain_blockage", displayName: "Storm Drain Blockage" },
    ],
  },
  sanitation: {
    displayName: "Solid Waste & Sanitation",
    subcategories: [
      { key: "garbage_dump", displayName: "Unattended Garbage Dump" },
      { key: "bin_overflow", displayName: "Overflowing Waste Bin" },
      { key: "street_sweeping", displayName: "Irregular Street Sweeping" },
      { key: "hazardous_waste", displayName: "Hazardous Waste Accumulation" },
    ],
  },
  roads: {
    displayName: "Roads & Highways",
    subcategories: [
      { key: "pothole", displayName: "Pothole & Surface Damage" },
      { key: "footpath_damage", displayName: "Damaged Footpath / Pavement" },
      { key: "road_cave_in", displayName: "Road Cave-In" },
      { key: "asphalt_erosion", displayName: "Bitumen / Asphalt Erosion" },
    ],
  },
  traffic: {
    displayName: "Traffic Management",
    subcategories: [
      { key: "signal_failure", displayName: "Traffic Light Signal Failure" },
      { key: "junction_congestion", displayName: "Unregulated Junction Bottleneck" },
      { key: "signage_damage", displayName: "Damaged Traffic Signage / Divider" },
    ],
  },
  publicworks: {
    displayName: "Public Works & Civic Infrastructure",
    subcategories: [
      { key: "structural_damage", displayName: "Public Building Structural Damage" },
      { key: "wall_collapse", displayName: "Compound Wall Collapse Risk" },
      { key: "general_maintenance", displayName: "General Civic Property Maintenance" },
    ],
  },
};

export class TaxonomyEngine {
  public static isSupportedCategory(categoryKey: string): categoryKey is DepartmentCategoryKey {
    return Object.prototype.hasOwnProperty.call(CANONICAL_CATEGORIES, categoryKey);
  }

  public static getSubcategories(categoryKey: DepartmentCategoryKey): IssueSubcategory[] {
    return CANONICAL_CATEGORIES[categoryKey]?.subcategories ?? [];
  }

  public static normalizeCategory(rawCategory: string): DepartmentCategoryKey | null {
    const normalized = rawCategory.trim().toLowerCase();
    if (this.isSupportedCategory(normalized)) {
      return normalized;
    }
    return null;
  }
}
