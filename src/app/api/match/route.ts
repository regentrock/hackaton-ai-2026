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
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== MATCH API - DYNAMIC MATCHING ===');
    
    // 1. Autenticação
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log('User:', user.name);
    console.log('Skills:', user.skills);
    console.log('Location:', user.location);

    // 3. Buscar oportunidades da GlobalGiving (sem cache)
    const opportunities = await fetchFreshOpportunities(user);
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: false,
        matches: [],
        message: 'No opportunities found at this moment. Please try again later.'
      });
    }

    console.log(`Found ${opportunities.length} opportunities to analyze`);

    // 4. Usar WatsonX para matching inteligente
    let matches: MatchResult[] = [];
    
    try {
      matches = await performIntelligentMatching(user, opportunities);
      console.log(`✅ AI matching completed: ${matches.length} personalized matches`);
    } catch (aiError) {
      console.error('AI matching error, using fallback:', aiError);
      matches = performFallbackMatching(user, opportunities);
    }

    // 5. Ordenar e retornar
    matches.sort((a: MatchResult, b: MatchResult) => b.matchScore - a.matchScore);
    
    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 15),
      total: matches.length,
      usingAI: true,
      userSkills: user.skills || [],
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Match API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchFreshOpportunities(user: any): Promise<any[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('No API key');
    return [];
  }

  try {
    // Sem cache - sempre buscar dados frescos
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`GlobalGiving API error: ${response.status}`);
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    // Extrair skills de cada projeto baseado no texto
    return projects.slice(0, 50).map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      skills: extractRelevantSkills(project, user.skills),
      theme: project.themeName || 'Social Impact',
      url: project.projectLink
    }));
    
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return [];
  }
}

function extractRelevantSkills(project: any, userSkills: string[]): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  // Mapeamento inteligente de skills
  const skillMap = [
    { keywords: ['ensin', 'educa', 'profess', 'escola', 'criança', 'alfabetizacao', 'pedagogia', 'aula', 'formacao'], skill: 'Ensino' },
    { keywords: ['ingles', 'english', 'idioma', 'foreign language'], skill: 'Inglês' },
    { keywords: ['programa', 'codigo', 'software', 'web', 'desenvolvimento', 'tecnologia', 'tech', 'desenvolver'], skill: 'Programação' },
    { keywords: ['saude', 'medicina', 'enfermagem', 'cuidado', 'bem-estar', 'hospital'], skill: 'Saúde' },
    { keywords: ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem', 'natureza'], skill: 'Meio Ambiente' },
    { keywords: ['social', 'comunidade', 'assistencia', 'voluntariado', 'familia'], skill: 'Ação Social' },
    { keywords: ['cultura', 'arte', 'teatro', 'musica', 'danca', 'oficina'], skill: 'Arte e Cultura' },
    { keywords: ['esporte', 'futebol', 'atividade fisica', 'recreacao'], skill: 'Esportes' },
    { keywords: ['cozinha', 'alimentacao', 'culinaria', 'refeicao'], skill: 'Culinária' }
  ];
  
  for (const item of skillMap) {
    if (item.keywords.some((kw: string) => text.includes(kw))) {
      skills.push(item.skill);
    }
  }
  
  // Adicionar skills baseadas nas skills do usuário para melhor match
  if (userSkills && userSkills.length > 0) {
    for (const userSkill of userSkills) {
      const userSkillLower = userSkill.toLowerCase();
      if (text.includes(userSkillLower) && !skills.includes(userSkill)) {
        skills.push(userSkill);
      }
    }
  }
  
  return [...new Set(skills)].slice(0, 5);
}

async function performIntelligentMatching(user: any, opportunities: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  // Processar em lotes para não sobrecarregar a API
  const batchSize = 5;
  
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    
    // Para cada oportunidade, fazer análise personalizada
    const batchPromises = batch.map(async (opportunity: any) => {
      return await analyzeMatchWithAI(user, opportunity);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Pequena pausa entre lotes para evitar rate limiting
    if (i + batchSize < opportunities.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

async function analyzeMatchWithAI(user: any, opportunity: any): Promise<MatchResult> {
  // Calcular score básico primeiro
  const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
  
  // Se tiver IBM WatsonX configurado, usar IA para análise mais precisa
  if (process.env.IBM_API_KEY && process.env.IBM_URL && process.env.IBM_PROJECT_ID) {
    try {
      const aiResult = await callWatsonX(user, opportunity);
      return aiResult;
    } catch (error) {
      console.error('WatsonX error, using fallback:', error);
      return createFallbackResult(opportunity, user, basicScore);
    }
  }
  
  return createFallbackResult(opportunity, user, basicScore);
}

async function callWatsonX(user: any, opportunity: any): Promise<MatchResult> {
  const accessToken = await getIAMToken();
  
  const prompt = `You are an expert volunteer matching AI. Analyze this specific match.

VOLUNTEER:
- Skills: ${user.skills?.join(', ') || 'None listed'}
- Location: ${user.location || 'Not specified'}
- Availability: ${user.availability || 'Flexible'}

OPPORTUNITY:
- Title: ${opportunity.title}
- Organization: ${opportunity.organization}
- Required Skills: ${opportunity.skills?.join(', ') || 'Not specified'}
- Description: ${opportunity.description?.substring(0, 400)}

INSTRUCTIONS:
1. Find EXACT skills from volunteer that match this opportunity
2. Calculate match score (0-100) based ONLY on skill overlap
3. Provide a personalized recommendation in Portuguese

OUTPUT (JSON only):
{
  "score": number,
  "reasoning": "Em português: análise do match baseado nas habilidades",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "recommendation": "Em português: recomendação personalizada"
}`;

  const response = await fetch(`${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`, {
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
        max_new_tokens: 300,
        temperature: 0.3,
        min_new_tokens: 50,
      },
    }),
  });

  const data = await response.json();
  const aiText = data.results[0].generated_text;
  
  // Parse da resposta da IA
  const cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    const score = Math.min(100, Math.max(0, parsed.score || 50));
    if (score >= 70) priority = 'high';
    else if (score >= 40) priority = 'medium';
    else priority = 'low';
    
    return {
      id: opportunity.id,
      title: opportunity.title,
      organization: opportunity.organization,
      location: opportunity.location,
      description: opportunity.description,
      skills: opportunity.skills,
      matchScore: score,
      matchedSkills: (parsed.matchedSkills || []).slice(0, 3),
      missingSkills: (parsed.missingSkills || []).slice(0, 3),
      reasoning: parsed.reasoning || `Match baseado nas habilidades do voluntário.`,
      recommendation: parsed.recommendation || `Considere se candidatar a esta oportunidade.`,
      priority
    };
  }
  
  return createFallbackResult(opportunity, user, calculateBasicScore(user.skills || [], opportunity.skills));
}

async function getIAMToken(): Promise<string> {
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
  });
  
  const data = await response.json();
  return data.access_token;
}

function calculateBasicScore(userSkills: string[], projectSkills: string[]): number {
  if (!userSkills.length) return 30;
  if (!projectSkills.length) return 40;
  
  const userSkillsLower = userSkills.map((s: string) => s.toLowerCase());
  const projectSkillsLower = projectSkills.map((s: string) => s.toLowerCase());
  
  let matches = 0;
  for (const userSkill of userSkillsLower) {
    for (const projSkill of projectSkillsLower) {
      if (userSkill.includes(projSkill) || projSkill.includes(userSkill)) {
        matches++;
        break;
      }
    }
  }
  
  const score = (matches / Math.max(projectSkillsLower.length, 1)) * 100;
  return Math.min(100, Math.max(10, Math.floor(score)));
}

function createFallbackResult(opportunity: any, user: any, score: number): MatchResult {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const projectSkills = opportunity.skills?.map((s: string) => s.toLowerCase()) || [];
  
  const matchedSkills = projectSkills.filter((ps: string) =>
    userSkills.some((us: string) => us.includes(ps) || ps.includes(us))
  );
  
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (score >= 70) priority = 'high';
  else if (score >= 40) priority = 'medium';
  else priority = 'low';
  
  return {
    id: opportunity.id,
    title: opportunity.title,
    organization: opportunity.organization,
    location: opportunity.location,
    description: opportunity.description,
    skills: opportunity.skills,
    matchScore: score,
    matchedSkills: matchedSkills.slice(0, 3),
    missingSkills: [],
    reasoning: `Oportunidade na área de ${opportunity.theme || 'impacto social'}.`,
    recommendation: `Recomendamos avaliar esta oportunidade baseado no seu perfil.`,
    priority
  };
}

function performFallbackMatching(user: any, opportunities: any[]): MatchResult[] {
  return opportunities.slice(0, 15).map((opp: any) => {
    const score = calculateBasicScore(user.skills || [], opp.skills);
    const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
    const oppSkills = opp.skills?.map((s: string) => s.toLowerCase()) || [];
    
    const matchedSkills = oppSkills.filter((ps: string) =>
      userSkills.some((us: string) => us.includes(ps) || ps.includes(us))
    );
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (score >= 70) priority = 'high';
    else if (score >= 40) priority = 'medium';
    else priority = 'low';
    
    return {
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description,
      skills: opp.skills,
      matchScore: score,
      matchedSkills: matchedSkills.slice(0, 3),
      missingSkills: [],
      reasoning: `Oportunidade na área de ${opp.theme || 'impacto social'}.`,
      recommendation: `Considere esta oportunidade baseado no seu perfil.`,
      priority
    };
  });
}