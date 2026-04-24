export async function GET() {
  try {
    // =========================
    // 1. Buscar usuário
    // =========================
    const userRes = await fetch(
      "https://hackaton-ai-2026.vercel.app/api/user-profile"
    );
    const user = await userRes.json();

    // =========================
    // 2. Buscar oportunidades
    // =========================
    const oppRes = await fetch(
    `https://hackaton-ai-2026.vercel.app/api/opportunities?city=${user.location}`
    );
    const oppData = await oppRes.json();

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
      return Response.json({ error: iamData }, { status: 500 });
    }

    const accessToken = iamData.access_token;

    // =========================
    // 4. Prompt (melhorado)
    // =========================
    const prompt = `
You are an AI that matches volunteers with opportunities.

User:
${JSON.stringify(user)}

Opportunities:
${JSON.stringify(oppData.opportunities)}

Rules:
- Match based on skills first
- Then consider location proximity
- Return ONLY valid JSON
- Max 5 results

Format:
[
  {
    "title": "...",
    "location": "...",
    "reason": "..."
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
          model_id: "ibm/granite-8b-code-instruct",
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

    return new Response(text, {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(error);

    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

console.log("API KEY:", process.env.IBM_API_KEY);