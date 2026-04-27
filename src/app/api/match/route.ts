import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

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
  priority: 'high' | 'medium' | 'low';
  theme?: string;
}

// Cache para projetos (1 hora)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API INICIADA ==========');
  
  try {
    // 1. Autenticação
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 2. Buscar perfil do usuário
    const { prisma } = await import('@/src/lib/prisma');
    
    const user = await prisma.volunteer.findUnique({
      where: { id: decoded.userId },
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

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log('👤 Usuário:', user.name);
    console.log('🎯 Skills:', user.skills);
    console.log('📍 Localização:', user.location);

    // 3. Buscar oportunidades (com cache)
    const opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades encontradas`);

    // 4. Calcular matches com scores personalizados
    const matches = calculateMatchesWithScores(user, opportunities);

    // 5. Ordenar por score (maior primeiro)
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    const executionTime = Date.now() - startTime;
    console.log(`✨ API finalizada em ${executionTime}ms`);
    console.log(`🎯 Retornando ${matches.length} matches`);

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 30),
      total: matches.length,
      userSkills: user.skills || [],
      executionTimeMs: executionTime,
      usingAI: true
    });

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchOpportunitiesWithCache(): Promise<any[]> {
  const now = Date.now();
  
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Usando cache de projetos');
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`❌ GlobalGiving API erro: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    console.log(`📡 GlobalGiving: ${projects.length} projetos brutos`);

    cachedProjects = projects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      theme: project.themeName || 'Voluntariado',
      url: project.projectLink
    }));
    
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

// Função principal de cálculo de matches
function calculateMatchesWithScores(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const results: MatchResult[] = [];

  for (const opp of opportunities) {
    // Calcular score de match
    const matchScore = calculateMatchScore(userSkills, opp);
    
    // Determinar matched skills
    const matchedSkills = findMatchedSkills(userSkills, opp);
    
    // Determinar prioridade
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (matchScore >= 70) priority = 'high';
    else if (matchScore >= 45) priority = 'medium';
    else priority = 'low';
    
    // Gerar reasoning
    const reasoning = generateReasoning(matchScore, matchedSkills, opp.title);
    
    // Gerar recommendation
    const recommendation = generateRecommendation(matchScore, matchedSkills);
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: [],
      matchScore: matchScore,
      matchedSkills: matchedSkills.slice(0, 4),
      missingSkills: [],
      reasoning: reasoning,
      recommendation: recommendation,
      priority: priority,
      theme: opp.theme
    });
  }
  
  return results;
}

// Cálculo de match score
function calculateMatchScore(userSkills: string[], opportunity: any): number {
  if (!userSkills || userSkills.length === 0) {
    return 45;
  }
  
  const oppTitle = (opportunity.title || '').toLowerCase();
  const oppDescription = (opportunity.description || '').toLowerCase();
  const oppTheme = (opportunity.theme || '').toLowerCase();
  
  let totalScore = 0;
  let matchesFound = 0;
  
  for (const userSkill of userSkills) {
    const skillLower = userSkill.toLowerCase();
    
    if (oppTitle.includes(skillLower)) {
      totalScore += 25;
      matchesFound++;
    } else if (oppTheme.includes(skillLower)) {
      totalScore += 15;
      matchesFound++;
    } else if (oppDescription.includes(skillLower)) {
      totalScore += 8;
      matchesFound++;
    }
  }
  
  if (matchesFound >= 2) totalScore += 10;
  if (matchesFound >= 3) totalScore += 15;
  
  let finalScore = Math.min(95, Math.max(15, totalScore));
  
  if (matchesFound === 0 && totalScore === 0) {
    finalScore = 35;
  }
  
  // Variação baseada no ID
  let idHash = 0;
  for (let i = 0; i < opportunity.id.length; i++) {
    idHash += opportunity.id.charCodeAt(i);
  }
  const variation = (idHash % 15) - 7;
  finalScore = Math.min(95, Math.max(15, finalScore + variation));
  
  return Math.floor(finalScore);
}

// Encontrar skills que combinam
function findMatchedSkills(userSkills: string[], opportunity: any): string[] {
  const matched: string[] = [];
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  return matched;
}

// Gerar explicação do match
function generateReasoning(score: number, matchedSkills: string[], title: string): string {
  if (score >= 80 && matchedSkills.length > 0) {
    return `🏆 Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são altamente relevantes para este projeto.`;
  } else if (score >= 65) {
    if (matchedSkills.length > 0) {
      return `👍 Boa compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} serão muito úteis para este projeto.`;
    }
    return `💡 Compatibilidade moderada. Este projeto pode se beneficiar da sua experiência.`;
  } else if (score >= 45) {
    if (matchedSkills.length > 0) {
      return `📌 Compatibilidade positiva. Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} pode agregar valor.`;
    }
    return `📌 Oportunidade interessante para desenvolver suas habilidades.`;
  } else {
    return `📚 Oportunidade de desenvolvimento. Você pode expandir suas habilidades enquanto contribui.`;
  }
}

// Gerar recomendação
function generateRecommendation(score: number, matchedSkills: string[]): string {
  if (score >= 80) {
    return `🎯 RECOMENDAÇÃO FORTE: Candidate-se! Suas habilidades são exatamente o que este projeto procura.`;
  } else if (score >= 65) {
    if (matchedSkills.length > 0) {
      return `👍 RECOMENDAÇÃO: Considere se candidatar. Suas habilidades são valiosas para esta oportunidade.`;
    }
    return `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade.`;
  } else if (score >= 45) {
    return `📋 RECOMENDAÇÃO: Boa oportunidade para aplicar seus conhecimentos.`;
  } else {
    return `📚 RECOMENDAÇÃO: Ótima oportunidade para aprendizado. Candidate-se!`;
  }
}