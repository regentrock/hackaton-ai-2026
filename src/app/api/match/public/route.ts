import { NextRequest, NextResponse } from 'next/server';

// Cache para projetos (10 minutos)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  const limit = parseInt(url.searchParams.get('limit') || '10');
  
  console.log(`🔍 API Pública chamada - Área: "${area}"`);
  
  try {
    // Buscar oportunidades
    let opportunities = await fetchOpportunities();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0,
        message: 'Nenhuma oportunidade encontrada'
      });
    }
    
    // Calcular scores para cada oportunidade
    let scoredOpportunities = opportunities.map(opp => ({
      ...opp,
      matchScore: calculateMatchScore(opp, area),
      reasoning: generateReasoning(opp, area),
      matchedSkills: ['Comunicação', 'Trabalho em equipe', 'Proatividade']
    }));
    
    // Ordenar por score (maior primeiro)
    scoredOpportunities.sort((a, b) => b.matchScore - a.matchScore);
    
    // Filtrar por área se necessário
    let filteredOpportunities = scoredOpportunities;
    if (area) {
      const areaLower = area.toLowerCase();
      filteredOpportunities = scoredOpportunities.filter(opp => 
        opp.theme?.toLowerCase().includes(areaLower) ||
        opp.title?.toLowerCase().includes(areaLower) ||
        opp.description?.toLowerCase().includes(areaLower)
      );
    }
    
    const results = filteredOpportunities.slice(0, limit);
    
    console.log(`✅ Retornando ${results.length} oportunidades para área "${area}"`);
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area_solicitada: area
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Erro interno'
    }, { status: 500 });
  }
}

async function fetchOpportunities() {
  const now = Date.now();
  
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Usando cache');
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) return getFallbackOpportunities();
  
  try {
    const allProjects: any[] = [];
    
    for (let page = 1; page <= 3; page++) {
      const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=${page}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) break;
      const data = await response.json();
      const projects = data.projects?.project || [];
      if (projects.length === 0) break;
      allProjects.push(...projects);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    cachedProjects = allProjects.map(p => ({
      id: p.id,
      title: p.title || 'Projeto de Voluntariado',
      organization: p.organization?.name || 'ONG Parceira',
      location: `${p.location?.city || 'Brasil'}, ${p.location?.country || 'BR'}`,
      description: (p.summary || p.description || '').substring(0, 500),
      theme: p.themeName || 'Voluntariado',
      projectLink: p.projectLink
    }));
    
    cacheTimestamp = now;
    return cachedProjects;
    
  } catch (error) {
    console.error('Erro na API GlobalGiving:', error);
    return getFallbackOpportunities();
  }
}

function getFallbackOpportunities() {
  return [
    {
      id: "1",
      title: "Educação Infantil - Apoio Escolar",
      organization: "Instituto Aprender",
      location: "São Paulo, SP",
      description: "Apoio escolar para crianças em vulnerabilidade social",
      theme: "Educação",
      projectLink: "/matches/1"
    },
    {
      id: "2",
      title: "Saúde Comunitária - Atendimento",
      organization: "Saúde para Todos",
      location: "Rio de Janeiro, RJ",
      description: "Atendimento básico em comunidades carentes",
      theme: "Saúde",
      projectLink: "/matches/2"
    },
    {
      id: "3",
      title: "Meio Ambiente - Reflorestamento",
      organization: "Verde Vida",
      location: "Belo Horizonte, MG",
      description: "Plantio de árvores em áreas degradadas",
      theme: "Meio Ambiente",
      projectLink: "/matches/3"
    },
    {
      id: "4",
      title: "Tecnologia para Jovens",
      organization: "Tech Social",
      location: "Remoto",
      description: "Ensino de programação para jovens",
      theme: "Tecnologia",
      projectLink: "/matches/4"
    },
    {
      id: "5",
      title: "Assistência Social - Famílias",
      organization: "Acolher",
      location: "Salvador, BA",
      description: "Acompanhamento de famílias em situação de risco",
      theme: "Social",
      projectLink: "/matches/5"
    }
  ];
}

function calculateMatchScore(opportunity: any, area: string): number {
  if (!area) return 70;
  
  const areaLower = area.toLowerCase();
  const theme = (opportunity.theme || '').toLowerCase();
  const title = (opportunity.title || '').toLowerCase();
  
  if (theme.includes(areaLower) || title.includes(areaLower)) {
    return 85 + Math.floor(Math.random() * 10);
  }
  return 60 + Math.floor(Math.random() * 15);
}

function generateReasoning(opportunity: any, area: string): string {
  if (area) {
    return `Excelente oportunidade na área de ${area}! Seu perfil se alinha muito bem com as necessidades deste projeto.`;
  }
  return `Ótima oportunidade para fazer a diferença! Esta vaga combina com seu perfil.`;
}