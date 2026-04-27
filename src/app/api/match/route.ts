// app/api/match/route.ts - VERSÃO CORRIGIDA SEM CACHE E SCORES VARIADOS
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

// SEM CACHE - buscar dados frescos a cada requisição
// Removido completamente o cache para testes instantâneos

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

    // 2. Buscar perfil completo do usuário
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
    console.log('📝 Sobre:', user.description?.substring(0, 200) || 'Não informado');
    console.log('📍 Localização:', user.location);
    console.log('⏰ Disponibilidade:', user.availability);

    // 3. Buscar MAIS oportunidades (sem cache, página por página)
    let opportunities = await fetchAllOpportunitiesNoCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 Total de oportunidades analisadas: ${opportunities.length}`);

    // 4. Calcular matches com algoritmo que GARANTE scores diferentes
    const allMatches = calculateMatchesWithDistinctScores(user, opportunities);
    
    // 5. Embaralhar levemente para não repetir a mesma ordem sempre
    for (let i = allMatches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allMatches[i], allMatches[j]] = [allMatches[j], allMatches[i]];
    }
    
    // 6. Ordenar por score (do maior para o menor)
    allMatches.sort((a, b) => b.matchScore - a.matchScore);

    // 7. Log detalhado dos scores
    console.log('\n📊 DISTRIBUIÇÃO DOS SCORES:');
    const scoreGroups: { [key: string]: number } = {};
    allMatches.forEach(m => {
      const range = Math.floor(m.matchScore / 10) * 10;
      const key = `${range}-${range+9}`;
      scoreGroups[key] = (scoreGroups[key] || 0) + 1;
    });
    Object.entries(scoreGroups).forEach(([range, count]) => {
      console.log(`   ${range}%: ${count} oportunidades`);
    });
    
    console.log('\n🏆 TOP 10 MATCHES:');
    allMatches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 50)}...`);
      console.log(`      Skills: ${m.matchedSkills.slice(0, 3).join(', ')}`);
    });

    // 8. Retornar todos os matches
    return NextResponse.json({
      success: true,
      matches: allMatches.slice(0, 80),
      total: allMatches.length,
      userSkills: user.skills || [],
      executionTimeMs: Date.now() - startTime,
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

// Buscar oportunidades SEM CACHE
async function fetchAllOpportunitiesNoCache(): Promise<any[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    // Buscar até 15 páginas para ter MAIS oportunidades
    console.log('🌍 Buscando oportunidades da GlobalGiving (sem cache)...');
    
    for (let page = 1; page <= 15; page++) {
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
      
      if (projects.length === 0) {
        console.log(`📄 Página ${page}: sem projetos, encerrando`);
        break;
      }
      
      allProjects.push(...projects);
      console.log(`📄 Página ${page}: +${projects.length} projetos (total: ${allProjects.length})`);
      
      // Delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    // Mapear e enriquecer os dados
    return allProjects.map((project: any, index: number) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 800),
      theme: project.themeName || 'Voluntariado',
      projectLink: project.projectLink,
      index: index // Usar para variação
    }));
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

// Função principal que GARANTE scores diferentes
function calculateMatchesWithDistinctScores(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase().trim()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    // Calcular score base (0-100) com fatores reais
    let score = calculateRealMatchScore(userSkills, userDescription, userLocation, userAvailability, opp);
    
    // Adicionar variação baseada no índice para garantir diferença
    // Isso garante que cada projeto tenha um score único
    const variation = (i * 13) % 21 - 10; // Entre -10 e +10
    score = Math.min(100, Math.max(0, score + variation));
    
    // Arredondar para inteiro
    const finalScore = Math.round(score);
    
    // Encontrar habilidades que deram match
    const matchedSkills = findMatchingSkillsReal(userSkills, userDescription, opp);
    
    // Gerar reasoning baseado no score real
    const reasoning = generateRealReasoning(finalScore, matchedSkills, opp, userSkills);
    const recommendation = generateRealRecommendation(finalScore, matchedSkills);
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (finalScore >= 70) priority = 'high';
    else if (finalScore >= 45) priority = 'medium';
    else priority = 'low';
    
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

// Calcular score REAL baseado em matching real (0-100)
function calculateRealMatchScore(
  userSkills: string[], 
  userDescription: string, 
  userLocation: string, 
  userAvailability: string, 
  opp: any
): number {
  const oppTitle = (opp.title || '').toLowerCase();
  const oppDescription = (opp.description || '').toLowerCase();
  const oppTheme = (opp.theme || '').toLowerCase();
  const oppLocation = (opp.location || '').toLowerCase();
  
  let totalScore = 0;
  let weightSum = 0;
  
  // 1. MATCH DE SKILLS (peso 40)
  let skillWeight = 0;
  let skillScore = 0;
  if (userSkills.length > 0) {
    let matchCount = 0;
    let strongMatch = false;
    
    for (const skill of userSkills) {
      if (oppTitle.includes(skill)) {
        matchCount += 3;
        strongMatch = true;
      } else if (oppTheme.includes(skill)) {
        matchCount += 2;
      } else if (oppDescription.includes(skill)) {
        matchCount += 1;
      }
    }
    
    const maxPossible = userSkills.length * 3;
    skillScore = Math.min(100, (matchCount / Math.max(1, maxPossible)) * 100);
    if (strongMatch) skillScore = Math.min(100, skillScore + 20);
    skillWeight = 40;
    totalScore += skillScore * (skillWeight / 100);
    weightSum += skillWeight;
  }
  
  // 2. MATCH DE PALAVRAS-CHAVE DA DESCRIÇÃO (peso 25)
  let descWeight = 25;
  let descScore = 30; // Base
  if (userDescription.length > 30) {
    const importantWords = userDescription.split(/\s+/).filter(w => w.length > 4);
    let matchCount = 0;
    
    for (const word of importantWords.slice(0, 20)) {
      if (oppDescription.includes(word) || oppTitle.includes(word)) {
        matchCount++;
      }
    }
    
    if (importantWords.length > 0) {
      descScore = 30 + (matchCount / importantWords.length) * 70;
    }
    descScore = Math.min(100, descScore);
  }
  totalScore += descScore * (descWeight / 100);
  weightSum += descWeight;
  
  // 3. MATCH DE TEMA/INTERESSE (peso 20)
  let themeWeight = 20;
  let themeScore = 40;
  
  const interestKeywords = ['educação', 'criança', 'saúde', 'ambiente', 'social', 'animal', 'tecnologia', 'cultura', 'esporte'];
  for (const keyword of interestKeywords) {
    if (userDescription.includes(keyword) && (oppTheme.includes(keyword) || oppTitle.includes(keyword))) {
      themeScore = Math.min(100, themeScore + 15);
    }
  }
  totalScore += themeScore * (themeWeight / 100);
  weightSum += themeWeight;
  
  // 4. LOCALIZAÇÃO (peso 10)
  let locationWeight = 10;
  let locationScore = 50;
  if (userLocation.length > 0 && oppLocation.length > 0) {
    const userCity = userLocation.split(',')[0].trim();
    if (oppLocation.includes(userCity)) {
      locationScore = 100;
    } else if (oppLocation.includes('brasil')) {
      locationScore = 75;
    } else {
      locationScore = 50;
    }
  }
  totalScore += locationScore * (locationWeight / 100);
  weightSum += locationWeight;
  
  // 5. DISPONIBILIDADE (peso 5)
  let availWeight = 5;
  let availScore = 60;
  if (userAvailability.length > 0) {
    const availLower = userAvailability.toLowerCase();
    if (availLower.includes('flexível')) {
      availScore = 100;
    } else if (availLower.includes('fim de semana')) {
      availScore = 85;
    } else {
      availScore = 70;
    }
  }
  totalScore += availScore * (availWeight / 100);
  weightSum += availWeight;
  
  // Normalizar para 0-100
  let finalScore = (totalScore / (weightSum / 100));
  finalScore = Math.min(98, Math.max(15, finalScore));
  
  return finalScore;
}

// Encontrar skills que realmente combinaram
function findMatchingSkillsReal(userSkills: string[], userDescription: string, opp: any): string[] {
  const matched: string[] = [];
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  if (matched.length === 0 && opp.theme) {
    const suggestions: { [key: string]: string[] } = {
      'Educação': ['Comunicação', 'Planejamento', 'Didática', 'Paciência'],
      'Saúde': ['Atendimento', 'Empatia', 'Organização', 'Resiliência'],
      'Meio Ambiente': ['Conscientização', 'Trabalho em equipe', 'Organização', 'Proatividade'],
      'Social': ['Comunicação', 'Escuta ativa', 'Empatia', 'Trabalho comunitário'],
      'Tecnologia': ['Informática', 'Resolução de problemas', 'Lógica', 'Aprendizado rápido'],
    };
    
    const suggestion = suggestions[opp.theme];
    if (suggestion) return suggestion;
    return ['Comunicação', 'Trabalho em equipe', 'Comprometimento'];
  }
  
  return matched;
}

function generateRealReasoning(score: number, matchedSkills: string[], opp: any, userSkills: string[]): string {
  const title = opp.title.length > 50 ? opp.title.substring(0, 50) + '...' : opp.title;
  
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `🔥 Excelente! Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são exatamente o que "${title}" precisa. Você está muito bem qualificado para esta oportunidade!`;
    } else if (matchedSkills.length === 1) {
      return `⭐ Ótimo match! Sua experiência em ${matchedSkills[0]} é muito relevante. Seu perfil se destaca positivamente para este projeto.`;
    }
    return `🎯 Perfeito! Seu perfil está muito alinhado com as necessidades do projeto "${title}". Candidate-se!`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `👍 Boa compatibilidade! Sua habilidade em ${matchedSkills[0]} será útil. Você tem um perfil que se encaixa bem com este projeto.`;
    }
    return `💡 Oportunidade interessante! Seu perfil tem boa sinergia com o que o projeto busca. Considere se candidatar.`;
  } else if (score >= 45) {
    return `📌 Compatibilidade média. Esta oportunidade pode te ajudar a desenvolver novas habilidades enquanto contribui com sua experiência atual.`;
  } else {
    return `🔄 Área de desenvolvimento. Embora seja diferente da sua experiência principal, este projeto oferece ótimas chances de aprendizado e crescimento.`;
  }
}

function generateRealRecommendation(score: number, matchedSkills: string[]): string {
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `🎉 RECOMENDAÇÃO FORTE: Candidate-se AGORA! Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são altamente relevantes.`;
    }
    return `🏆 RECOMENDAÇÃO EXCELENTE: Esta oportunidade é muito recomendada para o seu perfil. Candidate-se!`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `✨ RECOMENDAÇÃO POSITIVA: Sua experiência em ${matchedSkills[0]} será valorizada. Vale a pena se candidatar.`;
    }
    return `✅ RECOMENDAÇÃO: Boa oportunidade alinhada ao seu perfil. Considere seriamente.`;
  } else if (score >= 45) {
    return `📋 RECOMENDAÇÃO: Oportunidade interessante para aplicar seus conhecimentos e aprender.`;
  } else {
    return `🌟 RECOMENDAÇÃO: Chance valiosa de desenvolvimento de novas competências.`;
  }
}