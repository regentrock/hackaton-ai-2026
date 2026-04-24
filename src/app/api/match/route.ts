import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(request: NextRequest) {
  try {
    // =========================
    // 0. pegar token (cookies OU header)
    // =========================
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - Token não fornecido' },
        { status: 401 }
      );
    }

    // =========================
    // 1. Validar token e buscar usuário
    // =========================
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Unauthorized - Token inválido' },
        { status: 401 }
      );
    }

    // Buscar usuário pelo ID do token
    const userRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hackaton-ai-2026.vercel.app'}/api/user-profile`,
      {
        headers: {
          'Cookie': `auth_token=${token}`, // Passar o token via cookie
          'Authorization': `Bearer ${token}`, // Também tentar via header
        },
      }
    );

    const userData = await userRes.json();

    if (!userRes.ok || userData.error) {
      console.error('Erro ao buscar usuário:', userData);
      return NextResponse.json(
        { error: "Failed to fetch user", details: userData },
        { status: 500 }
      );
    }

    const user = userData.user;

    if (!user || !user.location) {
      return NextResponse.json(
        { error: "Localização do usuário não encontrada" },
        { status: 400 }
      );
    }

    // =========================
    // 2. Buscar oportunidades (API real)
    // =========================
    const oppRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hackaton-ai-2026.vercel.app'}/api/opportunities?city=${encodeURIComponent(user.location)}`
    );

    const oppData = await oppRes.json();

    if (!oppData || !oppData.opportunities) {
      return NextResponse.json(
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
      console.error('Erro IAM:', iamData);
      return NextResponse.json(
        { error: "Failed to generate IAM token", details: iamData },
        { status: 500 }
      );
    }

    const accessToken = iamData.access_token;

    // =========================
    // 4. Prompt simplificado
    // =========================
    const prompt = `
You are an AI that matches volunteers with opportunities.

User:
Name: ${user.name}
Skills: ${user.skills.join(', ')}
Location: ${user.location}

Opportunities:
${JSON.stringify(oppData.opportunities, null, 2)}

Rules:
- Match based on skills first (prioritize exact or similar skills)
- Then consider location proximity
- Return maximum 3 results
- Each result must include: title, organization, location, and reason for match

CRITICAL:
- Return ONLY valid JSON array
- DO NOT return markdown code blocks
- DO NOT explain anything
- DO NOT include text before or after
- Output MUST start with [ and end with ]

Example response format:
[
  {
    "title": "Example Opportunity",
    "organization": "NGO Name",
    "location": "City Name",
    "reason": "Match because of similar skills in teaching"
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
          model_id: "ibm/granite-3-8b-instruct",
          project_id: process.env.IBM_PROJECT_ID,
          parameters: {
            decoding_method: "greedy",
            max_new_tokens: 500,
            temperature: 0.3,
          },
        }),
      }
    );

    const data = await watsonRes.json();

    if (!data.results || !data.results[0]) {
      console.error('WatsonX erro:', data);
      return NextResponse.json(
        { error: "Invalid AI response", details: data },
        { status: 500 }
      );
    }

    let text = data.results[0].generated_text;

    // =========================
    // 6. Limpar e parsear resposta
    // =========================
    // Remover markdown code blocks se existirem
    text = text.replace(/```json\n?/g, '');
    text = text.replace(/```\n?/g, '');
    
    // Encontrar array JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.error("AI RAW RESPONSE:", text);
      return NextResponse.json(
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
      console.error("JSON PARSE ERROR:", err, "Raw:", jsonMatch[0]);
      return NextResponse.json(
        {
          error: "Failed to parse AI response",
          raw: text,
        },
        { status: 500 }
      );
    }

    // =========================
    // 7. Retorno
    // =========================
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("MATCH ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}