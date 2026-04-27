// app/api/match/public/route.ts - VERSÃO ATUALIZADA
import { NextRequest, NextResponse } from 'next/server';

type Priority = 'high' | 'medium' | 'low';

interface MatchResult {
  id: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  skills: string[];
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
  recommendation: string;
  priority: Priority;
  theme?: string;
  projectLink?: string;
}

// Cache para projetos
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API PÚBLICA ==========');
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const offset = (page - 1) * limit;
  const area = url.searchParams.get('area') || '';
  
  console.log(`📋 Parâmetros: area="${area}", page=${page}, limit=${limit}`);
  
  try {
    // Buscar oportunidades
    let allOpportunities = await fetchOpportunitiesWithCache();
    
    if (allOpportunities.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0,
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }
    
    console.log(`📦 Total de ${allOpportunities.length} oportunidades carregadas`);
    
    // Criar um perfil de usuário padrão
    const defaultUser = {
      id: 'public',
      name: 'Visitante',
      skills: ['Comunicação', 'Trabalho em equipe', 'Proatividade'],
      location: 'Brasil',
      description: 'Interessado em voluntariado'
    };
    
    // Calcular matches
    let allMatches = calculateLocalMatches(defaultUser, allOpportunities);
    
    // Filtrar por área se especificada
    if (area) {
      const areaLower = area.toLowerCase();
      allMatches = allMatches.filter(match => {
        const title = (match.title || '').toLowerCase();
        const theme = (match.theme || '').toLowerCase();
        return title.includes(areaLower) || theme.includes(areaLower);
      });
      console.log(`✅ Encontrados ${allMatches.length} matches para área "${area}"`);
    }
    
    // Ordenar por score
    allMatches.sort((a, b) => b.matchScore - a.matchScore);
    
    // Paginar
    const paginatedMatches = allMatches.slice(offset, offset + limit);
    
    // 🔥 FORMATO SIMPLIFICADO PARA O ORCHESTRATE 🔥
    const formattedOpportunities = paginatedMatches.map(match => ({
      title: match.title,
      organization: match.organization,
      location: match.location,
      matchScore: match.matchScore,
      reasoning: match.reasoning,
      recommendation: match.recommendation,
      matchedSkills: match.matchedSkills
    }));
    
    console.log(`\n📊 RESULTADOS:`);
    console.log(`   🎯 Mostrando ${formattedOpportunities.length} de ${allMatches.length} matches`);
    
    // Retornar no formato que o prompt espera
    return NextResponse.json({
      success: true,
      opportunities: formattedOpportunities,
      total: allMatches.length,
      message: formattedOpportunities.length > 0 
        ? `Encontradas ${allMatches.length} oportunidades` 
        : `Nenhuma oportunidade encontrada para ${area}`
    });
    
  } catch (error: any) {
    console.error('❌ ERRO NA API PÚBLICA:', error);
    return NextResponse.json(
      { 
        success: false, 
        opportunities: [], 
        total: 0,
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    );
  }
}

function calculateLocalMatches(user: any, opportunities: any[]): MatchResult[] {
  const results: MatchResult[] = [];
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  
  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
    
    let baseScore = 65;
    let matchedSkills: string[] = [];
    let matchCount = 0;
    
    for (const skill of userSkills) {
      if (oppText.includes(skill)) {
        baseScore += 10;
        matchedSkills.push(skill);
        matchCount++;
      }
    }
    
    if (matchCount >= 2) baseScore += 10;
    if (matchCount >= 3) baseScore += 15;
    
    let finalScore = baseScore + (i % 20) - 10;
    finalScore = Math.min(95, Math.max(45, finalScore));
    
    let priority: Priority = finalScore >= 70 ? 'high' : finalScore >= 55 ? 'medium' : 'low';
    
    let reasoning = '';
    let recommendation = '';
    
    if (finalScore >= 80) {
      reasoning = `Excelente compatibilidade! Esta oportunidade em ${opp.theme || 'voluntariado'} é muito adequada ao seu perfil.`;
      recommendation = `Recomendação forte: Candidate-se agora!`;
    } else if (finalScore >= 65) {
      reasoning = `Ótima compatibilidade! Você pode contribuir significativamente para este projeto.`;
      recommendation = `Recomendação: Considere se candidatar.`;
    } else {
      reasoning = `Boa oportunidade para desenvolver habilidades na área de ${opp.theme || 'voluntariado'}.`;
      recommendation = `Recomendação: Explore esta oportunidade.`;
    }
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: [],
      matchScore: Math.floor(finalScore),
      matchedSkills: matchedSkills.slice(0, 3),
      missingSkills: [],
      reasoning: reasoning,
      recommendation: recommendation,
      priority: priority,
      theme: opp.theme,
      projectLink: opp.projectLink
    });
  }
  
  return results;
}

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