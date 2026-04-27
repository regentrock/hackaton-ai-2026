// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Cache para projetos (igual ao seu route.ts original)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log(`🔍 API Pública chamada para área: "${area}"`);
  
  try {
    // REUTILIZAR A MESMA FUNÇÃO QUE JÁ FUNCIONA
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      console.log('⚠️ Nenhuma oportunidade encontrada');
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0,
        area: area
      });
    }
    
    console.log(`📦 Total de oportunidades: ${opportunities.length}`);
    
    // Filtrar por área se especificada
    let filteredOpportunities = opportunities;
    if (area && area !== '') {
      const areaLower = area.toLowerCase();
      filteredOpportunities = opportunities.filter(opp => {
        const theme = (opp.theme || '').toLowerCase();
        const title = (opp.title || '').toLowerCase();
        return theme.includes(areaLower) || title.includes(areaLower);
      });
      console.log(`🎯 Filtrados ${filteredOpportunities.length} para "${area}"`);
    }
    
    // Formatar resposta
    const results = filteredOpportunities.slice(0, 10).map(opp => ({
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      matchScore: 75,
      reasoning: `Excelente oportunidade na área de ${opp.theme || 'voluntariado'}`,
      matchedSkills: ['Comunicação', 'Trabalho em equipe'],
      theme: opp.theme,
      projectLink: opp.projectLink
    }));
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area: area
    });
    
  } catch (error: any) {
    console.error('❌ Erro:', error);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: error.message
    }, { status: 500 });
  }
}

// COPIADA DIRETAMENTE DO SEU /api/match/route.ts
async function fetchOpportunitiesWithCache(): Promise<any[]> {
  const now = Date.now();
  
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Usando cache de projetos');
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GLOBAL_GIVING_API_KEY não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    console.log('🌍 Buscando oportunidades da GlobalGiving...');
    
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=${page}`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) break;

      const data = await response.json();
      const projects = data.projects?.project || [];
      
      if (projects.length === 0) break;
      
      allProjects.push(...projects);
      console.log(`📄 Página ${page}: +${projects.length} projetos`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    cachedProjects = allProjects.slice(0, 200).map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 800),
      theme: project.themeName || 'Voluntariado',
      projectLink: project.projectLink
    }));
    
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}