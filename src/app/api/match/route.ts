// app/api/match/route.ts - VERSÃO CORRIGIDA SEM FALLBACK
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

    // 4. Obter token IBM Cloud
    const ibmToken = await getIBMAccessToken();
    if (!ibmToken) {
      throw new Error('Não foi possível obter token de acesso IBM Cloud');
    }
    console.log('✅ Token IBM Cloud obtido com sucesso');

    // 5. Analisar perfil do usuário com WatsonX
    const userProfile = await analyzeUserProfileWithWatsonX(ibmToken, user);
    console.log('✅ Perfil analisado pela WatsonX:', JSON.stringify(userProfile, null, 2));

    // 6. Analisar matches com WatsonX
    const matches = await analyzeMatchesWithWatsonX(ibmToken, userProfile, user, opportunities);
    
    // 7. Ordenar por score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('\n📊 RESULTADOS FINAIS:');
    console.log(`   🔥 Alta compatibilidade (70-100%): ${matches.filter(m => m.matchScore >= 70).length}`);
    console.log(`   📌 Média compatibilidade (45-69%): ${matches.filter(m => m.matchScore >= 45 && m.matchScore < 70).length}`);
    console.log(`   🌱 Baixa compatibilidade (0-44%): ${matches.filter(m => m.matchScore < 45).length}`);
    
    console.log('\n🏆 TOP 10 MATCHES:');
    matches.slice(0, 10).forEach((m, i) => {
      console.log(`   ${i+1}. ${m.matchScore}% - ${m.title.substring(0, 55)}...`);
      console.log(`      ${m.reasoning.substring(0, 80)}...`);
    });

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 50),
      total: matches.length,
      userSkills: user.skills || [],
      userProfile: userProfile,
      executionTimeMs: Date.now() - startTime,
      usingAI: true,
      aiProvider: 'IBM WatsonX'
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error);
    // Retornar erro detalhado para debug (remover em produção)
    return NextResponse.json(
      { error: error.message || 'Internal server error', details: error.toString() },
      { status: 500 }
    );
  }
}

// Obter token de acesso IBM Cloud
async function getIBMAccessToken(): Promise<string | null> {
  const apiKey = process.env.IBM_API_KEY;
  const url = 'https://iam.cloud.ibm.com/identity/token';
  
  console.log('🔑 Solicitando token IBM Cloud...');
  
  if (!apiKey) {
    console.error('❌ IBM_API_KEY não configurada no .env');
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
      const errorText = await response.text();
      console.error(`❌ Erro ao obter token: ${response.status} - ${errorText}`);
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
  const prompt = `Analyze the following volunteer profile and return ONLY valid JSON (no other text):

VOLUNTEER PROFILE:
- Name: ${user.name}
- Skills: ${user.skills?.join(', ') || 'Not informed'}
- About: ${user.description || 'Not informed'}
- Location: ${user.location || 'Not informed'}
- Availability: ${user.availability || 'Not informed'}

Return EXACTLY this JSON format:
{
  "primary_category": "string (Education, Health, Environment, Social, Technology, Culture, Sports, Animals)",
  "secondary_categories": ["string"],
  "key_skills": ["string"],
  "interests": ["string"],
  "experience_level": "string (beginner, intermediate, advanced)",
  "personality_traits": ["string"],
  "summary": "string (brief profile summary in English)"
}`;

  console.log('🧠 Analisando perfil do usuário com WatsonX...');
  const response = await callWatsonXGeneration(ibmToken, prompt);
  console.log('📝 Resposta da WatsonX (perfil):', response.substring(0, 200));
  
  try {
    // Tentar extrair JSON da resposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('❌ Erro ao fazer parse do JSON do perfil:', error);
    throw new Error('Falha ao analisar resposta da WatsonX para o perfil');
  }
}

// Analisar matches com WatsonX
async function analyzeMatchesWithWatsonX(ibmToken: string, userProfile: any, user: any, opportunities: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  console.log(`🔍 Analisando ${opportunities.length} oportunidades com WatsonX...`);
  
  // Processar em lotes de 3 para não sobrecarregar
  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    
    const prompt = `Compare the volunteer profile with the opportunity and return ONLY valid JSON.

VOLUNTEER PROFILE:
- Primary category: ${userProfile.primary_category}
- Secondary categories: ${userProfile.secondary_categories?.join(', ')}
- Key skills: ${userProfile.key_skills?.join(', ')}
- Interests: ${userProfile.interests?.join(', ')}
- Experience level: ${userProfile.experience_level}
- Summary: ${userProfile.summary}

OPPORTUNITY:
- Title: ${opp.title}
- Theme: ${opp.theme}
- Description: ${opp.description?.substring(0, 600)}
- Location: ${opp.location}

Return EXACTLY this JSON format:
{
  "matchScore": number (0-100, be strict and realistic),
  "matchedSkills": ["string"] (maximum 4 skills that match),
  "reasoning": "string (explanation in English why this is a good or bad match)",
  "recommendation": "string (personalized recommendation for the volunteer in English)",
  "relevanceLevel": "high" | "medium" | "low"
}`;

    try {
      const response = await callWatsonXGeneration(ibmToken, prompt);
      console.log(`   ✅ Oportunidade ${i+1}/${opportunities.length} analisada`);
      
      // Extrair JSON da resposta
      let analysis;
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = JSON.parse(response);
      }
      
      // Validar e ajustar valores
      const matchScore = Math.min(100, Math.max(0, analysis.matchScore || 50));
      
      results.push({
        id: opp.id,
        title: opp.title,
        organization: opp.organization,
        location: opp.location,
        description: opp.description?.substring(0, 300),
        skills: [],
        matchScore: matchScore,
        matchedSkills: (analysis.matchedSkills || []).slice(0, 4),
        missingSkills: [],
        reasoning: analysis.reasoning || `This opportunity aligns with your ${userProfile.primary_category} profile.`,
        recommendation: analysis.recommendation || `We recommend you explore this opportunity further.`,
        priority: analysis.relevanceLevel === 'high' ? 'high' : analysis.relevanceLevel === 'medium' ? 'medium' : 'low',
        theme: opp.theme,
        projectLink: opp.projectLink
      });
      
      // Pequeno delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Erro ao analisar oportunidade ${i}:`, error);
      throw error; // Parar a execução se falhar - sem fallback
    }
  }
  
  return results;
}

// Chamar API de geração do WatsonX
async function callWatsonXGeneration(ibmToken: string, prompt: string): Promise<string> {
  const url = `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`;
  const projectId = process.env.IBM_PROJECT_ID;
  
  console.log('📡 Chamando IBM WatsonX API...');
  
  if (!projectId) {
    throw new Error('IBM_PROJECT_ID não configurado no .env');
  }
  
  const requestBody = {
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
  };
  
  console.log('📤 Request body:', JSON.stringify(requestBody, null, 2).substring(0, 500));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ibmToken}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ WatsonX API error ${response.status}: ${errorText}`);
      throw new Error(`WatsonX API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ WatsonX respondeu com sucesso');
    
    const generatedText = data.results?.[0]?.generated_text || '';
    console.log('📝 Resposta gerada:', generatedText.substring(0, 300));
    
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
    throw new Error('GLOBAL_GIVING_API_KEY não configurada');
  }

  try {
    const allProjects: any[] = [];
    
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
      
      if (projects.length === 0) break;
      
      allProjects.push(...projects);
      console.log(`📄 Página ${page}: +${projects.length} projetos (total: ${allProjects.length})`);
      
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
    throw error;
  }
}