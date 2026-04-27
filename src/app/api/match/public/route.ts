// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Cache para não sobrecarregar a API da GlobalGiving
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log(`🔍 API Pública chamada para área: "${area}"`);
  
  try {
    // Buscar dados REAIS da GlobalGiving
    let opportunities = await fetchRealOpportunities();
    
    if (!opportunities || opportunities.length === 0) {
      console.log('❌ Nenhuma oportunidade encontrada na GlobalGiving');
      return NextResponse.json({
        success: false,
        opportunities: [],
        total: 0,
        error: 'Nenhuma oportunidade disponível no momento'
      });
    }
    
    console.log(`📦 Total de oportunidades REAIS carregadas: ${opportunities.length}`);
    
    // Filtrar por área se especificada
    let filteredOpportunities = opportunities;
    if (area && area !== '') {
      const areaLower = area.toLowerCase();
      filteredOpportunities = opportunities.filter(opp => {
        const theme = (opp.theme || '').toLowerCase();
        const title = (opp.title || '').toLowerCase();
        const description = (opp.description || '').toLowerCase();
        
        return theme.includes(areaLower) || 
               title.includes(areaLower) || 
               description.includes(areaLower);
      });
      console.log(`🎯 Filtrados: ${filteredOpportunities.length} oportunidades para área "${area}"`);
    }
    
    // Calcular scores e adicionar matchedSkills
    const results = filteredOpportunities.slice(0, 10).map(opp => ({
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      matchScore: calculateRealScore(opp, area),
      reasoning: generateRealReasoning(opp, area),
      matchedSkills: extractMatchedSkills(opp, area),
      theme: opp.theme,
      projectLink: opp.projectLink
    }));
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area_solicitada: area,
      source: 'GlobalGiving'
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Erro ao buscar oportunidades'
    }, { status: 500 });
  }
}

async function fetchRealOpportunities(): Promise<any[]> {
  const now = Date.now();
  
  // Usar cache se disponível
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Usando cache de projetos reais');
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GLOBAL_GIVING_API_KEY não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    console.log('🌍 Buscando oportunidades REAIS da GlobalGiving...');
    
    // Buscar até 5 páginas de projetos
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=${page}`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        console.log(`⚠️ Página ${page}: erro ${response.status}`);
        break;
      }

      const data = await response.json();
      const projects = data.projects?.project || [];
      
      if (projects.length === 0) break;
      
      allProjects.push(...projects);
      console.log(`📄 Página ${page}: +${projects.length} projetos reais`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos REAIS carregados`);
    
    // Mapear para o formato esperado
    const mappedProjects = allProjects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 500),
      theme: project.themeName || 'Voluntariado',
      projectLink: project.projectLink
    }));
    
    // Remover duplicatas por ID
    const uniqueProjects = [];
    const seenIds = new Set();
    for (const project of mappedProjects) {
      if (!seenIds.has(project.id)) {
        seenIds.add(project.id);
        uniqueProjects.push(project);
      }
    }
    
    cachedProjects = uniqueProjects;
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades reais:', error);
    return [];
  }
}

function calculateRealScore(opportunity: any, area: string): number {
  let baseScore = 65;
  
  if (area && area !== '') {
    const areaLower = area.toLowerCase();
    const theme = (opportunity.theme || '').toLowerCase();
    const title = (opportunity.title || '').toLowerCase();
    
    if (theme.includes(areaLower) || title.includes(areaLower)) {
      baseScore += 20;
    }
  }
  
  // Adicionar pequena variação baseada no ID
  const idHash = (opportunity.id || 0) % 15;
  let finalScore = baseScore + idHash;
  
  return Math.min(95, Math.max(55, finalScore));
}

function generateRealReasoning(opportunity: any, area: string): string {
  if (area && area !== '') {
    const areaLower = area.toLowerCase();
    const theme = (opportunity.theme || '').toLowerCase();
    
    if (theme.includes(areaLower)) {
      return `Excelente oportunidade! Este projeto na área de ${opportunity.theme} está perfeitamente alinhado com seu interesse em ${area}.`;
    }
  }
  
  return `Ótima oportunidade de voluntariado em ${opportunity.theme || 'causa social'}. Sua contribuição pode fazer a diferença!`;
}

function extractMatchedSkills(opportunity: any, area: string): string[] {
  const skills = ['Comunicação', 'Trabalho em equipe', 'Comprometimento'];
  
  const theme = (opportunity.theme || '').toLowerCase();
  
  if (theme.includes('educ') || theme.includes('ensino')) {
    skills.push('Didática', 'Paciência');
  } else if (theme.includes('saúde') || theme.includes('health')) {
    skills.push('Empatia', 'Atendimento');
  } else if (theme.includes('ambient') || theme.includes('ecologia')) {
    skills.push('Conscientização', 'Organização');
  } else if (theme.includes('tecnologia') || theme.includes('tech')) {
    skills.push('Resolução de problemas', 'Aprendizado rápido');
  } else if (theme.includes('social') || theme.includes('comunidade')) {
    skills.push('Escuta ativa', 'Empatia');
  }
  
  return skills.slice(0, 4);
}