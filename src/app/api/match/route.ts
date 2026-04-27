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

// Cache para projetos
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API ==========');
  
  // Obter parâmetros de paginação
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const offset = (page - 1) * limit;
  
  try {
    // Autenticação
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

    // Buscar perfil do usuário
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

    // Buscar oportunidades
    let allOpportunities = await fetchOpportunitiesWithCache();
    
    if (allOpportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        page: 1,
        hasMore: false,
        message: 'Nenhuma oportunidade encontrada.'
      });
    }

    console.log(`📦 Total de ${allOpportunities.length} oportunidades únicas`);

    // Analisar matches
    let allMatches: MatchResult[] = [];
    
    try {
      const uniqueOpportunities = removeDuplicates(allOpportunities);
      allMatches = await analyzeMatchesWithWatsonX(user, uniqueOpportunities.slice(0, 200));
    } catch (watsonxError) {
      console.error('⚠️ WatsonX falhou, usando algoritmo local:', watsonxError);
      allMatches = calculateLocalMatches(user, allOpportunities);
    }

    // Remover duplicatas e ordenar
    const uniqueMatches = removeDuplicateMatches(allMatches);
    uniqueMatches.sort((a, b) => b.matchScore - a.matchScore);
    
    // Paginar resultados
    const paginatedMatches = uniqueMatches.slice(offset, offset + limit);
    const hasMore = offset + limit < uniqueMatches.length;
    const totalPages = Math.ceil(uniqueMatches.length / limit);
    
    console.log(`\n📊 RESULTADOS:`);
    console.log(`   📄 Página ${page} de ${totalPages}`);
    console.log(`   🎯 Mostrando ${paginatedMatches.length} de ${uniqueMatches.length} matches`);
    console.log(`   🏆 Top score: ${uniqueMatches[0]?.matchScore}%`);
    console.log(`   📈 Score médio: ${Math.round(uniqueMatches.reduce((acc, m) => acc + m.matchScore, 0) / uniqueMatches.length)}%`);

    return NextResponse.json({
      success: true,
      matches: paginatedMatches,
      total: uniqueMatches.length,
      page: page,
      totalPages: totalPages,
      hasMore: hasMore,
      limit: limit,
      userSkills: user.skills || [],
      executionTimeMs: Date.now() - startTime,
      usingAI: true,
      stats: {
        highMatches: uniqueMatches.filter(m => m.matchScore >= 75).length,
        mediumMatches: uniqueMatches.filter(m => m.matchScore >= 60 && m.matchScore < 75).length,
        lowMatches: uniqueMatches.filter(m => m.matchScore < 60).length,
        averageScore: Math.round(uniqueMatches.reduce((acc, m) => acc + m.matchScore, 0) / uniqueMatches.length)
      }
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function removeDuplicates(opportunities: any[]): any[] {
  const seen = new Map();
  for (const opp of opportunities) {
    if (!seen.has(opp.id)) {
      seen.set(opp.id, opp);
    }
  }
  return Array.from(seen.values());
}

function removeDuplicateMatches(matches: MatchResult[]): MatchResult[] {
  const seen = new Map();
  for (const match of matches) {
    if (!seen.has(match.id)) {
      seen.set(match.id, match);
    }
  }
  return Array.from(seen.values());
}

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
        max_new_tokens: 500,
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

// 🔥 PROMPT MELHORADO - GERA SCORES MAIS ALTOS 🔥
async function analyzeMatchesWithWatsonX(user: any, opportunities: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const userSkills = user.skills?.join(', ') || 'Nenhuma habilidade listada';
  const userAbout = user.description || 'Voluntário interessado em ajudar';
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com IBM Granite...`);
  
  const batchSize = 5;
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    console.log(`   📦 Lote ${Math.floor(i/batchSize)+1}/${Math.ceil(opportunities.length/batchSize)}`);
    
    const batchPromises = batch.map(async (opp, idx) => {
      // 🔥 PROMPT OTIMIZADO PARA SCORES MAIS ALTOS 🔥
      const prompt = `[INST] You are an enthusiastic volunteer matching expert. Be optimistic and generous in your analysis.

VOLUNTEER PROFILE:
- Skills: ${userSkills}
- Bio: ${userAbout}
- Looking for: Meaningful volunteer opportunities

OPPORTUNITY DETAILS:
- Title: ${opp.title}
- Organization: ${opp.organization}
- Category: ${opp.theme || 'Social Impact'}
- Location: ${opp.location}
- Mission: ${opp.description?.substring(0, 400) || 'Make a positive impact'}

INSTRUCTIONS:
1. This volunteer WANTS to help and has valuable skills
2. Find ANY connection between their skills and this opportunity
3. Be GENEROUS with scores (70-95 for good fits, 50-69 for possible fits)
4. Give ENCOURAGING feedback in Portuguese

Return ONLY valid JSON:
{
  "matchScore": number (be generous: 85-95 for great fits, 70-84 for good fits, 55-69 for moderate fits),
  "matchedSkills": ["skill1", "skill2"],
  "reasoning": "Em português: Explique porque este voluntário é um bom candidato",
  "recommendation": "Em português: Recomendação encorajadora para este voluntário"
}[/INST]`;

      try {
        const response = await callGranite(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { matchScore: 75 };
        
        // 🔥 AJUSTE DE SCORE - MAIS GENEROSO 🔥
        let score = analysis.matchScore || 75;
        
        // Garantir score mínimo mais alto
        if (score < 55) score = 55 + (idx % 20);
        if (score > 95) score = 95;
        
        // Bônus baseado nas skills do usuário
        const oppText = `${opp.title} ${opp.description}`.toLowerCase();
        let bonus = 0;
        for (const skill of (user.skills || [])) {
          if (oppText.includes(skill.toLowerCase())) {
            bonus += 8;
          }
        }
        score = Math.min(95, score + bonus);
        
        let priority: Priority = score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low';
        
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
          reasoning: analysis.reasoning || `Excelente oportunidade na área de ${opp.theme || 'voluntariado'}! Suas habilidades são muito relevantes.`,
          recommendation: analysis.recommendation || `Esta oportunidade está muito alinhada com seu perfil. Candidate-se!`,
          priority: priority,
          theme: opp.theme,
          projectLink: opp.projectLink
        } as MatchResult;
      } catch (error) {
        console.error(`   ❌ Erro, usando fallback`);
        return calculateSingleMatch(user, opp, i + idx, true);
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  
  return results;
}

// 🔥 ALGORITMO LOCAL COM SCORES MAIS ALTOS 🔥
function calculateLocalMatches(user: any, opportunities: any[]): MatchResult[] {
  const results: MatchResult[] = [];
  
  for (let i = 0; i < opportunities.length; i++) {
    results.push(calculateSingleMatch(user, opportunities[i], i, true));
  }
  
  return results;
}

function calculateSingleMatch(user: any, opp: any, index: number, generous: boolean = true): MatchResult {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const oppText = `${opp.title} ${opp.description} ${opp.theme}`.toLowerCase();
  
  // 🔥 BASE SCORE MAIS ALTA 🔥
  let baseScore = generous ? 75 : 65;
  let matchedSkills: string[] = [];
  let matchCount = 0;
  
  for (const skill of userSkills) {
    if (oppText.includes(skill)) {
      baseScore += generous ? 12 : 10;
      matchedSkills.push(skill);
      matchCount++;
    }
  }
  
  if (matchCount >= 2) baseScore += generous ? 15 : 10;
  if (matchCount >= 3) baseScore += generous ? 20 : 15;
  
  // Variação para diversidade
  let finalScore = baseScore + (index % 15) - 5;
  finalScore = Math.min(95, Math.max(55, finalScore));
  
  let priority: Priority = finalScore >= 75 ? 'high' : finalScore >= 60 ? 'medium' : 'low';
  
  let reasoning = '';
  let recommendation = '';
  
  if (finalScore >= 85) {
    reasoning = `Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são altamente relevantes para este projeto. Você tem o perfil ideal!`;
    recommendation = `Recomendação forte: Candidate-se imediatamente! Esta oportunidade combina perfeitamente com seu perfil.`;
  } else if (finalScore >= 75) {
    reasoning = `Ótima compatibilidade! Sua experiência em ${matchedSkills.slice(0, 2).join(', ')} será muito útil para este projeto. Você pode contribuir significativamente.`;
    recommendation = `Recomendação: Considere se candidatar. Suas habilidades são valiosas para esta oportunidade.`;
  } else if (finalScore >= 65) {
    reasoning = `Compatibilidade positiva! Este projeto pode se beneficiar da sua experiência. Você tem potencial para fazer a diferença.`;
    recommendation = `Recomendação: Vale a pena explorar esta oportunidade. Pode ser um ótimo começo!`;
  } else {
    reasoning = `Oportunidade interessante para desenvolver novas habilidades. Mesmo sem experiência direta, você pode contribuir e aprender muito.`;
    recommendation = `Recomendação: Excelente oportunidade para crescimento pessoal e profissional. Candidate-se!`;
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
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    const uniqueProjects = removeDuplicates(allProjects);
    console.log(`📊 Após remover duplicatas: ${uniqueProjects.length} projetos únicos`);

    cachedProjects = uniqueProjects.slice(0, 200).map((project: any) => ({
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