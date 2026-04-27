// app/api/match/route.ts - VERSÃO OTIMIZADA COMPLETA
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

// Cache para projetos (5 minutos para atualizar mais rápido)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Cache de sessão do usuário para evitar repetição
let userSessionCache: Map<string, { timestamp: number, seenIds: Set<string> }> = new Map();

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

    // 3. Buscar MAIS oportunidades (escopo maior)
    let opportunities = await fetchAllOpportunities();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades disponíveis para análise`);

    // 4. Aplicar filtro de localização preferencial (opcional)
    let filteredOpportunities = opportunities;
    
    // Se usuário tem localização, priorizar projetos do Brasil
    if (user.location && user.location.length > 0) {
      const brazilProjects = opportunities.filter(opp => 
        opp.location.toLowerCase().includes('brasil') || 
        opp.location.toLowerCase().includes('br')
      );
      if (brazilProjects.length > 0) {
        console.log(`📍 Priorizando ${brazilProjects.length} projetos no Brasil`);
        // Colocar projetos do Brasil no início
        filteredOpportunities = [...brazilProjects, ...opportunities.filter(opp => !brazilProjects.includes(opp))];
      }
    }

    // 5. Calcular matches com algoritmo avançado
    const allMatches = calculateAdvancedMatches(user, filteredOpportunities);

    // 6. Ordenar por score
    allMatches.sort((a, b) => b.matchScore - a.matchScore);

    // 7. Separar por categorias
    const highMatches = allMatches.filter(m => m.matchScore >= 70);
    const mediumMatches = allMatches.filter(m => m.matchScore >= 45 && m.matchScore < 70);
    const lowMatches = allMatches.filter(m => m.matchScore < 45);

    console.log('\n📊 RESULTADOS DO MATCHING:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${highMatches.length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${mediumMatches.length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${lowMatches.length}`);
    
    console.log('\n🏆 TOP 10 MATCHES:');
    allMatches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 50)}...`);
      console.log(`      Skills: ${m.matchedSkills.slice(0, 3).join(', ')}`);
    });

    // 8. Retornar todos os matches (até 60)
    return NextResponse.json({
      success: true,
      matches: allMatches.slice(0, 60),
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

// Buscar TODAS as oportunidades disponíveis
async function fetchAllOpportunities(): Promise<any[]> {
  const now = Date.now();
  
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`📦 Cache ativo (${Math.round((now - cacheTimestamp) / 1000)}s) - ${cachedProjects.length} projetos`);
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    // Buscar até 10 páginas para ter MAIS oportunidades
    console.log('🌍 Buscando oportunidades da GlobalGiving...');
    
    for (let page = 1; page <= 10; page++) {
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
      
      // Pequeno delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    // Mapear e enriquecer os dados
    cachedProjects = allProjects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 800),
      theme: project.themeName || 'Voluntariado',
      projectLink: project.projectLink,
      // Extrair palavras-chave do título
      keywords: extractProjectKeywords(project.title || '')
    }));
    
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

// Extrair palavras-chave do projeto
function extractProjectKeywords(title: string): string[] {
  const words = title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
  return [...new Set(words)].slice(0, 10);
}

// ALGORITMO AVANÇADO DE MATCHING
function calculateAdvancedMatches(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase().trim()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  // Analisar perfil do usuário profundamente
  const userProfile = analyzeUserProfile(userSkills, userDescription);
  console.log('🔍 Perfil analisado:', {
    skillCount: userSkills.length,
    interests: userProfile.interests.slice(0, 5),
    level: userProfile.experienceLevel
  });
  
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    // Calcular score detalhado
    const scores = calculateDetailedMatchScores({
      userSkills,
      userDescription,
      userLocation,
      userAvailability,
      userProfile,
      opportunity: opp
    });
    
    // Score final é a média ponderada
    let finalScore = Math.round(
      scores.skillScore * 0.35 +
      scores.interestScore * 0.30 +
      scores.keywordScore * 0.15 +
      scores.descriptionScore * 0.10 +
      scores.locationScore * 0.05 +
      scores.availabilityScore * 0.05
    );
    
    // Garantir que seja 0-100
    finalScore = Math.min(100, Math.max(0, finalScore));
    
    // Encontrar skills que deram match
    const matchedSkills = findMatchedSkillsDetailed(userSkills, userDescription, opp);
    
    // Gerar reasoning baseado nos scores
    const reasoning = generateDetailedReasoning(finalScore, matchedSkills, opp, userProfile);
    const recommendation = generateDetailedRecommendation(finalScore, matchedSkills, opp);
    
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
  
  // Ordenar por score decrescente
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  return results;
}

interface UserProfile {
  interests: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  keywords: string[];
}

function analyzeUserProfile(skills: string[], description: string): UserProfile {
  const interests: string[] = [];
  const keywords: string[] = [...skills];
  
  const interestCategories = [
    { name: 'educação', words: ['educação', 'ensino', 'escola', 'criança', 'aprender', 'professor', 'alfabetização', 'mentoria'] },
    { name: 'saúde', words: ['saúde', 'hospital', 'médico', 'paciente', 'bem-estar', 'cuidado', 'enfermagem', 'psicologia'] },
    { name: 'meio ambiente', words: ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem', 'natureza', 'floresta', 'água'] },
    { name: 'social', words: ['social', 'comunidade', 'assistência', 'moradia', 'fome', 'pobreza', 'direitos', 'cidadania'] },
    { name: 'animais', words: ['animal', 'pet', 'cachorro', 'gato', 'fauna', 'proteção animal', 'abrigo'] },
    { name: 'tecnologia', words: ['tecnologia', 'programação', 'informática', 'digital', 'software', 'site', 'app', 'ti'] },
    { name: 'cultura', words: ['cultura', 'arte', 'música', 'teatro', 'dança', 'artesanato', 'patrimônio'] },
    { name: 'esportes', words: ['esporte', 'futebol', 'atividade física', 'lazer', 'recreação', 'saúde'] },
    { name: 'idosos', words: ['idoso', 'terceira idade', 'envelhecimento', 'aposentado', 'geriátrico'] },
    { name: 'crianças', words: ['criança', 'infantil', 'adolescente', 'jovem', 'educação infantil'] }
  ];
  
  for (const category of interestCategories) {
    for (const word of category.words) {
      if (description.includes(word)) {
        interests.push(category.name);
        keywords.push(word);
        break;
      }
    }
  }
  
  // Determinar nível de experiência baseado na quantidade de skills
  let experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
  if (skills.length >= 5) experienceLevel = 'advanced';
  else if (skills.length >= 3) experienceLevel = 'intermediate';
  
  return {
    interests: [...new Set(interests)],
    experienceLevel,
    keywords: [...new Set(keywords)]
  };
}

interface DetailedScores {
  skillScore: number;
  interestScore: number;
  keywordScore: number;
  descriptionScore: number;
  locationScore: number;
  availabilityScore: number;
}

function calculateDetailedMatchScores(params: {
  userSkills: string[];
  userDescription: string;
  userLocation: string;
  userAvailability: string;
  userProfile: UserProfile;
  opportunity: any;
}): DetailedScores {
  const { userSkills, userDescription, userLocation, userAvailability, userProfile, opportunity } = params;
  
  const oppTitle = (opportunity.title || '').toLowerCase();
  const oppDescription = (opportunity.description || '').toLowerCase();
  const oppTheme = (opportunity.theme || '').toLowerCase();
  const oppLocation = (opportunity.location || '').toLowerCase();
  
  // 1. SKILL SCORE (0-100)
  let skillScore = 0;
  if (userSkills.length > 0) {
    let matchCount = 0;
    let strongMatchCount = 0;
    
    for (const skill of userSkills) {
      if (oppTitle.includes(skill)) {
        matchCount += 2;
        strongMatchCount++;
      } else if (oppTheme.includes(skill)) {
        matchCount += 1.5;
      } else if (oppDescription.includes(skill)) {
        matchCount += 1;
      }
    }
    
    skillScore = Math.min(100, Math.round((matchCount / userSkills.length) * 100));
    if (strongMatchCount > 0) skillScore = Math.min(100, skillScore + 15);
  } else {
    skillScore = 30;
  }
  
  // 2. INTEREST SCORE (0-100)
  let interestScore = 40;
  if (userProfile.interests.length > 0) {
    let interestMatchCount = 0;
    for (const interest of userProfile.interests) {
      if (oppTheme.includes(interest) || oppTitle.includes(interest)) {
        interestMatchCount++;
      }
    }
    interestScore = Math.min(95, 40 + (interestMatchCount / userProfile.interests.length) * 55);
  }
  
  // 3. KEYWORD SCORE (0-100)
  let keywordScore = 35;
  if (userProfile.keywords.length > 0) {
    let matchCount = 0;
    for (const keyword of userProfile.keywords) {
      if (keyword.length > 3 && (oppTitle.includes(keyword) || oppDescription.includes(keyword))) {
        matchCount++;
      }
    }
    keywordScore = Math.min(90, 35 + (matchCount / userProfile.keywords.length) * 55);
  }
  
  // 4. DESCRIPTION SCORE (0-100) - analisa compatibilidade de texto
  let descriptionScore = 40;
  if (userDescription.length > 30) {
    const userWords = userDescription.split(/\s+/);
    let commonWordCount = 0;
    const importantWords = userWords.filter(w => w.length > 4);
    
    for (const word of importantWords.slice(0, 30)) {
      if (oppDescription.includes(word) || oppTitle.includes(word)) {
        commonWordCount++;
      }
    }
    
    if (importantWords.length > 0) {
      descriptionScore = Math.min(85, 40 + (commonWordCount / importantWords.length) * 45);
    }
  }
  
  // 5. LOCATION SCORE (0-100)
  let locationScore = 50;
  if (userLocation.length > 0 && oppLocation.length > 0) {
    const userCity = userLocation.split(',')[0].trim();
    const oppCity = oppLocation.split(',')[0].trim();
    
    if (userCity === oppCity) {
      locationScore = 100;
    } else if (userCity && oppLocation.includes(userCity)) {
      locationScore = 85;
    } else if (oppLocation.includes('brasil') || oppLocation.includes('br')) {
      locationScore = 70;
    } else if (oppLocation.includes('remote') || oppLocation.includes('online')) {
      locationScore = 75;
    } else {
      locationScore = 50;
    }
  }
  
  // 6. AVAILABILITY SCORE (0-100)
  let availabilityScore = 60;
  if (userAvailability.length > 0) {
    const availLower = userAvailability.toLowerCase();
    if (availLower.includes('flexível') || availLower.includes('qualquer')) {
      availabilityScore = 100;
    } else if (availLower.includes('fim de semana') && (oppDescription.includes('sábado') || oppDescription.includes('domingo'))) {
      availabilityScore = 90;
    } else if (availLower.includes('noite') && oppDescription.includes('noite')) {
      availabilityScore = 85;
    } else if (availLower.includes('tarde') && oppDescription.includes('tarde')) {
      availabilityScore = 80;
    } else if (availLower.includes('manhã') && oppDescription.includes('manhã')) {
      availabilityScore = 80;
    }
  }
  
  return {
    skillScore: Math.round(skillScore),
    interestScore: Math.round(interestScore),
    keywordScore: Math.round(keywordScore),
    descriptionScore: Math.round(descriptionScore),
    locationScore: Math.round(locationScore),
    availabilityScore: Math.round(availabilityScore)
  };
}

function findMatchedSkillsDetailed(userSkills: string[], userDescription: string, opportunity: any): string[] {
  const matched: string[] = [];
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  // Match com skills
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  // Se poucas skills, buscar na descrição
  if (matched.length < 2 && userDescription.length > 0) {
    const importantWords = userDescription.split(/\s+/).filter(w => w.length > 5);
    for (const word of importantWords.slice(0, 10)) {
      if (oppText.includes(word.toLowerCase()) && !matched.includes(word)) {
        matched.push(word.substring(0, 20));
        if (matched.length >= 3) break;
      }
    }
  }
  
  // Sugestões baseadas no tema se necessário
  if (matched.length === 0 && opportunity.theme) {
    const suggestions: { [key: string]: string[] } = {
      'Educação': ['Ensinar', 'Comunicar-se bem', 'Planejar atividades', 'Paciência'],
      'Saúde': ['Atendimento', 'Empatia', 'Organização', 'Trabalho em equipe'],
      'Meio Ambiente': ['Conscientização', 'Organização', 'Trabalho externo', 'Proatividade'],
      'Social': ['Comunicação', 'Escuta ativa', 'Empatia', 'Resolução de problemas'],
      'Tecnologia': ['Informática', 'Resolução de problemas', 'Aprendizado rápido', 'Lógica'],
      'Cultura': ['Criatividade', 'Comunicação', 'Organização de eventos', 'Artes'],
      'Animais': ['Cuidado com animais', 'Paciência', 'Responsabilidade', 'Compaixão'],
      'Crianças': ['Criatividade', 'Paciência', 'Dinamismo', 'Responsabilidade'],
      'Esportes': ['Atividade física', 'Trabalho em equipe', 'Liderança', 'Motivação']
    };
    
    const suggestion = suggestions[opportunity.theme];
    if (suggestion) return suggestion;
    return ['Comunicação', 'Trabalho em equipe', 'Comprometimento', 'Proatividade'];
  }
  
  return matched;
}

function generateDetailedReasoning(score: number, matchedSkills: string[], opportunity: any, userProfile: UserProfile): string {
  const title = opportunity.title.length > 50 ? opportunity.title.substring(0, 50) + '...' : opportunity.title;
  
  if (score >= 85) {
    if (matchedSkills.length >= 2) {
      return `🔥 Match excepcional! Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são perfeitamente alinhadas com o projeto "${title}". Você está pronto para fazer a diferença!`;
    } else if (matchedSkills.length === 1) {
      return `⭐ Excelente compatibilidade! Sua experiência em ${matchedSkills[0]} é exatamente o que este projeto precisa. Candidate-se agora!`;
    }
    return `🎯 Perfeito! Seu perfil se destaca para esta oportunidade. As características que você possui são muito valorizadas neste projeto.`;
  } else if (score >= 70) {
    if (matchedSkills.length >= 1) {
      return `👍 Ótimo match! Sua habilidade em ${matchedSkills[0]} será muito útil. Você tem um perido muito alinhado com as necessidades deste projeto.`;
    }
    return `💡 Boa oportunidade! Seu perfil se encaixa bem com o que o projeto "${title}" está procurando. Vale a pena conhecer mais.`;
  } else if (score >= 50) {
    if (matchedSkills.length >= 1) {
      return `📌 Compatibilidade positiva. Sua experiência em ${matchedSkills[0]} é relevante, e esta oportunidade pode te ajudar a desenvolver novas competências valiosas.`;
    }
    return `🌱 Oportunidade interessante para crescimento. Seu perfil tem potencial para contribuir e aprender muito neste projeto.`;
  } else {
    return `🔄 Chance de desenvolvimento. Embora seja uma área diferente da sua experiência atual, este projeto oferece ótimas oportunidades de aprendizado e expansão de habilidades.`;
  }
}

function generateDetailedRecommendation(score: number, matchedSkills: string[], opportunity: any): string {
  if (score >= 85) {
    if (matchedSkills.length >= 2) {
      return `🎉 RECOMENDAÇÃO FORTÍSSIMA: Candidate-se AGORA! Este projeto foi feito para você. Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são exatamente o que eles buscam.`;
    }
    return `🏆 RECOMENDAÇÃO EXCELENTE: Não perca esta oportunidade! Seu perfil está perfeitamente alinhado com o que o projeto precisa.`;
  } else if (score >= 70) {
    if (matchedSkills.length >= 1) {
      return `✨ RECOMENDAÇÃO POSITIVA: Vale muito a pena se candidatar. Sua experiência em ${matchedSkills[0]} será muito valorizada neste projeto.`;
    }
    return `✅ RECOMENDAÇÃO: Ótima oportunidade alinhada ao seu perfil. Considere seriamente se candidatar.`;
  } else if (score >= 50) {
    return `📋 RECOMENDAÇÃO: Boa oportunidade para aplicar seus conhecimentos e crescer profissionalmente. Vale a pena conhecer mais detalhes.`;
  } else {
    return `🌟 RECOMENDAÇÃO: Uma chance valiosa de aprendizado e desenvolvimento de novas competências. Pode ser uma experiência enriquecedora.`;
  }
}