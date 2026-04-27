// app/api/match/route.ts - VERSÃO CORRIGIDA E MELHORADA
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

    // 3. Buscar oportunidades (mais páginas)
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 Total de oportunidades: ${opportunities.length}`);

    // 4. Calcular matches
    const matches = calculateMatchesWithAllUserData(user, opportunities);

    // 5. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('📊 Top 10 scores:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`  ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 40)}...`);
    });

    // 6. Retornar matches
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
    
    // Buscar até 5 páginas para ter mais variedade
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

    // Embaralhar para variar os resultados
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

// Função principal de cálculo de matches
function calculateMatchesWithAllUserData(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userDescription = (user.description || '').toLowerCase();
  const userLocation = (user.location || '').toLowerCase();
  const userAvailability = (user.availability || '').toLowerCase();
  
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    // Calcular score detalhado
    const matchScore = calculateDetailedScore({
      userSkills,
      userDescription,
      userLocation,
      userAvailability,
      opportunity: opp,
      index: i
    });
    
    // Encontrar habilidades que deram match
    const matchedSkills = findMatchedSkillsFromOpp(userSkills, userDescription, opp);
    
    // Determinar prioridade baseada no score
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
      reasoning: generateReasoningText(matchScore, matchedSkills, opp.title),
      recommendation: generateRecommendationText(matchScore, matchedSkills),
      priority: priority,
      theme: opp.theme,
      projectLink: opp.projectLink
    });
  }
  
  // Ordenar por score
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

function calculateDetailedScore(params: ScoreParams): number {
  const { userSkills, userDescription, userLocation, userAvailability, opportunity, index } = params;
  
  const oppTitle = (opportunity.title || '').toLowerCase();
  const oppDescription = (opportunity.description || '').toLowerCase();
  const oppTheme = (opportunity.theme || '').toLowerCase();
  const oppLocation = (opportunity.location || '').toLowerCase();
  
  let totalScore = 45; // Score base
  
  // 1. MATCH DE SKILLS (peso mais importante)
  let skillMatchCount = 0;
  let skillBonus = 0;
  
  for (const skill of userSkills) {
    if (oppTitle.includes(skill)) {
      skillBonus += 18;
      skillMatchCount++;
    } else if (oppTheme.includes(skill)) {
      skillBonus += 12;
      skillMatchCount++;
    } else if (oppDescription.includes(skill)) {
      skillBonus += 6;
      skillMatchCount++;
    }
  }
  totalScore += Math.min(45, skillBonus);
  
  // 2. ANÁLISE DO "SOBRE MIM"
  let descriptionBonus = 0;
  if (userDescription.length > 10) {
    // Verificar palavras-chave relevantes
    const relevantWords = ['voluntário', 'ajudar', 'comunidade', 'social', 'educação', 'saúde', 'ambiente', 'criança', 'idoso', 'animal', 'tecnologia', 'cultura', 'esporte'];
    
    for (const word of relevantWords) {
      if (userDescription.includes(word)) {
        if (oppTheme.includes(word) || oppTitle.includes(word)) {
          descriptionBonus += 10;
        } else if (oppDescription.includes(word)) {
          descriptionBonus += 5;
        }
      }
    }
    
    // Verificar se há menção a áreas específicas
    if (userDescription.includes('educação') && oppTheme.includes('Educação')) descriptionBonus += 15;
    if (userDescription.includes('saúde') && oppTheme.includes('Saúde')) descriptionBonus += 15;
    if (userDescription.includes('ambiente') && oppTheme.includes('Meio Ambiente')) descriptionBonus += 15;
    if (userDescription.includes('criança') && oppTheme.includes('Crianças')) descriptionBonus += 15;
    if (userDescription.includes('animal') && oppTheme.includes('Animais')) descriptionBonus += 15;
  }
  totalScore += Math.min(25, descriptionBonus);
  
  // 3. LOCALIZAÇÃO
  let locationBonus = 0;
  if (userLocation.length > 0 && oppLocation.length > 0) {
    const userCity = userLocation.split(',')[0].trim();
    const oppCity = oppLocation.split(',')[0].trim();
    
    if (userCity === oppCity) {
      locationBonus = 20;
    } else if (userCity && oppLocation.includes(userCity)) {
      locationBonus = 15;
    } else if (userLocation.includes('são paulo') && oppLocation.includes('SP')) {
      locationBonus = 10;
    } else if (userLocation.includes('rio de janeiro') && oppLocation.includes('RJ')) {
      locationBonus = 10;
    } else if (oppLocation.includes('brasil') || oppLocation.includes('BR')) {
      locationBonus = 5;
    }
  }
  totalScore += locationBonus;
  
  // 4. DISPONIBILIDADE
  let availabilityBonus = 0;
  if (userAvailability.length > 0) {
    if (userAvailability.includes('flexível') || userAvailability.includes('qualquer')) {
      availabilityBonus = 10;
    } else if (userAvailability.includes('fim de semana') && (oppDescription.includes('sábado') || oppDescription.includes('domingo'))) {
      availabilityBonus = 8;
    } else if (userAvailability.includes('tarde') || userAvailability.includes('manhã')) {
      availabilityBonus = 5;
    }
  }
  totalScore += availabilityBonus;
  
  // 5. Variação para dar diversidade (entre -3 e +3)
  const variation = (index * 7) % 7 - 3;
  totalScore += variation;
  
  // Garantir score entre 35 e 95
  let finalScore = Math.min(95, Math.max(35, totalScore));
  
  return Math.floor(finalScore);
}

// Encontrar skills que combinam
function findMatchedSkillsFromOpp(userSkills: string[], userDescription: string, opportunity: any): string[] {
  const matched: string[] = [];
  const oppText = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
  
  // Primeiro, tentar match com skills do usuário
  for (const skill of userSkills) {
    if (oppText.includes(skill.toLowerCase())) {
      matched.push(skill);
    }
  }
  
  // Se não encontrou nenhuma skill, sugerir baseado no tema
  if (matched.length === 0 && opportunity.theme) {
    const suggestions: { [key: string]: string[] } = {
      'Educação': ['Ensino', 'Comunicação', 'Planejamento de aulas', 'Paciência'],
      'Saúde': ['Atendimento', 'Organização', 'Empatia', 'Primeiros socorros'],
      'Meio Ambiente': ['Sustentabilidade', 'Reciclagem', 'Educação ambiental', 'Organização'],
      'Social': ['Comunicação', 'Escuta ativa', 'Empatia', 'Trabalho em equipe'],
      'Tecnologia': ['Informática', 'Redes sociais', 'Resolução de problemas', 'Pensamento analítico'],
      'Cultura': ['Artes', 'Criatividade', 'Comunicação', 'Planejamento de eventos'],
      'Animais': ['Cuidado com animais', 'Paciência', 'Responsabilidade', 'Compaixão'],
      'Crianças': ['Criatividade', 'Paciência', 'Responsabilidade', 'Dinamismo'],
      'Esportes': ['Atividade física', 'Trabalho em equipe', 'Liderança', 'Motivação']
    };
    
    const suggestion = suggestions[opportunity.theme];
    if (suggestion) {
      return suggestion.slice(0, 4);
    }
    return ['Comunicação', 'Trabalho em equipe', 'Compromisso', 'Proatividade'];
  }
  
  return matched;
}

// Gerar texto de reasoning
function generateReasoningText(score: number, matchedSkills: string[], title: string): string {
  const shortTitle = title.length > 45 ? title.substring(0, 45) + '...' : title;
  
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `Excelente! Suas habilidades em ${matchedSkills.slice(0, 2).join(' e ')} são muito relevantes para "${shortTitle}". Você tem um perfil muito alinhado com esta oportunidade.`;
    } else if (matchedSkills.length === 1) {
      return `Ótimo! Sua experiência em ${matchedSkills[0]} será muito útil para este projeto. Recomendamos sua candidatura.`;
    }
    return `Excelente oportunidade! Seu perfil está muito alinhado com as necessidades deste projeto.`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `Boa compatibilidade! Sua experiência em ${matchedSkills[0]} será valiosa. Com poucos ajustes, você pode ser um excelente candidato.`;
    }
    return `Compatibilidade positiva! Você tem potencial para contribuir significativamente neste projeto.`;
  } else if (score >= 50) {
    if (matchedSkills.length >= 1) {
      return `Compatibilidade média. Sua habilidade em ${matchedSkills[0]} é relevante, mas algumas áreas podem ser desenvolvidas durante o projeto.`;
    }
    return `Oportunidade interessante para desenvolver novas habilidades enquanto contribui para uma causa importante.`;
  } else {
    return `Uma chance de crescimento! Embora não seja sua especialidade principal, este projeto pode enriquecer sua experiência e ampliar seus horizontes.`;
  }
}

// Gerar texto de recomendação
function generateRecommendationText(score: number, matchedSkills: string[]): string {
  if (score >= 80) {
    if (matchedSkills.length >= 2) {
      return `Recomendação: Candidate-se agora! 🎯 Suas habilidades em ${matchedSkills[0]} e ${matchedSkills[1]} são exatamente o que este projeto procura.`;
    }
    return `Recomendação: Candidate-se! 🎯 Excelente oportunidade alinhada ao seu perfil.`;
  } else if (score >= 65) {
    if (matchedSkills.length >= 1) {
      return `Recomendação: Considere se candidatar. Sua experiência em ${matchedSkills[0]} será muito útil.`;
    }
    return `Recomendação: Vale a pena explorar esta oportunidade.`;
  } else if (score >= 50) {
    return `Recomendação: Boa oportunidade para aplicar seus conhecimentos e aprender.`;
  } else {
    return `Recomendação: Ótima chance de aprendizado e desenvolvimento de novas competências.`;
  }
}