// app/api/match/route.ts - VERSÃO COM IBM WATSONX REAL
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
  console.log('\n🚀 ========== MATCH API COM IBM WATSONX REAL ==========');
  
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

    // 3. Verificar se temos credenciais da IBM WatsonX
    const hasWatsonX = !!(process.env.IBM_API_KEY && process.env.IBM_PROJECT_ID);
    
    if (!hasWatsonX) {
      console.error('❌ IBM WatsonX credentials not found!');
      return NextResponse.json({
        success: false,
        error: 'IBM WatsonX não configurado. Configure IBM_API_KEY e IBM_PROJECT_ID no .env'
      }, { status: 500 });
    }

    // 4. Analisar perfil do usuário com WatsonX (análise semântica real)
    let userSemanticAnalysis = userSemanticCache.get(user.id)?.analysis;
    const now = Date.now();
    
    if (!userSemanticAnalysis || (now - (userSemanticCache.get(user.id)?.timestamp || 0)) > 60 * 60 * 1000) {
      console.log('🧠 Enviando perfil para análise semântica da IBM WatsonX...');
      userSemanticAnalysis = await analyzeUserSemanticallyWithWatsonX(user);
      userSemanticCache.set(user.id, { timestamp: now, analysis: userSemanticAnalysis });
      console.log('✅ Análise semântica concluída:', JSON.stringify(userSemanticAnalysis, null, 2));
    } else {
      console.log('📦 Usando análise semântica em cache');
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

    // 6. Analisar cada oportunidade com WatsonX (análise semântica)
    const matches = await analyzeOpportunitiesWithWatsonX(userSemanticAnalysis, opportunities);

    // 7. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    // 8. Log dos resultados
    console.log('\n📊 RESULTADOS DA ANÁLISE SEMÂNTICA:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${matches.filter(m => m.matchScore >= 70).length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${matches.filter(m => m.matchScore >= 45 && m.matchScore < 70).length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${matches.filter(m => m.matchScore < 45).length}`);
    
    console.log('\n🏆 TOP 10 MATCHES (Analisados por IA):');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
      console.log(`      Reasoning: ${m.reasoning.substring(0, 80)}...`);
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
      aiModel: 'llama-3-2-3b-instruct'
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error', details: error.toString() },
      { status: 500 }
    );
  }
}

// Função para analisar semanticamente o perfil do usuário com WatsonX
async function analyzeUserSemanticallyWithWatsonX(user: UserProfile): Promise<any> {
  const prompt = `You are an AI semantic analyzer for volunteer matching. Analyze the following volunteer profile and return ONLY valid JSON.

VOLUNTEER PROFILE:
- Name: ${user.name}
- Skills: ${user.skills?.join(', ') || 'None provided'}
- Self-description: ${user.description || 'None provided'}
- Location: ${user.location || 'Not specified'}
- Availability: ${user.availability || 'Not specified'}

Based on semantic understanding of their skills and description, identify:

1. PRIMARY_CATEGORY: The main category that best matches their profile (choose ONE: "Education", "Health", "Environment", "Social Services", "Technology", "Arts & Culture", "Sports", "Animals")

2. SECONDARY_CATEGORIES: Other relevant categories (array of strings)

3. KEY_SKILLS: Extract the most relevant skills from their profile (array of strings, max 8)

4. INTERESTS: Infer what topics/areas they care about (array of strings, max 6)

5. PERSONALITY_TRAITS: Infer personality traits from the description (array of strings, max 4)

6. EXPERIENCE_LEVEL: "beginner", "intermediate", or "advanced"

7. SEMANTIC_TAGS: Key semantic concepts extracted from their profile (array of strings, max 10)

Return EXACTLY this JSON format (no other text):
{
  "primary_category": "string",
  "secondary_categories": ["string"],
  "key_skills": ["string"],
  "interests": ["string"],
  "personality_traits": ["string"],
  "experience_level": "string",
  "semantic_tags": ["string"]
}`;

  const response = await callWatsonX(prompt);
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('❌ Erro ao parsear resposta da WatsonX:', error);
    throw new Error('Falha na análise semântica do perfil');
  }
}

// Função para analisar compatibilidade com WatsonX
async function analyzeOpportunitiesWithWatsonX(userAnalysis: any, opportunities: Opportunity[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const batchSize = 3; // Processar 3 por vez para não sobrecarregar
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com IBM WatsonX...`);
  
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (opp, idx) => {
      const prompt = `You are an AI matching expert. Analyze the semantic compatibility between a volunteer and an opportunity.

VOLUNTEER SEMANTIC PROFILE:
- Primary Category: ${userAnalysis.primary_category}
- Secondary Categories: ${userAnalysis.secondary_categories?.join(', ')}
- Key Skills: ${userAnalysis.key_skills?.join(', ')}
- Interests: ${userAnalysis.interests?.join(', ')}
- Semantic Tags: ${userAnalysis.semantic_tags?.join(', ')}
- Experience Level: ${userAnalysis.experience_level}

OPPORTUNITY:
- Title: ${opp.title}
- Theme: ${opp.theme}
- Location: ${opp.location}
- Description: ${opp.description?.substring(0, 500)}

Based on SEMANTIC UNDERSTANDING, calculate:
1. matchScore: Number from 0-100 (be realistic and strict)
2. matchedSkills: Which of the volunteer's skills are relevant to this opportunity (max 4)
3. reasoning: Brief explanation in Portuguese why this is a good or bad match (1-2 sentences)
4. recommendation: Personalized recommendation in Portuguese for the volunteer (1 sentence)
5. relevanceLevel: "high", "medium", or "low"

Return EXACTLY this JSON format:
{
  "matchScore": 0,
  "matchedSkills": [],
  "reasoning": "",
  "recommendation": "",
  "relevanceLevel": ""
}`;

      try {
        const response = await callWatsonX(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
        
        console.log(`   ✅ Oportunidade ${i + idx + 1}/${opportunities.length} analisada - Score: ${analysis.matchScore}`);
        
        return {
          id: opp.id,
          title: opp.title,
          organization: opp.organization,
          location: opp.location,
          description: opp.description?.substring(0, 300),
          skills: [],
          matchScore: Math.min(100, Math.max(0, analysis.matchScore || 50)),
          matchedSkills: (analysis.matchedSkills || []).slice(0, 4),
          missingSkills: [],
          reasoning: analysis.reasoning || `Compatível com seu perfil em ${userAnalysis.primary_category}.`,
          recommendation: analysis.recommendation || `Recomendamos conhecer esta oportunidade.`,
          priority: analysis.relevanceLevel === 'high' ? 'high' : analysis.relevanceLevel === 'medium' ? 'medium' : 'low',
          theme: opp.theme,
          projectLink: opp.projectLink
        } as MatchResult;
      } catch (error) {
        console.error(`❌ Erro na oportunidade ${i + idx + 1}:`, error);
        // Fallback para não parar o processo
        return {
          id: opp.id,
          title: opp.title,
          organization: opp.organization,
          location: opp.location,
          description: opp.description?.substring(0, 300),
          skills: [],
          matchScore: 45,
          matchedSkills: userAnalysis.key_skills?.slice(0, 2) || [],
          missingSkills: [],
          reasoning: `Análise baseada no seu perfil em ${userAnalysis.primary_category}.`,
          recommendation: `Explore esta oportunidade para fazer a diferença.`,
          priority: 'medium',
          theme: opp.theme,
          projectLink: opp.projectLink
        } as MatchResult;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Delay entre lotes para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`   📊 Progresso: ${Math.min(i + batchSize, opportunities.length)}/${opportunities.length} oportunidades analisadas`);
  }
  
  return results;
}

// Chamar API da IBM WatsonX
async function callWatsonX(prompt: string): Promise<string> {
  const apiKey = process.env.IBM_API_KEY;
  const projectId = process.env.IBM_PROJECT_ID;
  const url = `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`;
  
  // Primeiro, obter token de acesso
  const tokenResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey!
    })
  });
  
  if (!tokenResponse.ok) {
    throw new Error(`Falha ao obter token IBM: ${tokenResponse.status}`);
  }
  
  const { access_token } = await tokenResponse.json();
  
  // Chamar a API de geração
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`
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
    throw new Error(`WatsonX API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.results?.[0]?.generated_text || '';
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