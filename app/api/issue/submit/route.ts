import { NextRequest } from "next/server";

export const maxDuration = 60;
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { AuthContextResolver, AuthorizationPolicy } from "@/src/modules/auth";
import { FirestoreIssueRepository } from "@/src/modules/data";
import { NominatimGeoAdapter } from "@/src/modules/geo";
import { GeminiAIAdapter } from "@/src/modules/ai";
import { SubmitIssueService } from "@/src/modules/application";

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Unauthorized: Missing authentication token" }, { status: 401 });
  }

  let user;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    user = AuthContextResolver.buildIdentity(decoded.uid, decoded.email ?? "", decoded);
  } catch (authErr) {
    console.error("[SUBMIT AUTH ERROR]", authErr);
    const errMessage = authErr instanceof Error ? authErr.message : "Invalid authentication token";
    return Response.json({ error: `Unauthorized: ${errMessage}` }, { status: 401 });
  }

  if (!AuthorizationPolicy.canSubmitIssue(user)) {
    return Response.json({ error: "Forbidden: User does not have permission to submit issues" }, { status: 403 });
  }

  const reporterUid = user.uid;

  try {
    const body = (await request.json()) as {
      imageBase64?: string;
      imageUrl?: string;
      coordinates?: { latitude: number; longitude: number };
      userDescription?: string;
    };

    if (!body.coordinates || typeof body.coordinates.latitude !== "number" || typeof body.coordinates.longitude !== "number") {
      return Response.json({ error: "Invalid coordinates provided" }, { status: 400 });
    }

    const repo = new FirestoreIssueRepository(getAdminDb());
    const geoAdapter = new NominatimGeoAdapter();
    const aiAdapter = new GeminiAIAdapter({ apiKey: process.env.GEMINI_API_KEY });
    const submitService = new SubmitIssueService(geoAdapter, aiAdapter, repo);

    const submitResult = await submitService.submitIssue({
      coordinates: body.coordinates,
      imageBase64: body.imageBase64 || "data:image/jpeg;base64,mock",
      userDescription: body.userDescription,
      reporterUid,
      imageUrl: body.imageUrl,
    });

    if (submitResult.isFailure) {
      return Response.json({ error: submitResult.error.message }, { status: 400 });
    }

    const issue = submitResult.value;

    return Response.json(
      {
        ok: true,
        issueId: issue.id,
        issue,
        assignedAgencyId: issue.assignedAgencyId,
        assignedAgencyName: issue.assignedAgencyName,
        categoryKey: issue.categoryKey,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal submission error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
