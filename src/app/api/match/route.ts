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

// Cache em memória para projetos da GlobalGiving (1 hora)
let cachedProjects: any[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API INICIADA ==========');
  
  try {
    // =========================
    // 1. AUTENTICAÇÃO (rápida)
    // =========================
    console.log('🔐 [1/5] Verificando autenticação...');
    
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // =========================
    // 2. BUSCAR PERFIL (paralelo)
    // =========================
    console.log('\n👤 [2/5] Buscando perfil do usuário...');
    
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

    console.log(`✅ Perfil: ${user.name} | Habilidades: ${user.skills?.length || 0}`);

    // =========================
    // 3. BUSCAR OPORTUNIDADES (com cache)
    // =========================
    console.log('\n🌍 [3/5] Buscando oportunidades...');
    
    const opportunities = await fetchOpportunitiesWithCache(user);
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: false,
        matches: [],
        message: 'Nenhuma oportunidade encontrada.'
      });
    }

    console.log(`✅ ${opportunities.length} oportunidades para análise`);

    // =========================
    // 4. MATCHING INTELIGENTE OTIMIZADO
    // =========================
    console.log('\n🧠 [4/5] Iniciando matching inteligente...');
    
    const hasWatsonX = !!(process.env.IBM_API_KEY && process.env.IBM_URL && process.env.IBM_PROJECT_ID);
    
    // PRÉ-FILTRO RÁPIDO: só analisar projetos com potencial
    const filteredOpportunities = preFilterOpportunities(opportunities, user.skills || []);
    console.log(`   📊 Pré-filtro: ${opportunities.length} → ${filteredOpportunities.length} projetos com potencial`);
    
    // Limitar análise aos TOP 50 mais promissores após pré-filtro
    const topOpportunities = filteredOpportunities.slice(0, 50);
    
    let matches: MatchResult[] = [];
    
    if (hasWatsonX && topOpportunities.length > 0) {
      // Processar em paralelo com limite de concorrência
      matches = await parallelMatching(user, topOpportunities, 3); // 3 análises simultâneas
    } else {
      // Fallback rápido (sem IA)
      matches = performFallbackMatching(user, topOpportunities.slice(0, 20));
    }

    // =========================
    // 5. ORDENAR E RETORNAR
    // =========================
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    const executionTime = Date.now() - startTime;
    console.log(`\n✨ ========== FINALIZADA em ${executionTime}ms ==========`);
    console.log(`📊 Analisados: ${topOpportunities.length} | Retornados: ${Math.min(matches.length, 10)}`);
    
    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 10),
      total: matches.length,
      totalAnalyzed: topOpportunities.length,
      usingAI: hasWatsonX,
      userSkills: user.skills || [],
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Cache para evitar buscar projetos repetidamente
async function fetchOpportunitiesWithCache(user: any): Promise<any[]> {
  const now = Date.now();
  
  // Verificar cache válido
  if (cachedProjects && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('   📦 Usando cache de projetos (válido por mais 1 hora)');
    return cachedProjects;
  }
  
  console.log('   🔄 Buscando projetos frescos da GlobalGiving...');
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    let allProjects: any[] = [];
    let nextProjectId: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 3; // Reduzido de 5 para 3 para melhor performance
    const startFetch = Date.now();
    
    // Buscar páginas em paralelo (otimização)
    const pagePromises = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      let url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
      if (nextProjectId) url += `&nextProjectId=${nextProjectId}`;
      
      pagePromises.push(
        fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            const projects = data.projects?.project || [];
            nextProjectId = data.projects?.nextProjectId || null;
            return projects;
          })
      );
      
      if (!nextProjectId) break;
    }
    
    const results = await Promise.all(pagePromises);
    allProjects = results.flat();
    
    console.log(`   ✅ Busca concluída em ${Date.now() - startFetch}ms - ${allProjects.length} projetos`);
    
    // Enriquecer projetos
    const enriched = allProjects.slice(0, 150).map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      skills: extractRelevantSkillsFast(project, user.skills),
      theme: project.themeName || 'Impacto Social',
      url: project.projectLink
    }));
    
    // Armazenar em cache
    cachedProjects = enriched.filter(p => p.skills.length > 0);
    cacheTimestamp = now;
    
    return cachedProjects;
    
  } catch (error) {
    console.error('   ❌ Erro:', error);
    return cachedProjects || [];
  }
}

// Versão rápida de extração de skills (sem loops desnecessários)
function extractRelevantSkillsFast(project: any, userSkills: string[]): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.themeName || ''}`.toLowerCase();
  
  // Mapeamento otimizado com verificação única
  if (/ensin|educa|profess|escola|criança|alfabetizacao|pedagogia|aula|formacao/.test(text)) {
    skills.push('Educação');
  }
  if (/ingles|english|idioma|lingua/.test(text)) {
    skills.push('Inglês');
  }
  if (/programa|codigo|software|web|desenvolvimento|tecnologia|tech/.test(text)) {
    skills.push('Programação');
  }
  if (/saude|medicina|enfermagem|cuidado|bem-estar|hospital/.test(text)) {
    skills.push('Saúde');
  }
  if (/ambiente|ecologia|sustentabilidade|reciclagem|natureza/.test(text)) {
    skills.push('Meio Ambiente');
  }
  if (/social|comunidade|assistencia|voluntariado|familia/.test(text)) {
    skills.push('Ação Social');
  }
  if (/cultura|arte|teatro|musica|danca|oficina/.test(text)) {
    skills.push('Arte e Cultura');
  }
  if (/esporte|futebol|atividade fisica|recreacao/.test(text)) {
    skills.push('Esportes');
  }
  if (/cozinha|alimentacao|culinaria|refeicao/.test(text)) {
    skills.push('Culinária');
  }
  
  if (skills.length === 0) {
    skills.push('Voluntariado Geral');
  }
  
  return skills.slice(0, 3);
}

// Pré-filtro rápido para reduzir projetos analisados pela IA
function preFilterOpportunities(opportunities: any[], userSkills: string[]): any[] {
  if (!userSkills.length) return opportunities.slice(0, 30);
  
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  
  // Calcular score rápido sem IA
  return opportunities
    .map(opp => {
      let score = 0;
      const oppSkillsLower = opp.skills.map((s: string) => s.toLowerCase());
      
      for (const userSkill of userSkillsLower) {
        for (const oppSkill of oppSkillsLower) {
          if (oppSkill.includes(userSkill) || userSkill.includes(oppSkill)) {
            score += 25;
            break;
          }
        }
      }
      
      // Bônus por localização
      if (userSkillsLower.includes('remoto') || opp.location.toLowerCase().includes('remoto')) {
        score += 10;
      }
      
      return { opp, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.opp);
}

// Matching paralelo com limite de concorrência
async function parallelMatching(
  user: any, 
  opportunities: any[], 
  concurrency: number = 3
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const chunks = [];
  
  // Dividir em chunks para processamento paralelo
  for (let i = 0; i < opportunities.length; i += concurrency) {
    chunks.push(opportunities.slice(i, i + concurrency));
  }
  
  console.log(`   🚀 Processando ${chunks.length} lotes em paralelo (${concurrency} por vez)`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const startChunk = Date.now();
    
    // Processar chunk em paralelo
    const chunkResults = await Promise.all(
      chunk.map(async (opp) => {
        try {
          return await callWatsonXForMatchOptimized(user, opp);
        } catch {
          const basicScore = calculateBasicScore(user.skills || [], opp.skills);
          return createFallbackResult(opp, user, basicScore);
        }
      })
    );
    
    results.push(...chunkResults);
    console.log(`   📦 Lote ${i + 1}/${chunks.length} concluído em ${Date.now() - startChunk}ms`);
  }
  
  return results;
}

// Versão otimizada da chamada WatsonX (timeout e retry)
async function callWatsonXForMatchOptimized(user: any, opportunity: any): Promise<MatchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // Timeout de 8 segundos
  
  try {
    // Obter token IAM (com cache)
    const accessToken = await getIAMTokenCached();
    
    const prompt = `Compare volunteer skills with opportunity. Return ONLY JSON.

Volunteer Skills: ${user.skills?.join(', ') || 'None'}
Opportunity: ${opportunity.title}
Required Skills: ${opportunity.skills?.join(', ') || 'Not specified'}

Output: {"score": number, "reasoning": "em português", "matchedSkills": [], "missingSkills": [], "recommendation": "em português"}`;

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
          max_new_tokens: 200, // Reduzido para resposta mais rápida
          temperature: 0.1,
        },
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const aiText = data.results[0].generated_text;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.min(100, Math.max(0, parsed.score || 50));
      const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
      
      const userSkillsLower = user.skills?.map((s: string) => s.toLowerCase()) || [];
      const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
        userSkillsLower.some((us: string) => us.includes(skill.toLowerCase()))
      );
      
      return {
        id: opportunity.id,
        title: opportunity.title,
        organization: opportunity.organization,
        location: opportunity.location,
        description: opportunity.description,
        skills: opportunity.skills,
        matchScore: score,
        matchedSkills: validMatchedSkills.slice(0, 3),
        missingSkills: (parsed.missingSkills || []).slice(0, 2),
        reasoning: parsed.reasoning || `Match baseado no seu perfil.`,
        recommendation: parsed.recommendation || `Candidate-se a esta oportunidade!`,
        priority
      };
    }
    
    throw new Error('Parse error');
    
  } catch (error) {
    clearTimeout(timeoutId);
    const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
    return createFallbackResult(opportunity, user, basicScore);
  }
}

let cachedIAMToken: string | null = null;
let iamTokenExpiry: number = 0;

async function getIAMTokenCached(): Promise<string> {
  // Verificar se temos token em cache e ainda válido
  if (cachedIAMToken && Date.now() < iamTokenExpiry) {
    return cachedIAMToken;
  }
  
  // Buscar novo token
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get IAM token: ${response.status}`);
  }
  
  const data = await response.json();
  const newToken = data.access_token;
  
  if (!newToken || typeof newToken !== 'string') {
    throw new Error('Invalid IAM token received - token is not a string');
  }
  
  cachedIAMToken = newToken;
  iamTokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutos
  
  return cachedIAMToken; // Agora TypeScript sabe que é string devido à validação
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
  
  const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  
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
  return opportunities.map((opp: any) => {
    const score = calculateBasicScore(user.skills || [], opp.skills);
    const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
    const oppSkills = opp.skills?.map((s: string) => s.toLowerCase()) || [];
    
    const matchedSkills = oppSkills.filter((ps: string) =>
      userSkills.some((us: string) => us.includes(ps) || ps.includes(us))
    );
    
    const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    
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