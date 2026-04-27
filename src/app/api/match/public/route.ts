// app/api/match/public/route.ts - Versão final com filtro bilíngue
import { NextRequest, NextResponse } from 'next/server';

let cachedData: any = null;
let cacheTime = 0;

// Mapeamento de áreas para português e inglês
const areaMappings: Record<string, string[]> = {
  'educação': ['educação', 'education', 'ensino', 'teaching', 'escola', 'school'],
  'saúde': ['saúde', 'health', 'hospital', 'medical', 'bem-estar'],
  'meio ambiente': ['meio ambiente', 'environment', 'ecologia', 'ecology', 'sustentabilidade', 'sustainability'],
  'tecnologia': ['tecnologia', 'technology', 'tech', 'programação', 'programming'],
  'social': ['social', 'community', 'comunidade', 'assistência', 'assistance']
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log(`[API] Buscando oportunidades para: "${area}"`);
  
  try {
    let opportunities = await fetchFromGlobalGiving();
    
    if (!opportunities || opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0,
        area: area
      });
    }
    
    console.log(`[API] Total de oportunidades: ${opportunities.length}`);
    
    // Filtrar por área (usando mapeamento bilíngue)
    let filtered = opportunities;
    if (area && area.trim() !== '') {
      const areaLower = area.toLowerCase();
      const keywords = areaMappings[areaLower] || [areaLower];
      
      filtered = opportunities.filter(opp => {
        const theme = (opp.theme || '').toLowerCase();
        const title = (opp.title || '').toLowerCase();
        return keywords.some(keyword => 
          theme.includes(keyword) || title.includes(keyword)
        );
      });
      
      console.log(`[API] Filtrados ${filtered.length} de ${opportunities.length} para "${area}" usando keywords:`, keywords);
    }
    
    const results = filtered.slice(0, 10).map(opp => ({
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      matchScore: opp.matchScore || 75,
      reasoning: opp.reasoning || `Excelente oportunidade na área de ${opp.theme}`,
      matchedSkills: ['Comunicação', 'Trabalho em equipe', 'Comprometimento'],
      theme: opp.theme,
      projectLink: opp.projectLink
    }));
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area: area,
      source: 'globalgiving'
    });
    
  } catch (error: any) {
    console.error('[API] Erro:', error);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: error.message
    }, { status: 500 });
  }
}

async function fetchFromGlobalGiving(): Promise<any[]> {
  const now = Date.now();
  if (cachedData && (now - cacheTime) < 5 * 60 * 1000) {
    console.log('[Cache] Usando dados em cache');
    return cachedData;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) {
    console.error('[Erro] API Key não configurada');
    return [];
  }
  
  try {
    console.log('[GlobalGiving] Buscando projetos...');
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=1&per_page=20`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    
    if (!response.ok) {
      console.error(`[GlobalGiving] HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const projects = data?.projects?.project;
    
    if (!projects || !Array.isArray(projects)) {
      console.error('[GlobalGiving] Estrutura inesperada');
      return [];
    }
    
    console.log(`[GlobalGiving] ${projects.length} projetos encontrados`);
    
    const mapped = projects.map((p: any) => ({
      id: p.id,
      title: p.title || 'Projeto de Voluntariado',
      organization: p.organization?.name || 'Organização Parceira',
      location: p.location?.city ? `${p.location.city}, ${p.location.country || 'BR'}` : 'Brasil',
      description: (p.summary || p.description || '').substring(0, 300),
      theme: p.themeName || 'Voluntariado',
      projectLink: p.projectLink || '#',
      matchScore: 75,
      reasoning: `Oportunidade em ${p.themeName || 'voluntariado'} - excelente para seu perfil!`
    }));
    
    cachedData = mapped;
    cacheTime = now;
    
    return mapped;
    
  } catch (error: any) {
    console.error('[GlobalGiving] Erro:', error.message);
    return [];
  }
}