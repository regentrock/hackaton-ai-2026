import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Gerar token IAM da IBM
    const iamResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`
    });

    const iamData = await iamResponse.json();
    const iamToken = iamData.access_token;

    if (!iamToken) {
      return NextResponse.json({ error: 'Failed to get IAM token' }, { status: 500 });
    }

    // Configuração do Orchestrate com o token IAM
    return NextResponse.json({
      orchestrationID: "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b",
      agentId: "ae187a51-172a-4288-b5fe-fefae23ab71f",
      token: iamToken
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}