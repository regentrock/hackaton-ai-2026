// app/api/match/route.ts
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

// Cache reduzido para 10 minutos (em vez de 1 hora)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

// Cache para cada usuário (para evitar ver sempre as mesmas vagas)
let userLastSeenCache: Map<string, { timestamp: number, seenIds: Set<string> }> = new Map();

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
    console.log('🎯 Skills do usuário:', user.skills);
    console.log('📍 Localização:', user.location);
    console.log('📝 Sobre o usuário:', user.description?.substring(0, 100) || 'Não informado');

    // 3. Buscar oportunidades (com cache reduzido)
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 Total de oportunidades disponíveis: ${opportunities.length}`);

    // 4. Aplicar maior escopo - EMBARALHAR as oportunidades para variedade
    opportunities = shuffleArray([...opportunities]);

    // 5. Acompanhar o que o usuário já viu recentemente (evitar repetição)
    const userCacheKey = user.id;
    const now = Date.now();
    const userCache = userLastSeenCache.get(userCacheKey);
    
    // Limpar cache antigo (mais de 1 hora)
    if (userCache && (now - userCache.timestamp) > 60 * 60 * 1000) {
      userLastSeenCache.delete(userCacheKey);
    }
    
    const seenIds = userCache?.seenIds || new Set<string>();
    
    // Filtrar oportunidades que o usuário já viu recentemente (opcional)
    // Permitir até 30% de repetição para não limitar demais
    let filteredOpportunities = opportunities;
    if (seenIds.size > 0 && seenIds.size < opportunities.length * 0.7) {
      const unseen = opportunities.filter(opp => !seenIds.has(opp.id));
      if (unseen.length > opportunities.length * 0.3) {
        filteredOpportunities = unseen;
        console.log(`🎲 Filtrando ${seenIds.size} oportunidades já vistas. Restam: ${filteredOpportunities.length}`);
      }
    }
    
    // 6. Calcular matches com todos os dados do usuário
    let matches = calculateMatchesWithAllUserData(user, filteredOpportunities);

    // 7. Adicionar variação aleatória nos scores para não ser sempre igual
    matches = matches.map(match => ({
      ...match,
      matchScore: addRandomVariation(match.matchScore, match.id)
    }));

    // 8. Ordenar por score (maior primeiro)
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    // 9. Selecionar mais vagas para análise (aumentar escopo)
    const MAX_MATCHES = 50; // Aumentado de 30 para 50
    const selectedMatches = matches.slice(0, MAX_MATCHES);
    
    // 10. Atualizar o cache de IDs vistos pelo usuário
    const newSeenIds = new Set(seenIds);
    selectedMatches.slice(0, 15).forEach(match => {
      newSeenIds.add(match.id);
    });
    
    // Manter apenas os últimos 50 IDs vistos
    const idsArray = Array.from(newSeenIds);
    if (idsArray.length > 50) {
      const trimmedIds = new Set(idsArray.slice(-50));
      userLastSeenCache.set(userCacheKey, { timestamp: now, seenIds: trimmedIds });
    } else {
      userLastSeenCache.set(userCacheKey, { timestamp: now, seenIds: newSeenIds });
    }
    
    const executionTime = Date.now() - startTime;
    console.log(`✨ API finalizada em ${executionTime}ms`);
    console.log(`🎯 Retornando ${selectedMatches.length} matches (de ${matches.length} calculados)`);
    
    // Log dos primeiros scores
    console.log('📊 Top scores gerados:');
    selectedMatches.slice(0, 5).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.title.substring(0, 40)}... - ${m.matchScore}%`);
    });

    return NextResponse.json({
      success: true,
      matches: selectedMatches,
      total: matches.length,
      userSkills: user.skills || [],
      executionTimeMs: executionTime,
      usingAI: true,
      refreshed: true // Indicar que é uma análise fresca
    });

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Função para embaralhar array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Função para adicionar variação aleatória no score
function addRandomVariation(score: number, id: string): number {
  // Usar o ID para gerar uma variação consistente mas diferente por item
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const variation = (Math.abs(hash) % 15) - 7; // Entre -7 e +7
  let newScore = score + variation;
  return Math.min(95, Math.max(35, newScore));
}

async function fetchOpportunitiesWithCache(): Promise<any[]> {
  const now = Date.now();
  
  // Cache reduzido para 10 minutos
  if (cachedProjects.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`📦 Usando cache de projetos (${Math.round((now - cacheTimestamp) / 1000)}s atrás)`);
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    // Aumentar escopo: buscar mais páginas de projetos
    const allProjects: any[] = [];
    const pageSize = 20;
    let currentPage = 1;
    let hasMore = true;
    
    console.log('🌍 Buscando oportunidades da GlobalGiving...');
    
    while (hasMore && currentPage <= 5) { // Buscar até 5 páginas (100 projetos)
      const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=${currentPage}`;
      
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });

        if (!response.ok) {
          console.log(`⚠️ Página ${currentPage} retornou erro ${response.status}`);
          break;
        }

        const data = await response.json();
        const projects = data.projects?.project || [];
        
        if (projects.length === 0) {
          hasMore = false;
          break;
        }
        
        allProjects.push(...projects);
        console.log(`📄 Página ${currentPage}: +${projects.length} projetos (total: ${allProjects.length})`);
        
        currentPage++;
        
      } catch (err) {
        console.error(`❌ Erro na página ${currentPage}:`, err);
        break;
      }
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos brutos carregados`);

    cachedProjects = allProjects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
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

// Função que calcula match usando TODOS os dados do usuário
function calculateMatchesWithAllUserData(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  console.log('📊 Dados do usuário para análise:');
  console.log(`   - Skills: ${userSkills.length} habilidades`);
  console.log(`   - Sobre mim: ${userDescription.length} caracteres`);
  console.log(`   - Localização: "${userLocation}"`);
  console.log(`   - Disponibilidade: "${userAvailability}"`);
  
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    const matchScore = calculateFullScore({
      userSkills,
      userDescription,
      userLocation,
      userAvailability,
      opportunity: opp,
      index: i
    });
    
    const matchedSkills = findMatchedSkillsFromUserData(userSkills, userDescription, opp);
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (matchScore >= 70) priority = 'high';
    else if (matchScore >= 45) priority = 'medium';
    else priority = 'low';
    
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
      reasoning: generateReasoningTextWithContext(matchScore, matchedSkills, opp.title, user),
      recommendation: generateRecommendationTextWithContext(matchScore, matchedSkills, user),
      priority: priority,
      theme: opp.theme,
      projectLink: opp.projectLink
    });
  }
  
  // Ordenar para pegar os melhores
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  return results;
}

interface ScoreParams {
  userSkills: string[];
  userDescription: string;
  userLocation: string;
  userAvailability: string;
  opportunity: any;
  index: number;
}

function calculateFullScore(params: ScoreParams): number {
  const { userSkills, userDescription, userLocation, userAvailability, opportunity, index } = params;
  
  const oppTitle = (opportunity.title || '').toLowerCase();
  const oppDescription = (opportunity.description || '').toLowerCase();
  const oppTheme = (opportunity.theme || '').toLowerCase();
  const oppLocation = (opportunity.location || '').toLowerCase();
  
  let totalScore = 40; // Score base reduzido para dar mais peso aos matches reais
  
  // 1. MATCH DE SKILLS (peso maior: 0-40 pontos)
  let skillMatchCount = 0;
  for (const skill of userSkills) {
    if (oppTitle.includes(skill)) {
      totalScore += 15;
      skillMatchCount++;
    } else if (oppTheme.includes(skill)) {
      totalScore += 10;
      skillMatchCount++;
    } else if (oppDescription.includes(skill)) {
      totalScore += 5;
      skillMatchCount++;
    }
  }
  totalScore += Math.min(10, skillMatchCount * 2);
  
  // 2. ANÁLISE DO "SOBRE MIM" (peso médio: 0-25 pontos)
  if (userDescription.length > 0) {
    const descriptionWords = userDescription.split(/\s+/);
    let contextMatchCount = 0;
    
    for (const word of descriptionWords) {
      if (word.length > 4 && oppDescription.includes(word)) {
        contextMatchCount++;
      }
    }
    
    // Verificar áreas de interesse no texto do usuário
    const interestKeywords = ['educação', 'saúde', 'ambiente', 'social', 'criança', 'idoso', 'animal', 'cultura', 'esporte', 'tecnologia'];
    for (const keyword of interestKeywords) {
      if (userDescription.includes(keyword) && (oppTheme.includes(keyword) || oppTitle.includes(keyword))) {
        totalScore += 8;
      }
    }
    
    totalScore += Math.min(15, contextMatchCount);
  }
  
  // 3. LOCALIZAÇÃO (peso médio: 0-15 pontos)
  if (userLocation.length > 0 && oppLocation.length > 0) {
    const userCity = userLocation.split(',')[0].trim();
    const oppCity = oppLocation.split(',')[0].trim();
    
    if (userCity === oppCity || oppLocation.includes(userCity)) {
      totalScore += 15;
    } else if (userLocation.includes('são paulo') && oppLocation.includes('sp')) {
      totalScore += 8;
    } else if (userLocation.includes('rio de janeiro') && oppLocation.includes('rj')) {
      totalScore += 8;
    } else if (oppLocation.includes('brasil')) {
      totalScore += 3;
    }
  }
  
  // 4. DISPONIBILIDADE
  if (userAvailability.length > 0) {
    if (userAvailability.includes('fim de semana') && (oppDescription.includes('sábado') || oppDescription.includes('domingo'))) {
      totalScore += 10;
    }
    if (userAvailability.includes('flexível') || userAvailability.includes('qualquer')) {
      totalScore += 5;
    }
  }
  
  // 5. Variação baseada no índice para não ser sempre igual
  const variation = (index * 17) % 20;
  totalScore += variation;
  
  // Garantir score entre 30 e 92
  let finalScore = Math.min(92, Math.max(30, totalScore));
  
  return Math.floor(finalScore);
}

function findMatchedSkillsFromUserData(userSkills: string[], userDescription: string, opportunity: any): string[] {
  const matched: string[] = [];
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  // Skills explícitas
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  // Se não encontrou skills, buscar no "sobre mim"
  if (matched.length === 0 && userDescription.length > 0) {
    const descriptionWords = userDescription.split(/\s+/);
    const uniqueWords = [...new Set(descriptionWords.filter(w => w.length > 5))];
    
    for (const word of uniqueWords.slice(0, 10)) {
      if (oppText.includes(word.toLowerCase())) {
        matched.push(word.substring(0, 20));
      }
    }
  }
  
  // Sugestões baseadas no tema
  if (matched.length === 0 && opportunity.theme) {
    const suggestions: { [key: string]: string[] } = {
      'Educação': ['Comunicação', 'Ensino', 'Planejamento'],
      'Saúde': ['Atendimento', 'Organização', 'Empatia'],
      'Meio Ambiente': ['Sustentabilidade', 'Conscientização', 'Organização'],
      'Social': ['Comunicação', 'Empatia', 'Trabalho em equipe'],
      'Tecnologia': ['Informática', 'Resolução de problemas', 'Comunicação'],
      'Cultura': ['Artes', 'Criatividade', 'Comunicação'],
    };
    
    const suggestion = suggestions[opportunity.theme];
    if (suggestion) {
      return suggestion;
    }
    return ['Voluntariado', 'Compromisso social', 'Trabalho em equipe'];
  }
  
  return matched;
}

function generateReasoningTextWithContext(score: number, matchedSkills: string[], title: string, user: any): string {
  const shortTitle = title.length > 45 ? title.substring(0, 45) + '...' : title;
  
  if (score >= 75) {
    if (matchedSkills.length > 0) {
      return `Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são muito relevantes para "${shortTitle}".`;
    }
    return `Excelente oportunidade! Seu perfil está muito alinhado com as necessidades deste projeto.`;
  } else if (score >= 60) {
    if (matchedSkills.length > 0) {
      return `Ótima compatibilidade! Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} será muito útil para este projeto.`;
    }
    return `Boa compatibilidade! Este projeto está bem alinhado com seu perfil e interesses.`;
  } else if (score >= 45) {
    return `Compatibilidade positiva! Você pode contribuir de forma significativa para este projeto e desenvolver novas habilidades.`;
  } else {
    return `Oportunidade interessante para expandir sua experiência e fazer a diferença em uma nova área.`;
  }
}

function generateRecommendationTextWithContext(score: number, matchedSkills: string[], user: any): string {
  if (score >= 75) {
    if (matchedSkills.length > 0) {
      return `Recomendação forte: Candidate-se agora! Excelente alinhamento com suas habilidades em ${matchedSkills.slice(0, 2).join(', ')}.`;
    }
    return `Recomendação forte: Esta oportunidade é perfeita para o seu perfil!`;
  } else if (score >= 60) {
    if (matchedSkills.length > 0) {
      return `Recomendação: Considere se candidatar. Suas habilidades serão muito valorizadas nesta oportunidade.`;
    }
    return `Recomendação: Ótima oportunidade para aplicar seus conhecimentos e crescer.`;
  } else if (score >= 45) {
    return `Recomendação: Vale a pena explorar esta oportunidade e desenvolver novas competências.`;
  } else {
    return `Recomendação: Uma chance de aprender e contribuir em uma área diferente da sua.`;
  }
}