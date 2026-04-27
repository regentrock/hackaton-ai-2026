// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

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

// Cache para projetos (mesmo do original)
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
  
  try {
    // Para API pública, usar um perfil de exemplo ou permitir busca sem autenticação
    // Opção 1: Usar um usuário de demonstração
    const { prisma } = await import('@/src/lib/prisma');
    
    // Buscar um usuário de exemplo (ou o primeiro usuário do banco)
    let demoUser = await prisma.volunteer.findFirst({
      select: {
        id: true,
        name: true,
        email: true,
        location: true,
        skills: true,
        description: true,
        availability: true,
        createdAt: true
      }
    });
    
    // Se não tiver usuário, criar um perfil padrão
    if (!demoUser) {
      demoUser = {
        id: 'public',
        name: 'Visitante',
        email: 'visitante@exemplo.com',
        location: 'Brasil',
        skills: ['Voluntariado', 'Comunicação'],
        description: 'Interessado em oportunidades de voluntariado',
        availability: 'Flexível',
        createdAt: new Date()
      };
    }
    
    console.log('👤 Perfil público usado:', demoUser.name);
    console.log('🎯 Skills:', demoUser.skills);
    
    // Buscar oportunidades (mesma lógica do original)
    let allOpportunities = await fetchOpportunitiesWithCache();
    
    if (allOpportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        page: 1,
        hasMore: false,
        message: 'Nenhuma oportunidade encontrada.'
      });
    }
    
    console.log(`📦 Total de ${allOpportunities.length} oportunidades`);
    
    // Calcular matches (usando a mesma lógica)
    let allMatches = calculateLocalMatches(demoUser, allOpportunities);
    
    // Filtrar por área se especificada
    if (area) {
      const areaLower = area.toLowerCase();
      allMatches = allMatches.filter(match => 
        match.theme?.toLowerCase().includes(areaLower) ||
        match.title?.toLowerCase().includes(areaLower)
      );
      console.log(`🎯 Filtrados ${allMatches.length} matches para área "${area}"`);
    }
    
    // Remover duplicatas e ordenar
    const uniqueMatches = removeDuplicateMatches(allMatches);
    uniqueMatches.sort((a, b) => b.matchScore - a.matchScore);
    
    // Paginar resultados
    const paginatedMatches = uniqueMatches.slice(offset, offset + limit);
    const hasMore = offset + limit < uniqueMatches.length;
    const totalPages = Math.ceil(uniqueMatches.length / limit);
    
    console.log(`\n📊 RESULTADOS:`);
    console.log(`   📄 Página ${page} de ${totalPages}`);
    console.log(`   🎯 Mostrando ${paginatedMatches.length} de ${uniqueMatches.length} matches`);
    
    return NextResponse.json({
      success: true,
      matches: paginatedMatches,
      total: uniqueMatches.length,
      page: page,
      totalPages: totalPages,
      hasMore: hasMore,
      limit: limit,
      executionTimeMs: Date.now() - startTime,
      usingAI: false,
      stats: {
        highMatches: uniqueMatches.filter(m => m.matchScore >= 75).length,
        mediumMatches: uniqueMatches.filter(m => m.matchScore >= 60 && m.matchScore < 75).length,
        lowMatches: uniqueMatches.filter(m => m.matchScore < 60).length,
        averageScore: Math.round(uniqueMatches.reduce((acc, m) => acc + m.matchScore, 0) / uniqueMatches.length)
      }
    });
    
  } catch (error: any) {
    console.error('❌ ERRO NA API PÚBLICA:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function removeDuplicateMatches(matches: MatchResult[]): MatchResult[] {
  const seen = new Map();
  for (const match of matches) {
    if (!seen.has(match.id)) {
      seen.set(match.id, match);
    }
  }
  return Array.from(seen.values());
}

function calculateLocalMatches(user: any, opportunities: any[]): MatchResult[] {
  const results: MatchResult[] = [];
  
  for (let i = 0; i < opportunities.length; i++) {
    results.push(calculateSingleMatch(user, opportunities[i], i));
  }
  
  return results;
}

function calculateSingleMatch(user: any, opp: any, index: number): MatchResult {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  
  let baseScore = 70;
  let matchedSkills: string[] = [];
  let matchCount = 0;
  
  for (const skill of userSkills) {
    if (oppText.includes(skill)) {
      baseScore += 12;
      matchedSkills.push(skill);
      matchCount++;
    }
  }
  
  if (matchCount >= 2) baseScore += 15;
  if (matchCount >= 3) baseScore += 20;
  
  let finalScore = baseScore + (index % 15) - 5;
  finalScore = Math.min(95, Math.max(55, finalScore));
  
  let priority: Priority = finalScore >= 75 ? 'high' : finalScore >= 60 ? 'medium' : 'low';
  
  let reasoning = '';
  let recommendation = '';
  
  if (finalScore >= 85) {
    reasoning = `Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são altamente relevantes para este projeto.`;
    recommendation = `Recomendação forte: Candidate-se imediatamente!`;
  } else if (finalScore >= 75) {
    reasoning = `Ótima compatibilidade! Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} será muito útil para este projeto.`;
    recommendation = `Recomendação: Considere se candidatar.`;
  } else if (finalScore >= 65) {
    reasoning = `Compatibilidade positiva! Este projeto pode se beneficiar da sua experiência.`;
    recommendation = `Recomendação: Vale a pena explorar esta oportunidade.`;
  } else {
    reasoning = `Oportunidade interessante para desenvolver novas habilidades.`;
    recommendation = `Recomendação: Excelente oportunidade para crescimento.`;
  }
  
  return {
    id: opp.id,
    title: opp.title,
    organization: opp.organization,
    location: opp.location,
    description: opp.description?.substring(0, 300),
    skills: [],
    matchScore: Math.floor(finalScore),
    matchedSkills: matchedSkills.slice(0, 4),
    missingSkills: [],
    reasoning: reasoning,
    recommendation: recommendation,
    priority: priority,
    theme: opp.theme,
    projectLink: opp.projectLink
  };
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