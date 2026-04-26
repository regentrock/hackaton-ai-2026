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

// Cache do token IAM (expira em 50 minutos)
let cachedIAMToken: string | null = null;
let iamTokenExpiry: number = 0;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API INICIADA ==========');
  
  try {
    // =========================
    // 1. AUTENTICAÇÃO
    // =========================
    console.log('🔐 [1/5] Verificando autenticação...');
    
    let token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        console.log('📌 Token obtido do header Authorization');
      } else {
        console.log('❌ Nenhum token encontrado');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      console.log('📌 Token obtido dos cookies');
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('❌ Token inválido ou expirado');
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    console.log('✅ Token validado com sucesso para usuário ID:', decoded.userId);

    // =========================
    // 2. BUSCAR PERFIL DO USUÁRIO
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
      console.log('❌ Usuário não encontrado no banco de dados');
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log('✅ Perfil encontrado:');
    console.log(`   - Nome: ${user.name}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Localização: ${user.location || 'Não informada'}`);
    console.log(`   - Habilidades: ${user.skills?.length ? user.skills.join(', ') : 'Nenhuma'}`);
    console.log(`   - Disponibilidade: ${user.availability || 'Não informada'}`);

    // =========================
    // 3. BUSCAR OPORTUNIDADES (COM PAGINAÇÃO E CACHE)
    // =========================
    console.log('\n🌍 [3/5] Buscando oportunidades da GlobalGiving...');
    
    const opportunities = await fetchOpportunitiesWithCache(user);
    
    if (opportunities.length === 0) {
      console.log('❌ Nenhuma oportunidade encontrada');
      return NextResponse.json({
        success: false,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento. Tente novamente mais tarde.'
      });
    }

    console.log(`✅ ${opportunities.length} oportunidades encontradas para análise`);

    // =========================
    // 4. MATCHING INTELIGENTE OTIMIZADO
    // =========================
    console.log('\n🧠 [4/5] Iniciando matching inteligente...');
    
    const hasWatsonX = !!(process.env.IBM_API_KEY && process.env.IBM_URL && process.env.IBM_PROJECT_ID);
    console.log(`📊 Configuração WatsonX: ${hasWatsonX ? '✅ ATIVADO' : '❌ DESATIVADO (usando fallback)'}`);
    
    if (hasWatsonX) {
      console.log('   - IBM_API_KEY:', process.env.IBM_API_KEY ? '✅ Presente' : '❌ Ausente');
      console.log('   - IBM_URL:', process.env.IBM_URL ? '✅ Presente' : '❌ Ausente');
      console.log('   - IBM_PROJECT_ID:', process.env.IBM_PROJECT_ID ? '✅ Presente' : '❌ Ausente');
    }
    
    let matches: MatchResult[] = [];
    
    try {
      matches = await performIntelligentMatchingOptimized(user, opportunities, hasWatsonX);
      console.log(`🎯 Matching concluído: ${matches.length} oportunidades analisadas`);
      console.log(`   - Alta compatibilidade: ${matches.filter(m => m.priority === 'high').length}`);
      console.log(`   - Média compatibilidade: ${matches.filter(m => m.priority === 'medium').length}`);
      console.log(`   - Baixa compatibilidade: ${matches.filter(m => m.priority === 'low').length}`);
    } catch (aiError) {
      console.error('❌ Erro no matching inteligente:', aiError);
      console.log('🔄 Executando fallback matching...');
      matches = performFallbackMatchingOptimized(user, opportunities);
    }

    // =========================
    // 5. ORDENAR E RETORNAR
    // =========================
    console.log('\n📊 [5/5] Organizando resultados...');
    
    matches.sort((a: MatchResult, b: MatchResult) => b.matchScore - a.matchScore);
    
    const executionTime = Date.now() - startTime;
    console.log(`\n✨ ========== MATCH API FINALIZADA ==========`);
    console.log(`⏱️  Tempo total: ${executionTime}ms`);
    console.log(`📊 Base analisada: ${opportunities.length} projetos`);
    console.log(`🎯 Resultados: ${matches.length} matches calculados`);
    console.log(`🤖 IA utilizada: ${hasWatsonX ? '✅ SIM (WatsonX)' : '❌ NÃO (Fallback)'}`);
    console.log(`📈 Retornando: ${Math.min(matches.length, 10)} melhores matches\n`);
    
    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 10),
      total: matches.length,
      totalAnalyzed: opportunities.length,
      usingAI: hasWatsonX,
      userSkills: user.skills || [],
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ ERRO FATAL NA MATCH API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Função com cache para buscar oportunidades
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
    console.error('   ❌ GLOBAL_GIVING_API_KEY não configurada');
    return [];
  }

  try {
    let allProjects: any[] = [];
    let nextProjectId: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 5;
    
    console.log(`   🔍 Buscando projetos em até ${MAX_PAGES} páginas...`);
    
    while (pageCount < MAX_PAGES) {
      let url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
      if (nextProjectId) {
        url += `&nextProjectId=${nextProjectId}`;
      }
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        console.error(`   ❌ GlobalGiving API erro página ${pageCount + 1}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const projects = data.projects?.project || [];
      allProjects = [...allProjects, ...projects];
      
      const hasNext = data.projects?.hasNext === 'true' || data.projects?.hasNext === true;
      nextProjectId = data.projects?.nextProjectId || null;
      
      pageCount++;
      console.log(`   📄 Página ${pageCount}: +${projects.length} projetos (total: ${allProjects.length})`);
      
      if (!hasNext || !nextProjectId) {
        console.log(`   📄 Fim da paginação na página ${pageCount}`);
        break;
      }
    }
    
    console.log(`   ✅ TOTAL: ${allProjects.length} projetos recebidos da GlobalGiving`);
    
    const projectsToAnalyze = allProjects.slice(0, 250);
    console.log(`   🔍 Analisando ${projectsToAnalyze.length} projetos (máximo 250 para performance)`);
    
    const enrichedProjects = projectsToAnalyze.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      skills: extractRelevantSkills(project, user.skills),
      theme: project.themeName || 'Impacto Social',
      url: project.projectLink
    }));
    
    const projectsWithSkills = enrichedProjects.filter(p => p.skills.length > 0);
    console.log(`   🎯 ${projectsWithSkills.length} projetos com skills identificadas`);
    
    // Armazenar em cache
    cachedProjects = projectsWithSkills;
    cacheTimestamp = now;
    
    return projectsWithSkills;
    
  } catch (error) {
    console.error('   ❌ Erro ao buscar oportunidades:', error);
    return cachedProjects || [];
  }
}

function extractRelevantSkills(project: any, userSkills: string[]): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  const skillMap = [
    { keywords: ['ensin', 'educa', 'profess', 'escola', 'criança', 'alfabetizacao', 'pedagogia', 'aula', 'formacao'], skill: 'Educação' },
    { keywords: ['ingles', 'english', 'idioma', 'lingua', 'foreign language'], skill: 'Inglês' },
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
  
  if (userSkills && userSkills.length > 0) {
    for (const userSkill of userSkills) {
      const userSkillLower = userSkill.toLowerCase();
      if (text.includes(userSkillLower) && !skills.includes(userSkill)) {
        skills.push(userSkill);
      }
    }
  }
  
  if (skills.length === 0) {
    skills.push('Voluntariado Geral');
  }
  
  return [...new Set(skills)].slice(0, 5);
}

// Versão otimizada do matching inteligente
async function performIntelligentMatchingOptimized(
  user: any, 
  opportunities: any[], 
  hasWatsonX: boolean
): Promise<MatchResult[]> {
  console.log('\n🤖 INICIANDO ANÁLISE INTELIGENTE OTIMIZADA...');
  console.log(`🎯 Skills do usuário: ${user.skills?.join(', ') || 'NENHUMA'}`);
  console.log(`📊 Total de oportunidades: ${opportunities.length}`);
  
  // PRÉ-FILTRO: reduzir para TOP 80 projetos mais promissores antes da IA
  const preFiltered = preFilterOpportunitiesFast(opportunities, user.skills || []);
  console.log(`   🔍 Pré-filtro: ${opportunities.length} → ${preFiltered.length} projetos com potencial`);
  
  const results: MatchResult[] = [];
  const concurrencyLimit = 3; // Processar 3 simultaneamente
  
  // Processar em lotes paralelos
  for (let i = 0; i < preFiltered.length; i += concurrencyLimit) {
    const batch = preFiltered.slice(i, i + concurrencyLimit);
    const batchNum = Math.floor(i / concurrencyLimit) + 1;
    const totalBatches = Math.ceil(preFiltered.length / concurrencyLimit);
    
    console.log(`\n📦 Processando lote ${batchNum}/${totalBatches} (${batch.length} oportunidades em paralelo)`);
    
    const batchPromises = batch.map(async (opportunity: any, idx: number) => {
      console.log(`   🔍 Analisando: "${opportunity.title.substring(0, 45)}..."`);
      return await analyzeMatchWithAI(user, opportunity, hasWatsonX);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    const scores = batchResults.map(r => r.matchScore).join(', ');
    console.log(`   ✅ Lote ${batchNum} concluído. Scores: ${scores}%`);
  }
  
  return results;
}

// Pré-filtro rápido para reduzir projetos analisados pela IA
function preFilterOpportunitiesFast(opportunities: any[], userSkills: string[]): any[] {
  if (!userSkills.length) return opportunities.slice(0, 60);
  
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  
  const scored = opportunities.map(opp => {
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
    
    return { opp, score };
  });
  
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map(item => item.opp);
}

async function analyzeMatchWithAI(
  user: any, 
  opportunity: any, 
  hasWatsonX: boolean
): Promise<MatchResult> {
  if (hasWatsonX) {
    console.log(`      🧠 Chamando WatsonX...`);
    try {
      const aiResult = await callWatsonXForMatchOptimized(user, opportunity);
      console.log(`      ✅ Score: ${aiResult.matchScore}%`);
      return aiResult;
    } catch (error) {
      console.error(`      ❌ WatsonX falhou:`, error);
      const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
      return createFallbackResult(opportunity, user, basicScore);
    }
  } else {
    const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
    console.log(`      📊 Score: ${basicScore}% (fallback)`);
    return createFallbackResult(opportunity, user, basicScore);
  }
}

// Versão otimizada com timeout e cache de token
async function callWatsonXForMatchOptimized(user: any, opportunity: any): Promise<MatchResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // Timeout de 8 segundos
  
  try {
    const accessToken = await getIAMTokenCached();
    
    // Prompt reduzido para resposta mais rápida
    const prompt = `Compare volunteer skills with opportunity. Return ONLY JSON.

Volunteer Skills: ${user.skills?.join(', ') || 'None'}
Opportunity: ${opportunity.title}
Required Skills: ${opportunity.skills?.join(', ') || 'Not specified'}

Output: {"score": number, "reasoning": "em português resumido", "matchedSkills": [], "missingSkills": [], "recommendation": "em português"}`;

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
          max_new_tokens: 200, // Reduzido
          temperature: 0.1,
        },
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const aiText = data.results[0].generated_text;
    const cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) throw new Error('No JSON found');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const userSkillsLower = user.skills?.map((s: string) => s.toLowerCase()) || [];
    const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
      userSkillsLower.some((us: string) => us.includes(skill.toLowerCase()))
    );
    
    let score = Math.min(100, Math.max(0, parsed.score || 50));
    
    if (validMatchedSkills.length > 0 && user.skills?.length > 0) {
      const skillMatchRatio = validMatchedSkills.length / Math.max(opportunity.skills?.length || 1, 1);
      score = Math.floor(Math.min(100, Math.max(0, score * (0.7 + skillMatchRatio * 0.3))));
    }
    
    const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    
    console.log(`         ⏱️  ${Date.now() - startTime}ms`);
    
    return {
      id: opportunity.id,
      title: opportunity.title,
      organization: opportunity.organization,
      location: opportunity.location,
      description: opportunity.description,
      skills: opportunity.skills,
      matchScore: score,
      matchedSkills: validMatchedSkills.slice(0, 4),
      missingSkills: (parsed.missingSkills || []).slice(0, 3),
      reasoning: parsed.reasoning || `Análise baseada nas suas habilidades.`,
      recommendation: parsed.recommendation || `Esta oportunidade pode ser uma boa opção para você.`,
      priority
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Cache do token IAM
async function getIAMTokenCached(): Promise<string> {
  if (cachedIAMToken && Date.now() < iamTokenExpiry) {
    return cachedIAMToken;
  }
  
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
  });
  
  if (!response.ok) {
    throw new Error(`IAM token failed: ${response.status}`);
  }
  
  const data = await response.json();
  const newToken = data.access_token;
  
  if (!newToken || typeof newToken !== 'string') {
    throw new Error('Invalid token received');
  }
  
  cachedIAMToken = newToken;
  iamTokenExpiry = Date.now() + 50 * 60 * 1000;
  
  return cachedIAMToken;
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

function performFallbackMatchingOptimized(user: any, opportunities: any[]): MatchResult[] {
  console.log('📋 Executando fallback matching rápido...');
  
  // Pegar apenas os primeiros 30 para fallback mais rápido
  const topOpportunities = opportunities.slice(0, 30);
  
  return topOpportunities.map((opp: any) => {
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