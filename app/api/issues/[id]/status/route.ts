import { NextRequest } from "next/server";

export async function PATCH(_request: NextRequest) {
  return Response.json(
    {
      error:
        "Deprecated endpoint: Direct status PATCH is not a canonical LifecycleService operation. Use dedicated canonical lifecycle endpoints (/api/issues/[id]/acknowledge, /api/issues/[id]/assign, /api/issues/[id]/start-work, etc.).",
    },
    { status: 400 }
  );
}
