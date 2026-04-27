import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

type Priority = 'high' | 'medium' | 'low';

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
  priority: Priority;
  theme?: string;
  projectLink?: string;
}

// Cache para projetos (10 minutos)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API COM IBM WATSONX ==========');
  
  // Obter parâmetros de paginação
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;
  
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

    // 3. Buscar MAIS oportunidades
    let allOpportunities = await fetchOpportunitiesWithCache();
    
    if (allOpportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        page: 1,
        hasMore: false,
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 Total de ${allOpportunities.length} oportunidades encontradas`);

    // 4. Analisar matches
    let allMatches: MatchResult[] = [];
    
    try {
      allMatches = await analyzeMatchesWithWatsonX(user, allOpportunities.slice(0, 80));
      console.log('✅ Análise concluída com IBM WatsonX');
    } catch (watsonxError) {
      console.error('⚠️ WatsonX falhou, usando algoritmo local:', watsonxError);
      allMatches = calculateLocalMatches(user, allOpportunities);
    }

    // 5. Ordenar por score
    allMatches.sort((a, b) => b.matchScore - a.matchScore);
    
    // 6. Paginar resultados
    const paginatedMatches = allMatches.slice(offset, offset + limit);
    const hasMore = offset + limit < allMatches.length;
    const totalPages = Math.ceil(allMatches.length / limit);
    
    console.log(`\n📊 RESULTADOS:`);
    console.log(`   📄 Página ${page} de ${totalPages}`);
    console.log(`   🎯 Mostrando ${paginatedMatches.length} de ${allMatches.length} matches`);
    console.log(`   🏆 Top score: ${allMatches[0]?.matchScore}%`);

    return NextResponse.json({
      success: true,
      matches: paginatedMatches,
      total: allMatches.length,
      page: page,
      totalPages: totalPages,
      hasMore: hasMore,
      limit: limit,
      userSkills: user.skills || [],
      executionTimeMs: Date.now() - startTime
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Obter token de acesso IBM Cloud
async function getIBMToken(): Promise<string> {
  const apiKey = process.env.IBM_API_KEY;
  
  if (!apiKey) {
    throw new Error('IBM_API_KEY não configurada');
  }
  
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey
    }).toString()
  });
  
  if (!response.ok) {
    throw new Error(`Falha ao obter token IBM: ${response.status}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

// Chamar IBM Granite 3-8B-Instruct
async function callGranite(prompt: string): Promise<string> {
  const token = await getIBMToken();
  const projectId = process.env.IBM_PROJECT_ID;
  const url = `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`;
  
  if (!projectId) {
    throw new Error('IBM_PROJECT_ID não configurada');
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      input: prompt,
      parameters: {
        max_new_tokens: 400,
        temperature: 0.3,
        top_p: 0.95,
        repetition_penalty: 1.1
      },
      model_id: 'ibm/granite-3-8b-instruct',
      project_id: projectId
    })
  });
  
  if (!response.ok) {
    throw new Error(`Granite API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.results?.[0]?.generated_text || '';
}

// Analisar matches com IBM WatsonX
async function analyzeMatchesWithWatsonX(user: any, opportunities: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const userSkills = user.skills?.join(', ') || 'Nenhuma habilidade listada';
  const userAbout = user.description || 'Voluntário interessado em ajudar';
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com IBM Granite...`);
  
  const batchSize = 5;
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const batchPromises = batch.map(async (opp, idx) => {
      const prompt = `[INST] You are a volunteer matching expert. Analyze the match.

VOLUNTEER:
- Skills: ${userSkills}
- About: ${userAbout}

OPPORTUNITY:
- Title: ${opp.title}
- Theme: ${opp.theme}
- Description: ${opp.description?.substring(0, 300)}

Return JSON only:
{
  "matchScore": number (0-100),
  "matchedSkills": ["skill1", "skill2"],
  "reasoning": "in Portuguese",
  "recommendation": "in Portuguese"
}[/INST]`;

      try {
        const response = await callGranite(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { matchScore: 65 };
        
        let score = Math.min(95, Math.max(40, (analysis.matchScore || 55) + (idx % 15)));
        let priority: Priority = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
        
        return {
          id: opp.id,
          title: opp.title,
          organization: opp.organization,
          location: opp.location,
          description: opp.description?.substring(0, 300),
          skills: [],
          matchScore: Math.floor(score),
          matchedSkills: (analysis.matchedSkills || []).slice(0, 4),
          missingSkills: [],
          reasoning: analysis.reasoning || `🎯 Oportunidade na área de ${opp.theme || 'voluntariado'}.`,
          recommendation: analysis.recommendation || `👍 Excelente oportunidade para você!`,
          priority: priority,
          theme: opp.theme,
          projectLink: opp.projectLink
        } as MatchResult;
      } catch {
        return calculateSingleMatch(user, opp, i + idx);
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    console.log(`   📦 Lote ${Math.floor(i/batchSize)+1}/${Math.ceil(opportunities.length/batchSize)} concluído`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

// Algoritmo local rápido
function calculateLocalMatches(user: any, opportunities: any[]): MatchResult[] {
  const results: MatchResult[] = [];
  
  for (let i = 0; i < opportunities.length; i++) {
    results.push(calculateSingleMatch(user, opportunities[i], i));
  }
  
  return results;
}

function calculateSingleMatch(user: any, opp: any, index: number): MatchResult {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  
  let baseScore = 55;
  let matchedSkills: string[] = [];
  let matchCount = 0;
  
  for (const skill of userSkills) {
    if (oppText.includes(skill)) {
      baseScore += 15;
      matchedSkills.push(skill);
      matchCount++;
    }
  }
  
  if (matchCount >= 2) baseScore += 10;
  if (matchCount >= 3) baseScore += 15;
  
  let finalScore = baseScore + (index % 20) - 8;
  finalScore = Math.min(95, Math.max(40, finalScore));
  
  let priority: Priority = finalScore >= 70 ? 'high' : finalScore >= 50 ? 'medium' : 'low';
  
  let reasoning = '';
  let recommendation = '';
  
  if (finalScore >= 75) {
    reasoning = `🏆 Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são muito relevantes para este projeto.`;
    recommendation = `🎯 RECOMENDAÇÃO FORTE: Candidate-se imediatamente!`;
  } else if (finalScore >= 65) {
    reasoning = `👍 Ótima compatibilidade! Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} será muito útil.`;
    recommendation = `👍 RECOMENDAÇÃO: Considere se candidatar.`;
  } else if (finalScore >= 50) {
    reasoning = `💡 Compatibilidade positiva! Você pode contribuir significativamente.`;
    recommendation = `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade.`;
  } else {
    reasoning = `📌 Oportunidade interessante para desenvolver novas habilidades.`;
    recommendation = `📚 RECOMENDAÇÃO: Ótima oportunidade para aprendizado.`;
  }
  
  return {
    id: opp.id,
    title: opp.title,
    organization: opp.organization,
    location: opp.location,
    description: opp.description?.substring(0, 300),
    skills: [],
    matchScore: Math.floor(finalScore),
    matchedSkills: matchedSkills.slice(0, 4),
    missingSkills: [],
    reasoning: reasoning,
    recommendation: recommendation,
    priority: priority,
    theme: opp.theme,
    projectLink: opp.projectLink
  };
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
    
    for (let page = 1; page <= 3; page++) {
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
      console.log(`📄 Página ${page}: +${projects.length} projetos (total: ${allProjects.length})`);
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    cachedProjects = allProjects.slice(0, 150).map((project: any) => ({
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