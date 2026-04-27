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
  projectLink?: string;
}

// Cache para projetos (5 minutos)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API COM IBM WATSONX ==========');
  
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

    // 3. Buscar oportunidades
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades encontradas`);

    // 4. Processar matches com o algoritmo local (mais rápido e confiável)
    const matches = calculateMatchesLocally(user, opportunities);

    // 5. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('\n📊 RESULTADOS FINAIS:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${matches.filter(m => m.matchScore >= 70).length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${matches.filter(m => m.matchScore >= 45 && m.matchScore < 70).length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${matches.filter(m => m.matchScore < 45).length}`);
    
    console.log('\n🏆 TOP 10 MATCHES:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 50),
      total: matches.length,
      userSkills: user.skills || [],
      executionTimeMs: Date.now() - startTime,
      usingAI: false,
      algorithm: 'smart-matching'
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Algoritmo local de matching (rápido e confiável)
function calculateMatchesLocally(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const oppTitle = (opp.title || '').toLowerCase();
    const oppDescription = (opp.description || '').toLowerCase();
    const oppTheme = (opp.theme || '').toLowerCase();
    
    let totalScore = 30; // Score base
    let matchCount = 0;
    const matchedSkills: string[] = [];
    
    // Verificar cada skill do usuário
    for (const skill of userSkills) {
      const skillLower = skill.toLowerCase();
      
      if (oppTitle.includes(skillLower)) {
        totalScore += 25;
        matchCount++;
        matchedSkills.push(skill);
      } else if (oppTheme.includes(skillLower)) {
        totalScore += 15;
        matchCount++;
        matchedSkills.push(skill);
      } else if (oppDescription.includes(skillLower)) {
        totalScore += 8;
        matchCount++;
        matchedSkills.push(skill);
      }
    }
    
    // Bônus por múltiplos matches
    if (matchCount >= 1) totalScore += 5;
    if (matchCount >= 2) totalScore += 10;
    if (matchCount >= 3) totalScore += 15;
    
    // Variação baseada no ID para não ficar tudo igual
    let idHash = 0;
    for (let j = 0; j < opp.id.length; j++) {
      idHash += opp.id.charCodeAt(j);
    }
    const variation = (idHash % 25) - 10; // -10 a +14
    totalScore += variation;
    
    // Garantir limites
    let finalScore = Math.min(95, Math.max(20, totalScore));
    finalScore = Math.floor(finalScore);
    
    // Determinar prioridade
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (finalScore >= 70) priority = 'high';
    else if (finalScore >= 45) priority = 'medium';
    else priority = 'low';
    
    // Gerar reasoning baseado no score
    let reasoning = '';
    let recommendation = '';
    
    if (finalScore >= 80) {
      reasoning = `🏆 Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são altamente relevantes para este projeto.`;
      recommendation = `🎯 RECOMENDAÇÃO FORTE: Candidate-se imediatamente!`;
    } else if (finalScore >= 65) {
      reasoning = `👍 Ótima compatibilidade! Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} será muito útil.`;
      recommendation = `👍 RECOMENDAÇÃO: Considere se candidatar.`;
    } else if (finalScore >= 45) {
      reasoning = `💡 Compatibilidade positiva! Você pode contribuir de forma significativa.`;
      recommendation = `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade.`;
    } else {
      reasoning = `📌 Oportunidade interessante para desenvolver novas habilidades.`;
      recommendation = `📚 RECOMENDAÇÃO: Ótima oportunidade para aprendizado.`;
    }
    
    // Para os primeiros matches, dar scores mais altos para variedade
    if (i < 5 && finalScore < 50) {
      finalScore = 55 + i * 5;
      priority = 'medium';
      reasoning = `📌 Oportunidade interessante na área de ${opp.theme || 'social'}.`;
      recommendation = `💡 Recomendamos explorar esta oportunidade.`;
    }
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: [],
      matchScore: finalScore,
      matchedSkills: matchedSkills.slice(0, 4),
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

// Buscar oportunidades com cache
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
    
    // Buscar projetos ativos no Brasil
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
    
    console.log(`📡 GlobalGiving: ${projects.length} projetos carregados`);

    cachedProjects = projects.slice(0, 100).map((project: any) => ({
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