// src/app/api/match/route.ts

export async function GET() {
  try {
    // =========================
    // 1. Buscar usuário
    // =========================
    const userRes = await fetch(
      "https://hackaton-ai-2026.vercel.app/api/user-profile"
    );
    const user = await userRes.json();

    console.log("USER:", user);

    // =========================
    // 2. Buscar oportunidades
    // =========================
    const oppRes = await fetch(
      "https://hackaton-ai-2026.vercel.app/api/opportunities"
    );
    const oppData = await oppRes.json();

    console.log("OPPORTUNITIES:", oppData);

    // =========================
    // 3. Gerar IAM TOKEN
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
    console.log("IAM RESPONSE:", iamData);

    if (!iamData.access_token) {
      return Response.json(
        { error: "Failed to generate IAM token", details: iamData },
        { status: 500 }
      );
    }

    const accessToken = iamData.access_token;

    // =========================
    // 4. Prompt
    // =========================
    const prompt = `
You are an AI that matches volunteers with opportunities.

User:
${JSON.stringify(user)}

Opportunities:
${JSON.stringify(oppData.opportunities)}

Return ONLY valid JSON (no text before or after):
[
  {
    "title": "...",
    "location": "...",
    "reason": "..."
  }
]
`;

    // =========================
    // 5. Chamar WatsonX
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
          model_id: "ibm/granite-13b-instruct-v2",
          project_id: process.env.IBM_PROJECT_ID,
          parameters: {
            decoding_method: "greedy",
            max_new_tokens: 300,
          },
        }),
      }
    );

    const watsonData = await watsonRes.json();
    console.log("WATSON RESPONSE:", watsonData);

    if (!watsonData.results || !watsonData.results[0]) {
      return Response.json(
        { error: "Invalid AI response", details: watsonData },
        { status: 500 }
      );
    }

    const text = watsonData.results[0].generated_text;

    // =========================
    // 6. Retornar JSON
    // =========================
    return new Response(text, {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("FULL ERROR:", error);

    return Response.json(
      { error: error.message || "unknown error" },
      { status: 500 }
    );
  }
}