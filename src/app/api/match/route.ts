export async function GET(req: Request) {
  try {
    // =========================
    // 0. pegar token do usuário
    // =========================
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // =========================
    // 1. Buscar usuário (COM TOKEN)
    // =========================
    const userRes = await fetch(
      "https://hackaton-ai-2026.vercel.app/api/user-profile",
      {
        headers: {
          Authorization: authHeader,
        },
      }
    );

    const user = await userRes.json();

    if (!user || user.error) {
      return Response.json(
        { error: "Failed to fetch user", details: user },
        { status: 500 }
      );
    }

    // =========================
    // 2. Buscar oportunidades (API real)
    // =========================
    const oppRes = await fetch(
      `https://hackaton-ai-2026.vercel.app/api/opportunities?city=${encodeURIComponent(user.location)}`
    );

    const oppData = await oppRes.json();

    if (!oppData || !oppData.opportunities) {
      return Response.json(
        { error: "Failed to fetch opportunities" },
        { status: 500 }
      );
    }

    // =========================
    // 3. Gerar IAM token
    // =========================
    const iamRes = await fetch(
      "https://iam.cloud.ibm.com/identity/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
      }
    );

    const iamData = await iamRes.json();

    if (!iamData.access_token) {
      return Response.json(
        { error: "Failed to generate IAM token", details: iamData },
        { status: 500 }
      );
    }

    const accessToken = iamData.access_token;

    // =========================
    // 4. Prompt (FORÇADO PRA JSON)
    // =========================
    const prompt = `
You are an AI that matches volunteers with opportunities.

User:
${JSON.stringify(user)}

Opportunities:
${JSON.stringify(oppData.opportunities)}

Rules:
- Match based on skills first
- Then location proximity
- Maximum 5 results

CRITICAL:
- Return ONLY valid JSON
- DO NOT return code
- DO NOT explain anything
- DO NOT include text before or after
- Output MUST start with [ and end with ]

Example:
[
  {
    "title": "Example",
    "location": "City",
    "reason": "Explanation"
  }
]
`;

    // =========================
    // 5. WatsonX
    // =========================
    const watsonRes = await fetch(
      `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: prompt,
          model_id: "ibm/granite-3-8b-instruct",
          project_id: process.env.IBM_PROJECT_ID,
          parameters: {
            decoding_method: "greedy",
            max_new_tokens: 300,
            temperature: 0.3,
          },
        }),
      }
    );

    const data = await watsonRes.json();

    if (!data.results || !data.results[0]) {
      return Response.json(
        { error: "Invalid AI response", details: data },
        { status: 500 }
      );
    }

    const text = data.results[0].generated_text;

    // =========================
    // 6. SANITIZAR RESPOSTA DA IA (CRÍTICO)
    // =========================
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.error("AI RAW RESPONSE:", text);

      return Response.json(
        {
          error: "AI did not return valid JSON",
          raw: text,
        },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("JSON PARSE ERROR:", err);

      return Response.json(
        {
          error: "Failed to parse AI response",
          raw: text,
        },
        { status: 500 }
      );
    }

    // =========================
    // 7. RETORNO LIMPO
    // =========================
    return Response.json(parsed);

  } catch (error: any) {
    console.error("MATCH ERROR:", error);

    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}