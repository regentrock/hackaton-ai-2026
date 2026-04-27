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
}

// Cache para projetos (1 hora)
let cachedProjects: any[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000;

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
    console.log('🎯 Skills:', user.skills);
    console.log('📍 Localização:', user.location);

    // 3. Buscar oportunidades (com cache)
    const opportunities = await fetchOpportunitiesWithCache();
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades encontradas`);

    // 4. Calcular matches USANDO WATSONX
    const matches = await calculateMatchesWithAI(user, opportunities);

    // 5. Ordenar e retornar
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    const executionTime = Date.now() - startTime;
    console.log(`✨ API finalizada em ${executionTime}ms`);
    console.log(`🎯 Retornando ${matches.length} matches`);

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 15),
      total: matches.length,
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
    console.log('📦 Usando cache de projetos');
    return cachedProjects;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return [];
  }

  try {
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`❌ GlobalGiving API erro: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    console.log(`📡 GlobalGiving: ${projects.length} projetos brutos`);

    cachedProjects = projects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      theme: project.themeName || 'Voluntariado',
      url: project.projectLink
    }));
    
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

async function calculateMatchesWithAI(user: any, opportunities: any[]): Promise<MatchResult[]> {
  console.log('\n🤖 ANALISANDO MATCHES COM WATSONX...');
  
  const results: MatchResult[] = [];
  const batchSize = 5;
  
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(opportunities.length / batchSize);
    
    console.log(`📦 Processando lote ${batchNum}/${totalBatches}`);
    
    const batchPromises = batch.map(async (opportunity: any) => {
      return await analyzeMatchWithWatsonX(user, opportunity);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    if (i + batchSize < opportunities.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

async function analyzeMatchWithWatsonX(user: any, opportunity: any): Promise<MatchResult> {
  try {
    if (!process.env.IBM_API_KEY || !process.env.IBM_URL || !process.env.IBM_PROJECT_ID) {
      console.log('⚠️ WatsonX não configurado, usando fallback');
      return createBasicMatch(user, opportunity, 50);
    }
    
    const tokenResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`
    });
    
    if (!tokenResponse.ok) {
      console.warn('Erro ao obter token IAM');
      return createBasicMatch(user, opportunity, 50);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    const prompt = `You are an AI that matches volunteers to opportunities. Analyze the match between a volunteer and an opportunity.

=== VOLUNTEER ===
Skills: ${user.skills?.join(', ') || 'None listed'}
Location: ${user.location || 'Not specified'}

=== OPPORTUNITY ===
Title: ${opportunity.title}
Organization: ${opportunity.organization}
Theme: ${opportunity.theme || 'Social Impact'}
Description: ${opportunity.description?.substring(0, 600) || 'No description'}

=== TASK ===
Based STRICTLY on the volunteer's skills, determine how well they match this opportunity.

Calculate a match score from 0 to 100.

Return ONLY this JSON:
{
  "score": number,
  "matchedSkills": ["skill1", "skill2"],
  "reasoning": "em português",
  "recommendation": "em português"
}`;

    const watsonResponse = await fetch(`${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: prompt,
        model_id: "ibm/granite-3-8b-instruct",
        project_id: process.env.IBM_PROJECT_ID,
        parameters: {
          decoding_method: "greedy",
          max_new_tokens: 250,
          temperature: 0.2,
        },
      }),
    });

    if (!watsonResponse.ok) {
      console.warn(`WatsonX error: ${watsonResponse.status}`);
      return createBasicMatch(user, opportunity, 50);
    }

    const data = await watsonResponse.json();
    const aiText = data.results[0].generated_text;
    
    const cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return createBasicMatch(user, opportunity, 50);
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    let score = Math.min(95, Math.max(15, parsed.score || 50));
    
    // Bônus de localização
    if (user.location && opportunity.location) {
      const userCity = user.location.split(',')[0].trim().toLowerCase();
      const oppLocation = opportunity.location.toLowerCase();
      if (oppLocation.includes(userCity)) {
        score = Math.min(95, score + 10);
      }
    }
    
    // Bônus para oportunidades remotas
    if (opportunity.location.toLowerCase().includes('remoto')) {
      score = Math.min(95, score + 5);
    }
    
    const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    
    return {
      id: opportunity.id,
      title: opportunity.title,
      organization: opportunity.organization,
      location: opportunity.location,
      description: opportunity.description?.substring(0, 200),
      skills: [],
      matchScore: score,
      matchedSkills: (parsed.matchedSkills || []).slice(0, 4),
      missingSkills: [],
      reasoning: parsed.reasoning || `Match baseado no seu perfil.`,
      recommendation: parsed.recommendation || `Considere esta oportunidade.`,
      priority,
      theme: opportunity.theme
    };
    
  } catch (error) {
    console.error(`Erro no WatsonX:`, error);
    return createBasicMatch(user, opportunity, 50);
  }
}

function createBasicMatch(user: any, opportunity: any, baseScore: number): MatchResult {
  let score = baseScore;
  
  if (user.skills && user.skills.length > 0) {
    const text = `${opportunity.title} ${opportunity.description} ${opportunity.theme}`.toLowerCase();
    let matches = 0;
    
    for (const skill of user.skills) {
      if (text.includes(skill.toLowerCase())) {
        matches++;
      }
    }
    
    if (matches > 0) {
      score = Math.min(80, baseScore + (matches * 10));
    }
  }
  
  const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  
  return {
    id: opportunity.id,
    title: opportunity.title,
    organization: opportunity.organization,
    location: opportunity.location,
    description: opportunity.description?.substring(0, 200),
    skills: [],
    matchScore: score,
    matchedSkills: [],
    missingSkills: [],
    reasoning: `Oportunidade na área de ${opportunity.theme || 'voluntariado'}.`,
    recommendation: score >= 70 ? 'Excelente oportunidade para você!' : 'Considere esta oportunidade.',
    priority,
    theme: opportunity.theme
  };
}