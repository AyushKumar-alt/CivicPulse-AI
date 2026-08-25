import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "community-hero-ai-1d497";

const app = initializeApp({ projectId: "community-hero-ai-1d497" });
const db = getFirestore(app);

const SEED_ISSUES = [
  {
    id: "iss_water_main_break_01",
    reporter_uid: "demo_citizen_01",
    reporterUid: "demo_citizen_01",
    raw_description: "Major Water Main Break and Road Cave-in near Yelahanka junction.",
    image_url: "https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=800&q=80",
    submitted_at: new Date().toISOString(),
    status: "analyzed",
    state: "ROUTED",
    department_status: "assigned",
    assigned_department_name: "Water Supply & Sewerage Board (BWSSB)",
    assigned_agency_id: "bengaluru_bwssb",
    assignedAgencyId: "bengaluru_bwssb",
    assignedAgencyName: "Water Supply & Sewerage Board (BWSSB)",
    parentIssueId: null,
    geoContext: {
      coordinates: { latitude: 13.14743, longitude: 77.61998 },
      localityName: "Hunasamaranahalli",
      talukName: "Yelahanka",
      districtName: "Bengaluru Urban",
      state: "Karnataka",
      country: "India",
      fullAddress: "Hunasamaranahalli, Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
    },
    location: {
      lat: 13.14743,
      lng: 77.61998,
      fullAddress: "Hunasamaranahalli, Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
      address: "Hunasamaranahalli, Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
    },
    ai: {
      issue_type: "Major Water Main Break and Road Cave-in",
      severity: "critical",
      confidence: 0.98,
      summary: "High pressure water main pipe burst presenting immediate erosion and traffic hazard.",
      safety_risk: "Extreme fall and collision hazard for traffic and pedestrians.",
      responsible_authority: "Water Supply & Sewerage Board (BWSSB)",
    },
    area_category: "Transit & Residential Infrastructure Zone",
    area_confidence: 0.95,
    area_reasoning: "High density arterial road with utility pipeline grid beneath asphalt surface.",
  },
  {
    id: "iss_road_pothole_02",
    reporter_uid: "demo_citizen_01",
    reporterUid: "demo_citizen_01",
    raw_description: "Severe Road Surface Deterioration and Waterlogged Potholes.",
    image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80",
    submitted_at: new Date(Date.now() - 3600000).toISOString(),
    status: "analyzed",
    state: "ACKNOWLEDGED",
    department_status: "assigned",
    assigned_department_name: "Bruhat Bengaluru Mahanagara Palike (BBMP)",
    assigned_agency_id: "bengaluru_bbmp",
    assignedAgencyId: "bengaluru_bbmp",
    assignedAgencyName: "Bruhat Bengaluru Mahanagara Palike (BBMP)",
    parentIssueId: null,
    geoContext: {
      coordinates: { latitude: 13.14739, longitude: 77.61999 },
      localityName: "Kodagalahatti",
      talukName: "Yelahanka",
      districtName: "Bengaluru Urban",
      state: "Karnataka",
      country: "India",
      fullAddress: "Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
    },
    location: {
      lat: 13.14739,
      lng: 77.61999,
      fullAddress: "Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
      address: "Kodagalahatti, Yelahanka taluku, Bengaluru Urban, Karnataka, 562157, India",
    },
    ai: {
      issue_type: "Severe Road Surface Deterioration",
      severity: "high",
      confidence: 0.92,
      summary: "Deep waterlogged potholes causing severe vehicle slowdown and traffic bottleneck.",
      safety_risk: "Pothole depth poses vehicle suspension damage and vehicle control loss risk.",
      responsible_authority: "Bruhat Bengaluru Mahanagara Palike (BBMP)",
    },
    area_category: "Commercial & Transport Zone",
    area_confidence: 0.93,
    area_reasoning: "Commercial transport zone experiencing monsoon drainage overflow.",
  },
];

async function seed() {
  console.log("🌱 Seeding Local Firestore Emulator at 127.0.0.1:8080...");
  for (const issue of SEED_ISSUES) {
    await db.collection("issues").doc(issue.id).set(issue, { merge: true });
    console.log(`  ✅ Seeded issue: ${issue.id} (${issue.state})`);
  }
  console.log("🎉 Local Firestore Emulator Seed Complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
