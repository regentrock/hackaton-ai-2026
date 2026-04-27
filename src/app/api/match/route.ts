// app/api/match/route.ts - VERSÃO COM MATCHING INTELIGENTE
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

// Cache por usuário para evitar repetição
let userSessionCache: Map<string, { timestamp: number, recentIds: string[] }> = new Map();

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
    console.log('📍 Localização:', user.location);
    console.log('📝 Sobre mim:', user.description?.substring(0, 200) || 'Não informado');
    console.log('⏰ Disponibilidade:', user.availability || 'Não informado');

    // 3. Buscar oportunidades
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades disponíveis`);

    // 4. Calcular matches com algoritmo inteligente
    const matches = calculateIntelligentMatches(user, opportunities);

    // 5. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    // 6. Aplicar variação para evitar sempre os mesmos resultados
    const shuffledMatches = addUserVariation(matches, user.id);

    // 7. Selecionar top matches (aumentado para 50)
    const topMatches = shuffledMatches.slice(0, 50);
    
    // 8. Atualizar cache do usuário
    updateUserCache(user.id, topMatches.slice(0, 20));

    const executionTime = Date.now() - startTime;
    console.log(`✅ API finalizada em ${executionTime}ms`);
    console.log(`🎯 Retornando ${topMatches.length} matches`);

    return NextResponse.json({
      success: true,
      matches: topMatches,
      total: topMatches.length,
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
    console.log(`📦 Cache ativo (${Math.round((now - cacheTimestamp) / 1000)}s)`);
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    // Buscar múltiplas páginas
    for (let page = 1; page <= 4; page++) {
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
    
    console.log(`📡 Total: ${allProjects.length} projetos carregados`);

    cachedProjects = allProjects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: (project.summary || project.description || '').substring(0, 500),
      theme: project.themeName || 'Voluntariado',
      projectLink: project.projectLink,
      // Extrair palavras-chave do título e descrição
      keywords: extractKeywords(`${project.title} ${project.themeName || ''}`)
    }));
    
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

// Extrair palavras-chave relevantes
function extractKeywords(text: string): string[] {
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'with', 'by', 'from', 'up', 'down', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'that', 'then', 'these', 'those', 'through', 'until', 'unto', 'upon', 've', 'very', 'just', 'but', 'do', 'does', 'doing', 'did'];
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w));
  
  return [...new Set(words)].slice(0, 15);
}

// Algoritmo principal de matching inteligente
function calculateIntelligentMatches(user: any, opportunities: any[]): MatchResult[] {
  const results: MatchResult[] = [];
  
  // Preparar dados do usuário
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  // Extrair interesses do usuário a partir da descrição
  const userInterests = extractInterestsFromText(userDescription);
  const userKeywords = extractKeywords(userDescription);
  
  console.log('🔍 Interesses detectados:', userInterests);
  console.log('🔑 Palavras-chave do perfil:', userKeywords.slice(0, 10));
  
  // Categorias de voluntariado para matching semântico
  const categoryKeywords: Record<string, string[]> = {
    'educação': ['educação', 'ensino', 'escola', 'criança', 'estudante', 'alfabetização', 'professor', 'aprendizagem', 'didática', 'pedagogia', 'cursinho', 'aula', 'mentoria'],
    'saúde': ['saúde', 'hospital', 'médico', 'enfermagem', 'paciente', 'bem-estar', 'doença', 'tratamento', 'cuidado', 'saúde mental', 'psicologia', 'bem estar'],
    'meio ambiente': ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem', 'natureza', 'floresta', 'água', 'clima', 'resíduo', 'preservação', 'animais', 'fauna', 'flora'],
    'social': ['social', 'comunidade', 'assistência', 'moradia', 'fome', 'pobreza', 'vulnerável', 'inclusão', 'direitos', 'cidadania', 'família', 'desigualdade'],
    'crianças': ['criança', 'infantil', 'menor', 'adolescente', 'jovem', 'educação', 'brincar', 'desenvolvimento infantil'],
    'idosos': ['idoso', 'terceira idade', 'envelhecimento', 'aposentado', 'melhor idade', 'geriátrico', 'cuidado de idosos'],
    'animais': ['animal', 'pet', 'bicho', 'fauna', 'proteção animal', 'abrigo', 'resgate animal', 'veterinário', 'cão', 'gato'],
    'tecnologia': ['tecnologia', 'programação', 'site', 'app', 'software', 'informática', 'digital', 'computador', 'internet', 'desenvolvimento', 'ti', 'sistema'],
    'cultura': ['cultura', 'arte', 'música', 'teatro', 'dança', 'patrimônio', 'histórico', 'tradição', 'oficina cultural', 'evento cultural'],
    'esportes': ['esporte', 'atividade física', 'futebol', 'prática esportiva', 'lazer', 'recreação', 'saúde', 'exercício'],
    'emergência': ['emergência', 'desastre', 'enchente', 'incêndio', 'resgate', 'crise', 'urgência', 'ajuda humanitária', 'defesa civil']
  };
  
  for (const opp of opportunities) {
    // Calcular vários componentes do match
    const skillScore = calculateSkillMatch(userSkills, opp);
    const interestScore = calculateInterestMatch(userInterests, opp, categoryKeywords);
    const keywordScore = calculateKeywordMatch(userKeywords, opp);
    const locationScore = calculateLocationMatch(userLocation, opp.location);
    const availabilityScore = calculateAvailabilityMatch(userAvailability, opp);
    
    // Peso diferenciado para cada componente
    let totalScore = 0;
    totalScore += skillScore * 0.35;        // 35% habilidades
    totalScore += interestScore * 0.30;     // 30% interesses
    totalScore += keywordScore * 0.20;      // 20% palavras-chave
    totalScore += locationScore * 0.10;     // 10% localização
    totalScore += availabilityScore * 0.05; // 5% disponibilidade
    
    // Garantir score entre 25 e 98
    let finalScore = Math.min(98, Math.max(25, Math.round(totalScore)));
    
    // Skills que deram match
    const matchedSkills = findExactSkillMatches(userSkills, opp);
    
    // Determinar prioridade
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
      reasoning: generateIntelligentReasoning(finalScore, matchedSkills, opp, user),
      recommendation: generateIntelligentRecommendation(finalScore, matchedSkills, opp, user),
      priority: priority,
      theme: opp.theme,
      projectLink: opp.projectLink
    });
  }
  
  // Ordenar por score
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  return results;
}

// Calcular match de habilidades
function calculateSkillMatch(userSkills: string[], opportunity: any): number {
  if (userSkills.length === 0) return 30;
  
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  let matchCount = 0;
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matchCount++;
    }
  }
  
  const matchPercentage = (matchCount / userSkills.length) * 100;
  
  // Mínimo 30%, máximo 95%
  return Math.min(95, Math.max(30, matchPercentage));
}

// Extrair interesses do texto do usuário
function extractInterestsFromText(text: string): string[] {
  const interests: string[] = [];
  const interestCategories = ['educação', 'saúde', 'ambiente', 'social', 'crianças', 'idosos', 'animais', 'tecnologia', 'cultura', 'esportes', 'emergência'];
  
  for (const interest of interestCategories) {
    if (text.includes(interest)) {
      interests.push(interest);
    }
  }
  
  return interests;
}

// Calcular match de interesses
function calculateInterestMatch(userInterests: string[], opportunity: any, categories: Record<string, string[]>): number {
  if (userInterests.length === 0) return 40;
  
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  let matchScore = 0;
  let possibleMatches = 0;
  
  for (const interest of userInterests) {
    const keywords = categories[interest] || [interest];
    for (const keyword of keywords) {
      if (oppText.includes(keyword)) {
        matchScore += 20;
        break;
      }
    }
    possibleMatches += 20;
  }
  
  if (possibleMatches === 0) return 40;
  
  const percentage = (matchScore / possibleMatches) * 100;
  return Math.min(90, Math.max(35, percentage));
}

// Calcular match de palavras-chave
function calculateKeywordMatch(userKeywords: string[], opportunity: any): number {
  if (userKeywords.length === 0) return 35;
  
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of userKeywords) {
    if (oppText.includes(keyword)) {
      matchCount++;
    }
  }
  
  const percentage = (matchCount / userKeywords.length) * 100;
  return Math.min(85, Math.max(30, percentage));
}

// Calcular match de localização
function calculateLocationMatch(userLocation: string, oppLocation: string): number {
  if (!userLocation || userLocation.length === 0) return 50;
  if (!oppLocation) return 50;
  
  const userLower = userLocation.toLowerCase();
  const oppLower = oppLocation.toLowerCase();
  
  // Mesma cidade
  if (oppLower.includes(userLower.split(',')[0].trim()) || userLower.includes(oppLower.split(',')[0].trim())) {
    return 95;
  }
  
  // Mesmo estado
  const userState = userLower.split(',').pop()?.trim() || '';
  const oppState = oppLower.split(',').pop()?.trim() || '';
  if (userState && oppState && userState === oppState) {
    return 70;
  }
  
  // Remoto ou qualquer lugar
  if (oppLower.includes('remote') || oppLower.includes('online') || oppLower.includes('home')) {
    return 85;
  }
  
  return 50;
}

// Calcular match de disponibilidade
function calculateAvailabilityMatch(userAvailability: string, opportunity: any): number {
  if (!userAvailability || userAvailability.length === 0) return 60;
  
  const userLower = userAvailability.toLowerCase();
  const oppText = `${opportunity.title} ${opportunity.description}`.toLowerCase();
  
  if (userLower.includes('flexível') || userLower.includes('qualquer')) {
    return 90;
  }
  
  if (userLower.includes('fim de semana') && (oppText.includes('sábado') || oppText.includes('domingo') || oppText.includes('weekend'))) {
    return 85;
  }
  
  if (userLower.includes('noite') && oppText.includes('noite')) {
    return 80;
  }
  
  if (userLower.includes('manhã') && oppText.includes('manhã')) {
    return 80;
  }
  
  return 60;
}

// Encontrar matches exatos de habilidades
function findExactSkillMatches(userSkills: string[], opportunity: any): string[] {
  const matched: string[] = [];
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  return matched;
}

// Gerar reasoning inteligente
function generateIntelligentReasoning(score: number, matchedSkills: string[], opportunity: any, user: any): string {
  const title = opportunity.title.length > 50 ? opportunity.title.substring(0, 50) + '...' : opportunity.title;
  
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `🏆 Excelente! Seu perfil é extremamente compatível com "${title}". Suas habilidades em ${matchedSkills.slice(0, 2).join(' e ')} são exatamente o que o projeto precisa.`;
    }
    return `🎯 Perfeito! "${title}" está muito alinhado com seu perfil e objetivos de voluntariado. Uma oportunidade única para você!`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `👍 Ótima oportunidade! Sua experiência em ${matchedSkills[0]} será muito valiosa para este projeto.`;
    }
    return `💡 Muito bom! Seu perfil se destaca para esta oportunidade. Você tem muito a contribuir e aprender.`;
  } else if (score >= 50) {
    if (matchedSkills.length >= 1) {
      return `📌 Boa compatibilidade! Sua habilidade em ${matchedSkills[0]} é relevante. Considere se candidatar.`;
    }
    return `🔍 Oportunidade interessante! Seu perfil tem potencial para contribuir e se desenvolver neste projeto.`;
  } else {
    return `🌱 Ótima chance de crescimento! Embora não seja sua especialidade principal, este projeto pode enriquecer sua experiência.`;
  }
}

// Gerar recommendation inteligente
function generateIntelligentRecommendation(score: number, matchedSkills: string[], opportunity: any, user: any): string {
  if (score >= 80) {
    return `Recomendação Forte: Candidate-se imediatamente! Esta oportunidade foi feita para o seu perfil. 🚀`;
  } else if (score >= 65) {
    return `Recomendação Positiva: Vale muito a pena se candidatar. Suas habilidades serão muito úteis. ✨`;
  } else if (score >= 50) {
    return `Recomendação: Boa oportunidade para aplicar seus conhecimentos e aprender mais. 💡`;
  } else {
    return `Recomendação: Considere explorar esta chance para expandir seus horizontes no voluntariado. 🌟`;
  }
}

// Adicionar variação para evitar sempre os mesmos resultados
function addUserVariation(matches: MatchResult[], userId: string): MatchResult[] {
  const session = userSessionCache.get(userId);
  const now = Date.now();
  
  // Se tem sessão recente (menos de 30 min), evitar mostrar exatamente os mesmos
  if (session && (now - session.timestamp) < 30 * 60 * 1000) {
    const recentIds = new Set(session.recentIds);
    
    // Ajustar scores levemente para dar prioridade a vagas não vistas
    matches = matches.map(match => {
      if (recentIds.has(match.id)) {
        // Reduzir score em 3-7 pontos para variar
        return { ...match, matchScore: Math.max(30, match.matchScore - (Math.floor(Math.random() * 5) + 3)) };
      }
      return match;
    });
    
    // Reordenar com os novos scores
    matches.sort((a, b) => b.matchScore - a.matchScore);
  }
  
  return matches;
}

// Atualizar cache do usuário
function updateUserCache(userId: string, recentMatches: MatchResult[]) {
  userSessionCache.set(userId, {
    timestamp: Date.now(),
    recentIds: recentMatches.map(m => m.id)
  });
}

// Limpar cache antigo periodicamente (opcional)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userSessionCache.entries()) {
    if (now - value.timestamp > 60 * 60 * 1000) { // 1 hora
      userSessionCache.delete(key);
    }
  }
}, 60 * 60 * 1000);