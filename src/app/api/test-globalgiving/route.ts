import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ 
      error: 'API key not configured',
      hasKey: false 
    }, { status: 500 });
  }

  const results: any = {
    apiKeyPresent: true,
    apiKeyPreview: `${apiKey.substring(0, 8)}...`,
    tests: []
  };

  // Teste 1: Buscar projetos ativos no Brasil
  // Conforme documentação: /api/public/projectservice/countries/{iso}/projects/active [citation:1]
  try {
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    console.log('Testing URL:', url.replace(apiKey, 'HIDDEN'));
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();
    
    results.tests.push({
      endpoint: '/countries/BR/projects/active',
      status: response.status,
      ok: response.ok,
      projectsFound: data.projects?.project?.length || 0,
      hasNext: data.projects?.hasNext || false
    });

    if (data.projects?.project?.length > 0) {
      results.sampleProject = {
        id: data.projects.project[0].id,
        title: data.projects.project[0].title,
        organization: data.projects.project[0].organization?.name
      };
    }
  } catch (error: any) {
    results.tests.push({
      endpoint: '/countries/BR/projects/active',
      error: error.message
    });
  }

  return NextResponse.json(results);
}