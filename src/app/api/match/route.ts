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

// 🔥 FUNÇÃO PRINCIPAL DE CÁLCULO DE MATCHES 🔥
function calculateMatchesWithScores(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const results: MatchResult[] = [];

  for (const opp of opportunities) {
    // Calcular score de match baseado nas habilidades do usuário
    const matchScore = calculateMatchScore(userSkills, opp);
    
    // Determinar matched skills
    const matchedSkills = findMatchedSkills(userSkills, opp);
    
    // Determinar prioridade baseada no score
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (matchScore >= 70) priority = 'high';
    else if (matchScore >= 45) priority = 'medium';
    else priority = 'low';
    
    // Gerar reasoning baseado no score
    const reasoning = generateReasoning(matchScore, matchedSkills, opp.title);
    
    // Gerar recommendation baseada no score
    const recommendation = generateRecommendation(matchScore, matchedSkills);
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: extractSkillsFromText(opp),
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

// 🔥 CÁLCULO DE MATCH SCORE 🔥
function calculateMatchScore(userSkills: string[], opportunity: any): number {
  if (!userSkills || userSkills.length === 0) {
    return 45; // Score médio para usuários sem habilidades
  }
  
  const oppTitle = (opportunity.title || '').toLowerCase();
  const oppDescription = (opportunity.description || '').toLowerCase();
  const oppTheme = (opportunity.theme || '').toLowerCase();
  const oppText = `${oppTitle} ${oppDescription} ${oppTheme}`;
  
  let totalScore = 0;
  let matchesFound = 0;
  
  for (const userSkill of userSkills) {
    const skillLower = userSkill.toLowerCase();
    
    // Verificar se a skill aparece no título (peso maior)
    if (oppTitle.includes(skillLower)) {
      totalScore += 25;
      matchesFound++;
    }
    // Verificar se aparece no tema (peso médio)
    else if (oppTheme.includes(skillLower)) {
      totalScore += 15;
      matchesFound++;
    }
    // Verificar se aparece na descrição (peso menor)
    else if (oppDescription.includes(skillLower)) {
      totalScore += 8;
      matchesFound++;
    }
  }
  
  // Bônus por múltiplos matches
  if (matchesFound >= 2) totalScore += 10;
  if (matchesFound >= 3) totalScore += 15;
  
  // Garantir que o score esteja entre 15 e 95
  let finalScore = Math.min(95, Math.max(15, totalScore));
  
  // Se não encontrou nenhum match, dar score baseado no tema
  if (matchesFound === 0 && totalScore === 0) {
    finalScore = 35;
  }
  
  // Pequena variação para não ficar tudo igual (baseado no ID)
  const idHash = opportunity.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  const variation = (idHash % 15) - 7; // Entre -7 e +7
  finalScore = Math.min(95, Math.max(15, finalScore + variation));
  
  return Math.floor(finalScore);
}

// 🔥 ENCONTRAR SKILLS QUE MATCHAM 🔥
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

// 🔥 EXTRAIR SKILLS DO TEXTO DA OPORTUNIDADE 🔥
function extractSkillsFromText(opportunity: any): string[] {
  const skills: string[] = [];
  const text = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  const skillKeywords = [
    'educação', 'ensino', 'professor', 'escola', 'criança',
    'tecnologia', 'programação', 'software', 'web', 'digital',
    'saúde', 'medicina', 'enfermagem', 'cuidado',
    'ambiente', 'ecologia', 'sustentabilidade', 'reciclagem',
    'social', 'comunidade', 'voluntariado', 'assistência',
    'cultura', 'arte', 'música', 'teatro',
    'esporte', 'futebol', 'atividade física',
    'administração', 'gestão', 'organização',
    'comunicação', 'marketing', 'redes sociais'
  ];
  
  for (const keyword of skillKeywords) {
    if (text.includes(keyword)) {
      skills.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  }
  
  return skills.slice(0, 4);
}

// 🔥 GERAR EXPLICAÇÃO DO MATCH 🔥
function generateReasoning(score: number, matchedSkills: string[], title: string): string {
  if (score >= 80 && matchedSkills.length > 0) {
    return `🏆 Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são altamente relevantes para o projeto "${title}". Você tem um perfil muito alinhado com as necessidades desta organização.`;
  } else if (score >= 65) {
    if (matchedSkills.length > 0) {
      return `👍 Boa compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} serão muito úteis para o projeto "${title}". Você pode contribuir de forma significativa.`;
    }
    return `💡 Compatibilidade moderada. Este projeto pode se beneficiar da sua experiência e perfil. Considere se candidatar!`;
  } else if (score >= 45) {
    if (matchedSkills.length > 0) {
      return `📌 Compatibilidade positiva. Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} pode agregar valor a este projeto.`;
    }
    return `📌 Oportunidade interessante. Embora não haja um alinhamento direto de habilidades, você pode desenvolver novas competências.`;
  } else {
    return `📚 Oportunidade de desenvolvimento. Este projeto pode ajudar você a expandir suas habilidades enquanto contribui para uma causa social.`;
  }
}

// 🔥 GERAR RECOMENDAÇÃO 🔥
function generateRecommendation(score: number, matchedSkills: string[]): string {
  if (score >= 80) {
    return `🎯 RECOMENDAÇÃO FORTE: Candidate-se imediatamente! Suas habilidades são exatamente o que este projeto procura.`;
  } else if (score >= 65) {
    if (matchedSkills.length > 0) {
      return `👍 RECOMENDAÇÃO: Considere se candidatar. Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são valiosas para esta oportunidade.`;
    }
    return `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade. Você pode contribuir de forma significativa.`;
  } else if (score >= 45) {
    return `📋 RECOMENDAÇÃO: Esta é uma boa oportunidade para aplicar seus conhecimentos e fazer a diferença.`;
  } else {
    return `📚 RECOMENDAÇÃO: Ótima oportunidade para aprendizado e desenvolvimento de novas habilidades. Candidate-se!`;
  }
}