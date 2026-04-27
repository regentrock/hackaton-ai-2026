// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log('========== DEBUG START ==========');
  console.log('1. Área solicitada:', area);
  
  try {
    const apiKey = process.env.GLOBAL_GIVING_API_KEY;
    console.log('2. API Key existe?', apiKey ? 'SIM' : 'NÃO');
    
    if (!apiKey) {
      console.error('ERRO: GLOBAL_GIVING_API_KEY não configurada');
      return NextResponse.json({
        success: false,
        opportunities: [],
        total: 0,
        error: 'API Key não configurada'
      }, { status: 500 });
    }
    
    // Buscar projetos
    const globalGivingUrl = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    console.log('3. URL chamada:', globalGivingUrl);
    
    const response = await fetch(globalGivingUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    console.log('4. Status da resposta:', response.status);
    
    if (!response.ok) {
      console.error('ERRO: GlobalGiving retornou status', response.status);
      return NextResponse.json({
        success: false,
        opportunities: [],
        total: 0,
        error: `GlobalGiving API error: ${response.status}`
      }, { status: response.status });
    }
    
    const data = await response.json();
    console.log('5. Dados recebidos?', !!data);
    
    const projects = data.projects?.project || [];
    console.log('6. Projetos encontrados:', projects.length);
    
    if (projects.length === 0) {
      console.log('ERRO: Nenhum projeto encontrado');
      return NextResponse.json({
        success: false,
        opportunities: [],
        total: 0,
        error: 'Nenhum projeto encontrado na GlobalGiving'
      });
    }
    
    // Mapear projetos
    const opportunities = projects.map((p: any) => ({
      title: p.title || 'Projeto sem título',
      organization: p.organization?.name || 'ONG',
      location: `${p.location?.city || 'Brasil'}, ${p.location?.country || 'BR'}`,
      description: (p.summary || p.description || '').substring(0, 300),
      theme: p.themeName || 'Voluntariado',
      projectLink: p.projectLink
    }));
    
    console.log('7. Oportunidades mapeadas:', opportunities.length);
    console.log('8. Primeira oportunidade:', opportunities[0]?.title);
    
    // Filtrar por área
    let filtered = opportunities;
    if (area) {
      const areaLower = area.toLowerCase();
      filtered = opportunities.filter((opp: any) => {
        const theme = (opp.theme || '').toLowerCase();
        const title = (opp.title || '').toLowerCase();
        return theme.includes(areaLower) || title.includes(areaLower);
      });
      console.log('9. Filtrados por área:', filtered.length);
    }
    
    // Formatar resposta
    const results = filtered.slice(0, 10).map((opp: any) => ({
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      matchScore: Math.floor(70 + Math.random() * 20),
      reasoning: `Oportunidade na área de ${opp.theme}`,
      matchedSkills: ['Comunicação', 'Trabalho em equipe'],
      theme: opp.theme,
      projectLink: opp.projectLink
    }));
    
    console.log('10. FINAL - Retornando', results.length, 'oportunidades');
    console.log('========== DEBUG END ==========');
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area: area
    });
    
  } catch (error: any) {
    console.error('ERRO FATAL:', error.message);
    console.error('Stack:', error.stack);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: error.message
    }, { status: 500 });
  }
}