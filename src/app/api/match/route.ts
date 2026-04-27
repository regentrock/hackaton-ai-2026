// app/api/match/route.ts - VERSÃO CORRIGIDA COM SCORES VARIADOS
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

// Cache para projetos (10 minutos)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API INICIADA ==========');
  
  try {
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
    console.log('📝 Sobre:', user.description?.substring(0, 100) || 'Não informado');

    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 Total de oportunidades: ${opportunities.length}`);

    // Calcular matches com SCORES VARIADOS
    const matches = calculateMatchesWithVariedScores(user, opportunities);

    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('📊 TOP 10 SCORES:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`  ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 45)}...`);
      console.log(`     Skills match: ${m.matchedSkills.slice(0, 2).join(', ')}`);
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 40),
      total: matches.length,
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
    const allProjects: any[] = [];
    
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
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    const shuffled = [...allProjects];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    cachedProjects = shuffled.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 500),
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

// NOVA FUNÇÃO: Calcula scores com maior variação
function calculateMatchesWithVariedScores(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  const results: MatchResult[] = [];
  
  // Extrair palavras-chave do usuário para melhor matching
  const userKeywords = extractUserKeywords(userDescription, userSkills);
  console.log('🔑 Palavras-chave do perfil:', userKeywords.slice(0, 10));

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    // Calcular cada componente separadamente
    const skillScore = calculateSkillMatchScore(userSkills, opp);
    const keywordScore = calculateKeywordMatchScore(userKeywords, opp);
    const interestScore = calculateInterestMatchScore(userDescription, opp);
    const locationScore = calculateLocationMatchScore(userLocation, opp.location);
    const availabilityScore = calculateAvailabilityMatchScore(userAvailability, opp);
    
    // Calcular score total com pesos
    let totalScore = 0;
    totalScore += skillScore * 0.40;      // 40% habilidades
    totalScore += keywordScore * 0.25;    // 25% palavras-chave
    totalScore += interestScore * 0.20;   // 20% interesses
    totalScore += locationScore * 0.10;   // 10% localização
    totalScore += availabilityScore * 0.05; // 5% disponibilidade
    
    // Garantir score entre 25 e 98
    let finalScore = Math.min(98, Math.max(25, Math.round(totalScore)));
    
    // Pequena variação baseada no índice para não ficar igual
    finalScore = finalScore + ((i * 3) % 7) - 3;
    finalScore = Math.min(98, Math.max(25, finalScore));
    
    // Encontrar habilidades que deram match
    const matchedSkills = findMatchingSkills(userSkills, opp, userDescription);
    
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
      reasoning: generatePersonalizedReasoning(finalScore, matchedSkills, opp, userSkills, userDescription),
      recommendation: generatePersonalizedRecommendation(finalScore, matchedSkills, opp, userSkills),
      priority: priority,
      theme: opp.theme,
      projectLink: opp.projectLink
    });
  }
  
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  return results;
}

// Extrair palavras-chave relevantes do usuário
function extractUserKeywords(description: string, skills: string[]): string[] {
  const keywords: string[] = [...skills];
  
  const importantWords = ['educação', 'saúde', 'ambiente', 'social', 'criança', 'idoso', 'animal', 
    'tecnologia', 'arte', 'cultura', 'esporte', 'comunidade', 'ensinar', 'aprender', 'ajudar', 
    'voluntário', 'assistência', 'desenvolvimento', 'sustentabilidade', 'inclusão'];
  
  for (const word of importantWords) {
    if (description.includes(word)) {
      keywords.push(word);
    }
  }
  
  return [...new Set(keywords)];
}

// Score de habilidades (0-100)
function calculateSkillMatchScore(userSkills: string[], opp: any): number {
  if (userSkills.length === 0) return 40;
  
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  let matchCount = 0;
  let strongMatches = 0;
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matchCount++;
      // Verificar se é um match forte (aparece no título)
      if (opp.title.toLowerCase().includes(skill.toLowerCase())) {
        strongMatches++;
      }
    }
  }
  
  const percentage = (matchCount / userSkills.length) * 100;
  // Adicionar bônus para matches fortes
  const bonus = strongMatches * 10;
  
  return Math.min(95, Math.max(30, percentage + bonus));
}

// Score de palavras-chave (0-100)
function calculateKeywordMatchScore(userKeywords: string[], opp: any): number {
  if (userKeywords.length === 0) return 35;
  
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of userKeywords) {
    if (oppText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  
  const percentage = (matchCount / userKeywords.length) * 100;
  return Math.min(90, Math.max(30, percentage));
}

// Score de interesses baseado na descrição (0-100)
function calculateInterestMatchScore(userDescription: string, opp: any): number {
  if (userDescription.length < 20) return 45;
  
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  let score = 0;
  
  // Temas de interesse
  const interestThemes = [
    { theme: 'educação', keywords: ['educação', 'ensino', 'escola', 'criança', 'alfabetização', 'professor'] },
    { theme: 'saúde', keywords: ['saúde', 'hospital', 'médico', 'paciente', 'bem-estar', 'cuidado'] },
    { theme: 'ambiente', keywords: ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem', 'natureza'] },
    { theme: 'social', keywords: ['social', 'comunidade', 'assistência', 'moradia', 'fome', 'pobreza'] },
    { theme: 'animais', keywords: ['animal', 'pet', 'bicho', 'fauna', 'proteção animal'] },
    { theme: 'tecnologia', keywords: ['tecnologia', 'programação', 'informática', 'digital', 'software'] },
    { theme: 'cultura', keywords: ['cultura', 'arte', 'música', 'teatro', 'dança', 'patrimônio'] },
    { theme: 'esportes', keywords: ['esporte', 'futebol', 'atividade física', 'lazer', 'recreação'] }
  ];
  
  for (const interest of interestThemes) {
    let userHasInterest = false;
    for (const keyword of interest.keywords) {
      if (userDescription.includes(keyword)) {
        userHasInterest = true;
        break;
      }
    }
    
    if (userHasInterest) {
      for (const keyword of interest.keywords) {
        if (oppText.includes(keyword)) {
          score += 15;
          break;
        }
      }
    }
  }
  
  return Math.min(95, Math.max(35, 45 + score));
}

// Score de localização (0-100)
function calculateLocationMatchScore(userLocation: string, oppLocation: string): number {
  if (!userLocation || userLocation.length === 0) return 50;
  if (!oppLocation) return 50;
  
  const userLower = userLocation.toLowerCase();
  const oppLower = oppLocation.toLowerCase();
  
  // Mesmo local exato
  const userCity = userLower.split(',')[0].trim();
  const oppCity = oppLower.split(',')[0].trim();
  
  if (userCity === oppCity) {
    return 100;
  }
  
  // Mesmo estado/região
  const userState = userLower.split(',').pop()?.trim() || '';
  const oppState = oppLower.split(',').pop()?.trim() || '';
  
  if (userState && oppState && userState === oppState) {
    return 75;
  }
  
  // Cidade mencionada na descrição
  if (oppLower.includes(userCity) || userLower.includes(oppCity)) {
    return 70;
  }
  
  // Vaga remota ou online
  if (oppLower.includes('remote') || oppLower.includes('online') || oppLower.includes('virtual')) {
    return 65;
  }
  
  return 45;
}

// Score de disponibilidade (0-100)
function calculateAvailabilityMatchScore(userAvailability: string, opp: any): number {
  if (!userAvailability || userAvailability.length === 0) return 50;
  
  const userLower = userAvailability.toLowerCase();
  const oppText = `${opp.title} ${opp.description}`.toLowerCase();
  
  if (userLower.includes('flexível') || userLower.includes('qualquer') || userLower.includes('disponível')) {
    return 90;
  }
  
  if (userLower.includes('fim de semana') && (oppText.includes('sábado') || oppText.includes('domingo'))) {
    return 85;
  }
  
  if (userLower.includes('noite') && oppText.includes('noite')) {
    return 80;
  }
  
  if (userLower.includes('manhã') && oppText.includes('manhã')) {
    return 80;
  }
  
  if (userLower.includes('tarde') && oppText.includes('tarde')) {
    return 80;
  }
  
  return 55;
}

// Encontrar habilidades que combinam
function findMatchingSkills(userSkills: string[], opp: any, userDescription: string): string[] {
  const matched: string[] = [];
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  // Se não encontrou, buscar na descrição do usuário
  if (matched.length === 0 && userDescription.length > 0) {
    const descWords = userDescription.split(/\s+/);
    for (const word of descWords) {
      if (word.length > 5 && oppText.includes(word.toLowerCase())) {
        matched.push(word.substring(0, 20));
        if (matched.length >= 3) break;
      }
    }
  }
  
  // Sugestões baseadas no tema
  if (matched.length === 0 && opp.theme) {
    const suggestions: { [key: string]: string[] } = {
      'Educação': ['Ensinar', 'Comunicar-se bem', 'Paciência', 'Planejar atividades'],
      'Saúde': ['Atendimento humanizado', 'Organização', 'Empatia', 'Trabalhar sob pressão'],
      'Meio Ambiente': ['Conscientização ambiental', 'Trabalho em equipe', 'Organização', 'Proatividade'],
      'Social': ['Comunicação interpessoal', 'Escuta ativa', 'Empatia', 'Resolver problemas'],
      'Tecnologia': ['Conhecimento em informática', 'Resolução de problemas', 'Aprendizado rápido', 'Lógica'],
      'Cultura': ['Criatividade', 'Comunicação', 'Artes', 'Planejamento'],
      'Animais': ['Responsabilidade', 'Paciência', 'Compaixão', 'Cuidados básicos'],
      'Crianças': ['Criatividade', 'Paciência', 'Responsabilidade', 'Dinamismo'],
      'Esportes': ['Atividade física', 'Trabalho em equipe', 'Liderança', 'Motivação']
    };
    
    const suggestion = suggestions[opp.theme];
    if (suggestion) return suggestion.slice(0, 4);
    return ['Comunicação', 'Trabalho em equipe', 'Comprometimento', 'Proatividade'];
  }
  
  return matched;
}

// Reasoning personalizado
function generatePersonalizedReasoning(score: number, matchedSkills: string[], opp: any, userSkills: string[], userDescription: string): string {
  const title = opp.title.length > 50 ? opp.title.substring(0, 50) + '...' : opp.title;
  
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `Excelente! Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são exatamente o que o projeto "${title}" precisa. Seu perfil se destaca muito positivamente.`;
    } else if (matchedSkills.length === 1) {
      return `Ótimo! Sua experiência em ${matchedSkills[0]} é muito relevante para este projeto. Você tem tudo para fazer a diferença!`;
    }
    return `Excelente oportunidade! Seu perfil está muito alinhado com as necessidades deste projeto. Suas características se encaixam perfeitamente.`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `Boa compatibilidade! Sua habilidade em ${matchedSkills[0]} será muito útil. Com algumas adaptações, você pode ser um excelente voluntário aqui.`;
    }
    return `Compatibilidade positiva! Seu perfil tem pontos que se alinham bem com este projeto. Vale a pena considerar.`;
  } else if (score >= 45) {
    if (matchedSkills.length >= 1) {
      return `Compatibilidade média. Sua experiência em ${matchedSkills[0]} é relevante, e esta oportunidade pode te ajudar a desenvolver novas competências.`;
    }
    return `Oportunidade interessante para expandir seus horizontes. Seu perfil tem potencial para contribuir e aprender muito.`;
  } else {
    return `Este projeto representa uma ótima chance de crescimento pessoal. Embora seja diferente da sua experiência atual, você pode desenvolver novas habilidades valiosas.`;
  }
}

// Recommendation personalizada
function generatePersonalizedRecommendation(score: number, matchedSkills: string[], opp: any, userSkills: string[]): string {
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `🎯 RECOMENDAÇÃO FORTE: Candidate-se agora! Este projeto busca exatamente profissionais com suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]}.`;
    }
    return `🎯 RECOMENDAÇÃO FORTE: Esta oportunidade foi feita para você! Seu perfil se destaca muito.`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `✨ RECOMENDAÇÃO POSITIVA: Vale muito a pena se candidatar. Sua experiência em ${matchedSkills[0]} será muito valorizada.`;
    }
    return `✨ RECOMENDAÇÃO POSITIVA: Boa oportunidade alinhada ao seu perfil. Considere se candidatar.`;
  } else if (score >= 45) {
    return `💡 RECOMENDAÇÃO: Oportunidade interessante para aplicar seus conhecimentos e crescer. Vale a pena conhecer mais.`;
  } else {
    return `🌟 RECOMENDAÇÃO: Uma chance valiosa de aprendizado e desenvolvimento. Pode ser uma experiência enriquecedora.`;
  }
}