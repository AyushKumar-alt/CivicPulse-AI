export const maxDuration = 10;

export async function GET() {
  const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
  if (!key) {
    return Response.json({ error: "Gemini API key is not configured" }, { status: 500 });
  }
  return Response.json({ key });
}
