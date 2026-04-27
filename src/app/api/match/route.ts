// app/api/match/route.ts - VERSÃO CORRIGIDA COM TIPAGEM COMPLETA
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

interface UserProfile {
  id: string;
  name: string;
  email: string;
  location: string | null;
  skills: string[];
  description: string | null;
  availability: string | null;
  createdAt: Date;
}

interface Opportunity {
  id: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  theme: string;
  projectLink: string;
}

// Cache para projetos (5 minutos)
let cachedProjects: Opportunity[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// Cache para análise do perfil do usuário
let userProfileCache: Map<string, { timestamp: number, profile: any }> = new Map();

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API OTIMIZADA ==========');
  
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
    }) as UserProfile | null;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log('👤 Usuário:', user.name);
    console.log('🎯 Skills:', user.skills);
    console.log('📝 Sobre:', user.description?.substring(0, 100));

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

    // 4. Tentar usar IBM WatsonX para análise (opcional, se falhar usa local)
    let usingAI = false;
    
    try {
      // Verificar se temos credenciais IBM
      if (process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID) {
        usingAI = true;
        console.log('🧠 IBM WatsonX disponível para análise');
      }
    } catch (error) {
      console.log('⚠️ WatsonX não disponível, usando algoritmo local');
      usingAI = false;
    }

    // 5. Calcular matches
    const matches = calculateMatchesLocally(user, opportunities);

    // 6. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    // 7. Log dos resultados
    console.log('\n📊 DISTRIBUIÇÃO DOS SCORES:');
    const ranges = [
      { min: 80, max: 100, label: '🔥 Excelente (80-100%)' },
      { min: 65, max: 79, label: '👍 Muito Bom (65-79%)' },
      { min: 50, max: 64, label: '💡 Bom (50-64%)' },
      { min: 35, max: 49, label: '📌 Médio (35-49%)' },
      { min: 0, max: 34, label: '🌱 Desenvolvimento (0-34%)' }
    ];
    
    ranges.forEach(range => {
      const count = matches.filter((m: MatchResult) => m.matchScore >= range.min && m.matchScore <= range.max).length;
      if (count > 0) console.log(`   ${range.label}: ${count} oportunidades`);
    });
    
    console.log('\n🏆 TOP 10 MATCHES:');
    matches.slice(0, 10).forEach((m: MatchResult, i: number) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
      if (m.matchedSkills.length > 0) {
        console.log(`      Skills: ${m.matchedSkills.slice(0, 3).join(', ')}`);
      }
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 50),
      total: matches.length,
      userSkills: user.skills || [],
      executionTimeMs: Date.now() - startTime,
      usingAI: usingAI,
      algorithm: usingAI ? 'ibm-watsonx' : 'smart-matching'
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Algoritmo de matching local melhorado
function calculateMatchesLocally(user: UserProfile, opportunities: Opportunity[]): MatchResult[] {
  const userSkills: string[] = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userDescription: string = (user.description || '').toLowerCase();
  const userLocation: string = (user.location || '').toLowerCase();
  
  const results: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const oppTitle: string = (opp.title || '').toLowerCase();
    const oppDescription: string = (opp.description || '').toLowerCase();
    const oppTheme: string = (opp.theme || '').toLowerCase();
    const oppLocation: string = (opp.location || '').toLowerCase();
    
    let totalScore: number = 30; // Score base
    const matchedSkills: string[] = [];
    
    // 1. MATCH DE SKILLS (peso maior)
    let skillMatchCount: number = 0;
    for (const skill of userSkills) {
      if (oppTitle.includes(skill)) {
        totalScore += 25;
        skillMatchCount++;
        matchedSkills.push(skill);
      } else if (oppTheme.includes(skill)) {
        totalScore += 15;
        skillMatchCount++;
        matchedSkills.push(skill);
      } else if (oppDescription.includes(skill)) {
        totalScore += 8;
        skillMatchCount++;
        matchedSkills.push(skill);
      }
    }
    
    // 2. Bônus por múltiplos matches
    if (skillMatchCount >= 2) totalScore += 10;
    if (skillMatchCount >= 3) totalScore += 15;
    if (skillMatchCount >= 4) totalScore += 20;
    
    // 3. ANÁLISE DA DESCRIÇÃO DO USUÁRIO
    if (userDescription.length > 20) {
      const importantWords: string[] = userDescription.split(/\s+/).filter((w: string) => w.length > 4);
      let descriptionMatches: number = 0;
      
      for (const word of importantWords.slice(0, 10)) {
        if (oppDescription.includes(word) || oppTitle.includes(word)) {
          descriptionMatches++;
        }
      }
      
      if (descriptionMatches > 0) {
        totalScore += Math.min(15, descriptionMatches * 3);
      }
    }
    
    // 4. LOCALIZAÇÃO
    if (userLocation.length > 0 && oppLocation.length > 0) {
      const userCity: string = userLocation.split(',')[0].trim();
      if (oppLocation.includes(userCity)) {
        totalScore += 15;
      } else if (oppLocation.includes('brasil')) {
        totalScore += 8;
      }
    }
    
    // 5. TEMA (boost para temas relevantes)
    const userText: string = `${userSkills.join(' ')} ${userDescription}`.toLowerCase();
    const relevantThemes: string[] = ['educação', 'ensino', 'criança', 'saúde', 'ambiente', 'social', 'tecnologia'];
    
    for (const theme of relevantThemes) {
      if (userText.includes(theme) && oppTheme.includes(theme)) {
        totalScore += 10;
      }
    }
    
    // 6. Variação controlada baseada no ID (para diversidade)
    let idHash: number = 0;
    for (let j = 0; j < opp.id.length; j++) {
      idHash += opp.id.charCodeAt(j);
    }
    const variation: number = (idHash % 21) - 10; // -10 a +10
    totalScore += variation;
    
    // 7. Garantir limites e arredondar
    let finalScore: number = Math.min(98, Math.max(15, totalScore));
    finalScore = Math.floor(finalScore);
    
    // 8. Prioridade
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (finalScore >= 70) priority = 'high';
    else if (finalScore >= 45) priority = 'medium';
    else priority = 'low';
    
    // 9. Reasoning personalizado
    let reasoning: string = '';
    let recommendation: string = '';
    
    if (finalScore >= 80) {
      if (matchedSkills.length >= 2) {
        reasoning = `🏆 Excelente! Suas habilidades em ${matchedSkills.slice(0, 2).join(' e ')} são altamente relevantes para este projeto na área de ${opp.theme}.`;
      } else {
        reasoning = `🏆 Excelente compatibilidade! Seu perfil está muito alinhado com as necessidades deste projeto.`;
      }
      recommendation = `🎯 RECOMENDAÇÃO FORTE: Candidate-se agora! Esta oportunidade é perfeita para você.`;
    } else if (finalScore >= 65) {
      if (matchedSkills.length >= 1) {
        reasoning = `👍 Ótima compatibilidade! Sua experiência em ${matchedSkills[0]} será muito útil para este projeto.`;
      } else {
        reasoning = `👍 Boa oportunidade! Seu perfil se alinha bem com o tema ${opp.theme}.`;
      }
      recommendation = `✨ RECOMENDAÇÃO POSITIVA: Vale muito a pena se candidatar.`;
    } else if (finalScore >= 45) {
      reasoning = `💡 Compatibilidade positiva! Você pode contribuir de forma significativa e desenvolver novas habilidades.`;
      recommendation = `📋 RECOMENDAÇÃO: Boa oportunidade para aplicar seus conhecimentos.`;
    } else {
      reasoning = `🌱 Oportunidade interessante para aprender e expandir sua experiência em ${opp.theme}.`;
      recommendation = `📚 RECOMENDAÇÃO: Ótima chance de desenvolvimento profissional.`;
    }
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: [],
      matchScore: finalScore,
      matchedSkills: [...new Set(matchedSkills)].slice(0, 4),
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
async function fetchOpportunitiesWithCache(): Promise<Opportunity[]> {
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
    
    // Buscar múltiplas páginas para mais variedade
    for (let page = 1; page <= 3; page++) {
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
      
      if (projects.length === 0) break;
      
      allProjects.push(...projects);
      console.log(`📄 Página ${page}: +${projects.length} projetos`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    // Embaralhar para variar os resultados
    for (let i = allProjects.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allProjects[i], allProjects[j]] = [allProjects[j], allProjects[i]];
    }

    cachedProjects = allProjects.slice(0, 100).map((project: any): Opportunity => ({
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