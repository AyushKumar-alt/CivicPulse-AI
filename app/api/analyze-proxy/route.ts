export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { prompt, imageBase64, mimeType } = (await request.json()) as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
    };

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Gemini API key missing on server" }, { status: 500 });
    }

    const parts: Record<string, unknown>[] = [];
    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: imageBase64,
        },
      });
    }
    parts.push({ text: prompt });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return Response.json(
        { error: `Gemini HTTP ${response.status}: ${errText.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
