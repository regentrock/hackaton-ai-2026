// app/api/match/route.ts - INTEGRAÇÃO COMPLETA COM IBM WATSONX
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

// Cache para análise do perfil do usuário (1 hora)
let userProfileCache: Map<string, { timestamp: number, profile: any }> = new Map();

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
    console.log('📝 Sobre:', user.description);
    console.log('📍 Localização:', user.location);

    // 3. Obter token de acesso IBM Cloud
    const ibmToken = await getIBMAccessToken();
    
    if (!ibmToken) {
      console.error('❌ Não foi possível obter token IBM');
      // Fallback: usar análise local
      return handleLocalFallback(user);
    }

    // 4. Analisar perfil do usuário com WatsonX (com cache)
    let userProfile = userProfileCache.get(user.id)?.profile;
    const now = Date.now();
    
    if (!userProfile || (now - (userProfileCache.get(user.id)?.timestamp || 0)) > 60 * 60 * 1000) {
      console.log('🧠 Analisando perfil do usuário com IBM WatsonX...');
      userProfile = await analyzeUserProfileWithWatsonX(ibmToken, user);
      userProfileCache.set(user.id, { timestamp: now, profile: userProfile });
      console.log('✅ Perfil analisado:', JSON.stringify(userProfile, null, 2));
    } else {
      console.log('📦 Usando perfil em cache');
    }

    // 5. Buscar oportunidades
    let opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades para analisar`);

    // 6. Analisar matches com WatsonX (em lotes)
    const matches = await analyzeMatchesWithWatsonX(ibmToken, userProfile, user, opportunities);
    
    // 7. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('\n📊 RESULTADOS DA ANÁLISE WATSONX:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${matches.filter(m => m.matchScore >= 70).length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${matches.filter(m => m.matchScore >= 45 && m.matchScore < 70).length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${matches.filter(m => m.matchScore < 45).length}`);
    
    console.log('\n🏆 TOP 10 MATCHES:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
      console.log(`      Skills: ${m.matchedSkills.slice(0, 3).join(', ')}`);
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 60),
      total: matches.length,
      userSkills: user.skills || [],
      userProfile: userProfile,
      executionTimeMs: Date.now() - startTime,
      usingAI: true,
      aiProvider: 'IBM WatsonX'
    });

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Obter token de acesso IBM Cloud
async function getIBMAccessToken(): Promise<string | null> {
  const apiKey = process.env.IBM_API_KEY;
  const url = 'https://iam.cloud.ibm.com/identity/token';
  
  if (!apiKey) {
    console.error('❌ IBM_API_KEY não configurada');
    return null;
  }
  
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
    params.append('apikey', apiKey);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });
    
    if (!response.ok) {
      console.error(`❌ Erro ao obter token: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log('✅ Token IBM obtido com sucesso');
    return data.access_token;
    
  } catch (error) {
    console.error('❌ Erro ao obter token IBM:', error);
    return null;
  }
}

// Analisar perfil do usuário com WatsonX
async function analyzeUserProfileWithWatsonX(ibmToken: string, user: any): Promise<any> {
  const prompt = `Analise o seguinte perfil de voluntário e retorne APENAS UM JSON válido:

PERFIL:
- Nome: ${user.name}
- Habilidades: ${user.skills?.join(', ') || 'Não informado'}
- Sobre o voluntário: ${user.description || 'Não informado'}
- Localização: ${user.location || 'Não informado'}
- Disponibilidade: ${user.availability || 'Não informado'}

Responda EXATAMENTE neste formato JSON (sem texto adicional):
{
  "primary_category": "string (Educação, Saúde, Meio Ambiente, Social, Tecnologia, Cultura, Esportes, Animais)",
  "secondary_categories": ["string"],
  "key_skills": ["string"],
  "interests": ["string"],
  "experience_level": "string (iniciante, intermediário, avançado)",
  "personality_traits": ["string"],
  "summary": "string (resumo do perfil em português)"
}`;

  return await callWatsonXGeneration(ibmToken, prompt);
}

// Analisar matches em lote
async function analyzeMatchesWithWatsonX(ibmToken: string, userProfile: any, user: any, opportunities: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const batchSize = 5; // Processar 5 por vez para não sobrecarregar
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com WatsonX...`);
  
  // Processar em lotes
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const batchPromises = batch.map(async (opp, idx) => {
      const score = await analyzeSingleMatch(ibmToken, userProfile, user, opp);
      return score;
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    console.log(`   Processados ${Math.min(i + batchSize, opportunities.length)}/${opportunities.length} oportunidades`);
  }
  
  return results;
}

// Analisar um único match
async function analyzeSingleMatch(ibmToken: string, userProfile: any, user: any, opp: any): Promise<MatchResult> {
  const prompt = `Compare o perfil do voluntário com a oportunidade e retorne APENAS UM JSON.

PERFIL DO VOLUNTÁRIO:
- Categoria principal: ${userProfile.primary_category}
- Categorias secundárias: ${userProfile.secondary_categories?.join(', ')}
- Habilidades: ${userProfile.key_skills?.join(', ')}
- Interesses: ${userProfile.interests?.join(', ')}
- Nível de experiência: ${userProfile.experience_level}
- Resumo: ${userProfile.summary}

OPORTUNIDADE:
- Título: ${opp.title}
- Tema: ${opp.theme}
- Descrição: ${opp.description?.substring(0, 600)}
- Localização: ${opp.location}

Responda EXATAMENTE neste formato JSON:
{
  "matchScore": number (0-100, seja criterioso),
  "matchedSkills": ["string"] (habilidades que combinam, máximo 4),
  "reasoning": "string (explicação em português do porquê esse match é bom ou não)",
  "recommendation": "string (recomendação personalizada para o voluntário em português)",
  "relevanceLevel": "high" | "medium" | "low"
}`;

  try {
    const response = await callWatsonXGeneration(ibmToken, prompt);
    const analysis = JSON.parse(response);
    
    // Validar e ajustar valores
    const matchScore = Math.min(100, Math.max(0, analysis.matchScore || 50));
    
    return {
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description?.substring(0, 300),
      skills: [],
      matchScore: matchScore,
      matchedSkills: (analysis.matchedSkills || []).slice(0, 4),
      missingSkills: [],
      reasoning: analysis.reasoning || `Compatibilidade baseada no seu perfil de ${userProfile.primary_category}.`,
      recommendation: analysis.recommendation || `Recomendamos que você conheça mais sobre esta oportunidade.`,
      priority: analysis.relevanceLevel === 'high' ? 'high' : analysis.relevanceLevel === 'medium' ? 'medium' : 'low',
      theme: opp.theme,
      projectLink: opp.projectLink
    };
  } catch (error) {
    console.error(`⚠️ Erro analisando oportunidade ${opp.title}:`, error);
    // Fallback
    return generateFallbackMatch(userProfile, opp);
  }
}

// Chamar API de geração do WatsonX
async function callWatsonXGeneration(ibmToken: string, prompt: string): Promise<string> {
  const url = `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`;
  const projectId = process.env.IBM_PROJECT_ID;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ibmToken}`
      },
      body: JSON.stringify({
        input: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.2,
          top_p: 0.9,
          top_k: 50,
          repetition_penalty: 1.1,
          stop_sequences: ["```", "}"]
        },
        model_id: 'meta-llama/llama-3-2-3b-instruct',
        project_id: projectId
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ WatsonX API error ${response.status}: ${errorText}`);
      throw new Error(`WatsonX API error: ${response.status}`);
    }
    
    const data = await response.json();
    let generatedText = data.results?.[0]?.generated_text || '';
    
    // Limpar a resposta para extrair apenas o JSON
    generatedText = generatedText.trim();
    
    // Tentar extrair JSON da resposta
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    
    return generatedText;
    
  } catch (error) {
    console.error('❌ Erro na chamada WatsonX:', error);
    throw error;
  }
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
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const allProjects: any[] = [];
    
    console.log('🌍 Buscando oportunidades da GlobalGiving...');
    
    for (let page = 1; page <= 12; page++) {
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
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`📡 GlobalGiving: ${allProjects.length} projetos carregados`);

    cachedProjects = allProjects.map((project: any) => ({
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

// Fallback quando WatsonX não está disponível
async function handleLocalFallback(user: any): Promise<NextResponse> {
  console.log('⚠️ Usando fallback local para análise');
  
  // Análise local simples baseada nas skills
  const primaryCategory = detectPrimaryCategoryLocal(user);
  
  return NextResponse.json({
    success: true,
    matches: [],
    message: 'Modo de demonstração. Conecte com IBM WatsonX para análises avançadas.',
    userSkills: user.skills || [],
    usingAI: false,
    suggestedCategory: primaryCategory
  });
}

function detectPrimaryCategoryLocal(user: any): string {
  const text = `${user.skills?.join(' ')} ${user.description || ''}`.toLowerCase();
  
  if (text.includes('ensin') || text.includes('professor') || text.includes('pedagog') || text.includes('educaç')) {
    return 'Educação';
  }
  if (text.includes('saúde') || text.includes('medic') || text.includes('enferm')) {
    return 'Saúde';
  }
  if (text.includes('ambient') || text.includes('ecolog') || text.includes('sustent')) {
    return 'Meio Ambiente';
  }
  if (text.includes('tecnolog') || text.includes('programaç') || text.includes('software')) {
    return 'Tecnologia';
  }
  if (text.includes('social') || text.includes('comunidade')) {
    return 'Social';
  }
  return 'Voluntariado';
}

function generateFallbackMatch(userProfile: any, opp: any): MatchResult {
  let baseScore = 50;
  const oppText = `${opp.title} ${opp.theme}`.toLowerCase();
  
  if (userProfile.primary_category && oppText.includes(userProfile.primary_category.toLowerCase())) {
    baseScore += 25;
  }
  
  for (const skill of userProfile.key_skills || []) {
    if (oppText.includes(skill.toLowerCase())) {
      baseScore += 10;
    }
  }
  
  const finalScore = Math.min(95, Math.max(25, baseScore));
  
  return {
    id: opp.id,
    title: opp.title,
    organization: opp.organization,
    location: opp.location,
    description: opp.description?.substring(0, 300),
    skills: [],
    matchScore: finalScore,
    matchedSkills: (userProfile.key_skills || []).slice(0, 4),
    missingSkills: [],
    reasoning: `Compatibilidade baseada no seu perfil de ${userProfile.primary_category}.`,
    recommendation: `Recomendamos que você conheça mais sobre esta oportunidade.`,
    priority: finalScore >= 70 ? 'high' : finalScore >= 45 ? 'medium' : 'low',
    theme: opp.theme,
    projectLink: opp.projectLink
  };
}