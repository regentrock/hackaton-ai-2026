// app/api/match/route.ts - VERSÃO COM IBM GRANITE 3-8B-INSTRUCT
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

// Cache para análise semântica do usuário
let userSemanticCache: Map<string, { timestamp: number, analysis: any }> = new Map();

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API COM IBM GRANITE 3-8B ==========');
  
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
    console.log('📝 Sobre:', user.description?.substring(0, 200) || 'Não informado');

    // 3. Verificar credenciais IBM
    const hasWatsonX = !!(process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID);
    
    if (!hasWatsonX) {
      console.error('❌ IBM WatsonX credentials not found!');
      return NextResponse.json({
        success: false,
        error: 'IBM WatsonX não configurado. Configure IBM_API_KEY e IBM_PROJECT_ID no .env'
      }, { status: 500 });
    }

    // 4. Analisar perfil do usuário com IBM Granite
    let userSemanticAnalysis = userSemanticCache.get(user.id)?.analysis;
    const now = Date.now();
    
    if (!userSemanticAnalysis || (now - (userSemanticCache.get(user.id)?.timestamp || 0)) > 60 * 60 * 1000) {
      console.log('🧠 Analisando perfil com IBM Granite 3-8B...');
      userSemanticAnalysis = await analyzeUserWithGranite(user);
      userSemanticCache.set(user.id, { timestamp: now, analysis: userSemanticAnalysis });
      console.log('✅ Análise concluída:', JSON.stringify(userSemanticAnalysis, null, 2));
    } else {
      console.log('📦 Usando análise em cache');
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

    // 6. Analisar oportunidades com IBM Granite
    const matches = await analyzeOpportunitiesWithGranite(userSemanticAnalysis, opportunities);

    // 7. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    // 8. Log dos resultados
    console.log('\n📊 RESULTADOS:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${matches.filter(m => m.matchScore >= 70).length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${matches.filter(m => m.matchScore >= 45 && m.matchScore < 70).length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${matches.filter(m => m.matchScore < 45).length}`);
    
    console.log('\n🏆 TOP 10 MATCHES:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 50),
      total: matches.length,
      userSkills: user.skills || [],
      userSemanticAnalysis: userSemanticAnalysis,
      executionTimeMs: Date.now() - startTime,
      usingAI: true,
      aiProvider: 'IBM WatsonX',
      aiModel: 'ibm/granite-3-8b-instruct'
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
  
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey!
    })
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
  
  console.log('📡 Chamando IBM Granite 3-8B-Instruct...');
  
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
        top_p: 0.9,
        top_k: 50,
        repetition_penalty: 1.1
      },
      model_id: 'ibm/granite-3-8b-instruct',
      project_id: projectId
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Erro Granite API: ${response.status} - ${errorText}`);
    throw new Error(`Granite API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.results?.[0]?.generated_text || '';
}

// Analisar perfil do usuário com Granite
async function analyzeUserWithGranite(user: UserProfile): Promise<any> {
  const prompt = `[INST] You are an AI semantic analyzer. Analyze this volunteer profile and return ONLY JSON.

Volunteer:
- Skills: ${user.skills?.join(', ') || 'None'}
- About: ${user.description || 'None'}

Return this exact JSON format:
{
  "primary_category": "Education|Health|Environment|Social|Technology|Culture|Sports|Animals",
  "secondary_categories": ["string"],
  "key_skills": ["string"],
  "interests": ["string"],
  "semantic_tags": ["string"]
}[/INST]`;

  const response = await callGranite(prompt);
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('❌ Erro ao parsear resposta:', error);
    throw new Error('Falha na análise do perfil');
  }
}

// Analisar oportunidades com Granite
async function analyzeOpportunitiesWithGranite(userAnalysis: any, opportunities: Opportunity[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com IBM Granite...`);
  
  // Limitar para não sobrecarregar (analisar até 40)
  const toAnalyze = opportunities.slice(0, 40);
  
  for (let i = 0; i < toAnalyze.length; i++) {
    const opp = toAnalyze[i];
    
    const prompt = `[INST] You are a matching expert. Compare volunteer with opportunity and return ONLY JSON.

Volunteer:
- Category: ${userAnalysis.primary_category}
- Skills: ${userAnalysis.key_skills?.slice(0, 5).join(', ')}
- Interests: ${userAnalysis.interests?.slice(0, 3).join(', ')}

Opportunity:
- Title: ${opp.title}
- Theme: ${opp.theme}
- Location: ${opp.location}
- Description: ${opp.description?.substring(0, 300)}

Return:
{
  "matchScore": 0-100,
  "matchedSkills": [],
  "reasoning": "string in Portuguese",
  "recommendation": "string in Portuguese",
  "relevanceLevel": "high|medium|low"
}[/INST]`;

    try {
      const response = await callGranite(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
      
      console.log(`   ✅ ${i+1}/${toAnalyze.length} - Score: ${analysis.matchScore}`);
      
      results.push({
        id: opp.id,
        title: opp.title,
        organization: opp.organization,
        location: opp.location,
        description: opp.description?.substring(0, 300),
        skills: [],
        matchScore: Math.min(100, Math.max(0, analysis.matchScore || 50)),
        matchedSkills: (analysis.matchedSkills || userAnalysis.key_skills?.slice(0, 2) || []).slice(0, 4),
        missingSkills: [],
        reasoning: analysis.reasoning || `Compatível com seu perfil em ${userAnalysis.primary_category}.`,
        recommendation: analysis.recommendation || `Recomendamos conhecer esta oportunidade.`,
        priority: analysis.relevanceLevel === 'high' ? 'high' : analysis.relevanceLevel === 'medium' ? 'medium' : 'low',
        theme: opp.theme,
        projectLink: opp.projectLink
      });
      
      // Delay entre chamadas
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ Erro na oportunidade ${i+1}:`, error);
      results.push({
        id: opp.id,
        title: opp.title,
        organization: opp.organization,
        location: opp.location,
        description: opp.description?.substring(0, 300),
        skills: [],
        matchScore: 50,
        matchedSkills: userAnalysis.key_skills?.slice(0, 2) || [],
        missingSkills: [],
        reasoning: `Oportunidade na área de ${opp.theme}.`,
        recommendation: `Explore esta oportunidade.`,
        priority: 'medium',
        theme: opp.theme,
        projectLink: opp.projectLink
      });
    }
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

    cachedProjects = allProjects.map((project: any): Opportunity => ({
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