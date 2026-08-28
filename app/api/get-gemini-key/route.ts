export const maxDuration = 10;

export async function GET() {
  const isConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  return Response.json({
    configured: isConfigured,
    proxy: "/api/analyze-proxy",
  });
}
