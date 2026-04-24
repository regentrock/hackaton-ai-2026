import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

interface NGOMatch {
  id: string;
  name: string;
  mission: string;
  location: string;
  city: string;
  state: string;
  website: string;
  contactEmail?: string;
  matchScore: number;
  matchReason: string;
  volunteerOpportunities: string[];
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== OPPORTUNITIES API WITH WATSONX ===');
    
    // =========================
    // 1. Autenticação
    // =========================
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - Token não fornecido' },
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

    // =========================
    // 2. Buscar perfil do usuário
    // =========================
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
        availability: true
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

    // =========================
    // 3. Buscar ONGs do GlobalGiving
    // =========================
    const ngos = await fetchNGOsFromGlobalGiving(user.location);
    console.log(`Found ${ngos.length} NGOs from GlobalGiving`);

    if (ngos.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        message: "Nenhuma ONG encontrada na sua região",
        total: 0
      });
    }

    // =========================
    // 4. Gerar IAM token para WatsonX
    // =========================
    let watsonxReady = false;
    let accessToken = null;
    
    if (process.env.IBM_API_KEY && process.env.IBM_URL && process.env.IBM_PROJECT_ID) {
      try {
        const iamRes = await fetch(
          "https://iam.cloud.ibm.com/identity/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
          }
        );

        const iamData = await iamRes.json();

        if (iamData.access_token) {
          accessToken = iamData.access_token;
          watsonxReady = true;
          console.log('✅ Watsonx ready');
        }
      } catch (err) {
        console.error('Error generating IAM token:', err);
      }
    }

    // =========================
    // 5. Calcular matches com Watsonx ou fallback
    // =========================
    let matchedNGOs: NGOMatch[] = [];

    if (watsonxReady && accessToken) {
      console.log('Using Watsonx for smart matching...');
      matchedNGOs = await matchWithWatsonx(user, ngos, accessToken);
    } else {
      console.log('Using fallback matching (no Watsonx)');
      matchedNGOs = matchBySkills(user, ngos);
    }

    // Ordenar por score
    matchedNGOs.sort((a, b) => b.matchScore - a.matchScore);

    // =========================
    // 6. Retornar oportunidades
    // =========================
    return NextResponse.json({
      success: true,
      opportunities: matchedNGOs.slice(0, 10).map(ngo => ({
        id: ngo.id,
        title: `Voluntário na ${ngo.name}`,
        organization: ngo.name,
        location: ngo.location,
        description: ngo.mission,
        skills: ngo.volunteerOpportunities,
        contactEmail: ngo.contactEmail || 'contato@ong.org',
        website: ngo.website,
        matchScore: ngo.matchScore,
        matchReason: ngo.matchReason
      })),
      total: matchedNGOs.length,
      matchedBy: watsonxReady ? 'AI' : 'Skills-based'
    });

  } catch (error: any) {
    console.error('Error in opportunities API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Busca ONGs do GlobalGiving Atlas
 */
async function fetchNGOsFromGlobalGiving(location: string): Promise<any[]> {
  try {
    // Extrair cidade da localização do usuário
    let city = '';
    let state = '';
    
    if (location && location !== 'Não informada') {
      const parts = location.split(',');
      city = parts[0]?.trim().toLowerCase() || '';
      state = parts[1]?.trim().toLowerCase() || '';
    }

    // Chamada para a API do GlobalGiving
    const url = `https://api.globalgiving.org/v2/atlas/organizations/BR?api_key=${process.env.GLOBAL_GIVING_API_KEY}`;
    console.log('Fetching NGOs from:', url.replace(process.env.GLOBAL_GIVING_API_KEY!, '[HIDDEN]'));
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error('GlobalGiving API error:', response.status, response.statusText);
      return getFallbackNGOs();
    }

    const data = await response.json();
    
    let ngos = data.organizations || [];

    // Filtrar por localização se possível
    if (city || state) {
      ngos = ngos.filter((ngo: any) => {
        const ngoCity = ngo.mailing_address?.city?.toLowerCase() || '';
        const ngoState = ngo.mailing_address?.state?.toLowerCase() || '';
        
        return (city && ngoCity.includes(city)) || (state && ngoState.includes(state));
      });
    }

    // Mapear dados relevantes
    return ngos.slice(0, 30).map((ngo: any) => ({
      id: ngo.id,
      name: ngo.name,
      mission: ngo.mission || ngo.description || `${ngo.name} trabalha para promover o bem-estar social e comunitário.`,
      location: `${ngo.mailing_address?.city || ''}, ${ngo.mailing_address?.state || ''}`,
      city: ngo.mailing_address?.city || '',
      state: ngo.mailing_address?.state || '',
      website: ngo.website || '',
      contactEmail: ngo.email || null
    }));

  } catch (error) {
    console.error('Error fetching from GlobalGiving:', error);
    return getFallbackNGOs();
  }
}

/**
 * Match com Watsonx usando IA
 */
async function matchWithWatsonx(
  user: any, 
  ngos: any[], 
  accessToken: string
): Promise<NGOMatch[]> {
  const results: NGOMatch[] = [];
  
  // Processar em lotes para não sobrecarregar a API
  const batchSize = 5;
  for (let i = 0; i < ngos.length; i += batchSize) {
    const batch = ngos.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (ngo) => {
      try {
        const score = await getMatchScoreFromWatsonx(user, ngo, accessToken);
        return {
          ...ngo,
          matchScore: score.score,
          matchReason: score.reason,
          volunteerOpportunities: extractVolunteerNeeds(ngo)
        };
      } catch (error) {
        console.error(`Error matching NGO ${ngo.name}:`, error);
        // Fallback para match básico
        return {
          ...ngo,
          matchScore: calculateBasicMatchScore(user, ngo),
          matchReason: 'Match baseado em localização e interesse geral',
          volunteerOpportunities: ['Trabalho voluntário geral']
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Pequena pausa entre lotes
    if (i + batchSize < ngos.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Obtém score de match do Watsonx
 */
async function getMatchScoreFromWatsonx(
  user: any,
  ngo: any,
  accessToken: string
): Promise<{ score: number; reason: string }> {
  const prompt = `You are an AI that matches volunteers with NGOs. Analyze the match between this volunteer and NGO.

VOLUNTEER PROFILE:
- Name: ${user.name}
- Skills: ${user.skills?.join(', ') || 'Nenhuma habilidade específica listada'}
- About: ${user.description || 'Voluntário interessado em ajudar'}
- Availability: ${user.availability || 'Flexível'}
- Location: ${user.location || 'Não informada'}

NGO PROFILE:
- Name: ${ngo.name}
- Mission: ${ngo.mission}
- Location: ${ngo.location}

Based on the volunteer's skills and the NGO's mission, provide:
1. A match score from 0 to 100
2. A brief reason explaining the match

Return ONLY valid JSON with fields "score" and "reason".
Example: {"score": 85, "reason": "Volunteer's skills in education align perfectly with NGO's mission to teach children"}

CRITICAL: Return ONLY the JSON object, no other text.`;

  try {
    const watsonRes = await fetch(
      `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: prompt,
          model_id: "ibm/granite-3-8b-instruct",
          project_id: process.env.IBM_PROJECT_ID,
          parameters: {
            decoding_method: "greedy",
            max_new_tokens: 200,
            temperature: 0.1,
          },
        }),
      }
    );

    const data = await watsonRes.json();
    
    if (!data.results || !data.results[0]) {
      throw new Error('Invalid Watsonx response');
    }

    let text = data.results[0].generated_text;
    
    // Limpar resposta
    text = text.replace(/```json\n?/g, '');
    text = text.replace(/```\n?/g, '');
    text = text.trim();
    
    // Extrair JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    return {
      score: Math.min(100, Math.max(0, result.score || 50)),
      reason: result.reason || 'Match baseado no perfil do voluntário'
    };
    
  } catch (error) {
    console.error('Watsonx match error:', error);
    return {
      score: calculateBasicMatchScore(user, ngo),
      reason: 'Match baseado em localização e área de atuação'
    };
  }
}

/**
 * Match por habilidades (fallback)
 */
function matchBySkills(user: any, ngos: any[]): NGOMatch[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  
  return ngos.map(ngo => {
    let score = 50; // Score base
    
    // Bonus por localização
    if (user.location && ngo.location) {
      if (ngo.location.toLowerCase().includes(user.location.toLowerCase())) {
        score += 20;
      }
    }
    
    // Bonus por palavras-chave na missão
    const mission_lower = ngo.mission.toLowerCase();
    userSkills.forEach((skill: string) => {
      if (mission_lower.includes(skill)) {
        score += 10;
      }
    });
    
    return {
      ...ngo,
      matchScore: Math.min(100, score),
      matchReason: 'Match baseado em localização e área de atuação da ONG',
      volunteerOpportunities: extractVolunteerNeeds(ngo)
    };
  });
}

/**
 * Score básico para fallback
 */
function calculateBasicMatchScore(user: any, ngo: any): number {
  let score = 60;
  
  if (user.location && ngo.location) {
    if (ngo.location.toLowerCase().includes(user.location.toLowerCase())) {
      score += 20;
    }
  }
  
  if (user.skills && user.skills.length > 0) {
    score += 10;
  }
  
  return Math.min(100, score);
}

/**
 * Extrai necessidades de voluntariado da missão da ONG
 */
function extractVolunteerNeeds(ngo: any): string[] {
  const needs = [];
  const mission = ngo.mission.toLowerCase();
  
  if (mission.includes('educa') || mission.includes('ensin')) {
    needs.push('Educação');
  }
  if (mission.includes('saúde') || mission.includes('medic')) {
    needs.push('Saúde');
  }
  if (mission.includes('ambient') || mission.includes('ecolog')) {
    needs.push('Meio Ambiente');
  }
  if (mission.includes('social') || mission.includes('comunidade')) {
    needs.push('Ação Social');
  }
  if (mission.includes('criança') || mission.includes('infantil')) {
    needs.push('Trabalho com Crianças');
  }
  
  if (needs.length === 0) {
    needs.push('Voluntariado Geral');
  }
  
  return needs;
}

/**
 * ONGs de fallback caso a API falhe
 */
function getFallbackNGOs(): any[] {
  return [
    {
      id: '1',
      name: 'Cruz Vermelha Brasileira',
      mission: 'Oferecer assistência humanitária e serviços de saúde em situações de emergência e desastres naturais.',
      location: 'Brasília, DF',
      website: 'https://www.cruzvermelha.org.br'
    },
    {
      id: '2',
      name: 'Greenpeace Brasil',
      mission: 'Proteger o meio ambiente através de campanhas de conscientização e ações diretas não-violentas.',
      location: 'São Paulo, SP',
      website: 'https://www.greenpeace.org.br'
    },
    {
      id: '3',
      name: 'Instituto Ayrton Senna',
      mission: 'Desenvolver programas educacionais para jovens brasileiros, promovendo oportunidades de desenvolvimento.',
      location: 'São Paulo, SP',
      website: 'https://institutoayrtonsenna.org.br'
    },
    {
      id: '4',
      name: 'Banco de Alimentos',
      mission: 'Combatendo a fome e o desperdício de alimentos através de doações e distribuição para comunidades carentes.',
      location: 'Rio de Janeiro, RJ',
      website: 'https://bancodealimentos.org.br'
    }
  ];
}