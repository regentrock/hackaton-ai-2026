import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  const results: any = {
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : null,
    tests: []
  };

  // Teste 1: Verificar se a API Key existe
  if (!apiKey) {
    results.error = 'GLOBAL_GIVING_API_KEY not configured';
    return NextResponse.json(results, { status: 500 });
  }

  // Teste 2: Tentar endpoint de projetos no Brasil
  try {
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects?api_key=${apiKey}`;
    console.log('Testing URL:', url.replace(apiKey, 'HIDDEN'));
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    results.tests.push({
      endpoint: '/countries/BR/projects',
      status: response.status,
      ok: response.ok
    });

    if (response.ok) {
      const data = await response.json();
      results.projectsCount = data.projects?.project?.length || 0;
      results.sampleProject = data.projects?.project?.[0] || null;
    } else {
      const text = await response.text();
      results.errorResponse = text.substring(0, 500);
    }
  } catch (error: any) {
    results.tests.push({
      endpoint: '/countries/BR/projects',
      error: error.message
    });
  }

  // Teste 3: Tentar endpoint de organizações
  try {
    const url = `https://api.globalgiving.org/v2/atlas/organizations/BR?api_key=${apiKey}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    results.tests.push({
      endpoint: '/v2/atlas/organizations/BR',
      status: response.status,
      ok: response.ok
    });
  } catch (error: any) {
    results.tests.push({
      endpoint: '/v2/atlas/organizations/BR',
      error: error.message
    });
  }

  return NextResponse.json(results);
}