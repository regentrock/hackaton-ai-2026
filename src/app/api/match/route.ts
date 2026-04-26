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
    // 3. BUSCAR OPORTUNIDADES (COM PAGINAÇÃO)
    // =========================
    console.log('\n🌍 [3/5] Buscando oportunidades da GlobalGiving...');
    
    const opportunities = await fetchFreshOpportunities(user);
    
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
    // 4. MATCHING INTELIGENTE
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
      matches = await performIntelligentMatching(user, opportunities, hasWatsonX);
      console.log(`🎯 Matching concluído: ${matches.length} oportunidades analisadas`);
      console.log(`   - Alta compatibilidade: ${matches.filter(m => m.priority === 'high').length}`);
      console.log(`   - Média compatibilidade: ${matches.filter(m => m.priority === 'medium').length}`);
      console.log(`   - Baixa compatibilidade: ${matches.filter(m => m.priority === 'low').length}`);
    } catch (aiError) {
      console.error('❌ Erro no matching inteligente:', aiError);
      console.log('🔄 Executando fallback matching...');
      matches = performFallbackMatching(user, opportunities);
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
      matches: matches.slice(0, 10), // Retorna os 10 melhores matches
      total: matches.length,
      totalAnalyzed: opportunities.length, // Quantos foram analisados
      usingAI: hasWatsonX,
      userSkills: user.skills || [],
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

async function fetchFreshOpportunities(user: any): Promise<any[]> {
  console.log('   📡 Chamando API GlobalGiving...');
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('   ❌ GLOBAL_GIVING_API_KEY não configurada');
    return [];
  }

  try {
    let allProjects: any[] = [];
    let nextProjectId: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 5; // Buscar até 5 páginas
    const PROJECTS_PER_PAGE = 50; // ~50 por página
    
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
      
      // Verificar se há mais páginas
      const hasNext = data.projects?.hasNext === 'true' || data.projects?.hasNext === true;
      nextProjectId = data.projects?.nextProjectId || null;
      
      pageCount++;
      console.log(`   📄 Página ${pageCount}: +${projects.length} projetos (total: ${allProjects.length})`);
      
      if (!hasNext || !nextProjectId) {
        console.log(`   📄 Fim da paginação na página ${pageCount}`);
        break;
      }
      
      // Pequena pausa entre páginas
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`   ✅ TOTAL: ${allProjects.length} projetos recebidos da GlobalGiving`);
    
    // Analisar TODOS os projetos coletados (até 250)
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
    
    // Filtrar projetos sem skills para otimizar análise
    const projectsWithSkills = enrichedProjects.filter(p => p.skills.length > 0);
    console.log(`   🎯 ${projectsWithSkills.length} projetos com skills identificadas (${enrichedProjects.length - projectsWithSkills.length} sem skills)`);
    
    return projectsWithSkills;
    
  } catch (error) {
    console.error('   ❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

function extractRelevantSkills(project: any, userSkills: string[]): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  // Mapeamento de palavras-chave para habilidades
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
  
  // Adicionar skills baseadas nas skills do usuário para melhor match
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

async function performIntelligentMatching(
  user: any, 
  opportunities: any[], 
  hasWatsonX: boolean
): Promise<MatchResult[]> {
  console.log('\n🤖 INICIANDO ANÁLISE INTELIGENTE...');
  console.log(`🎯 Skills do usuário para análise: ${user.skills?.join(', ') || 'NENHUMA'}`);
  console.log(`📊 Total de oportunidades a serem analisadas: ${opportunities.length}`);
  
  const results: MatchResult[] = [];
  const batchSize = hasWatsonX ? 3 : 5; // Menor batch para WatsonX para melhor qualidade
  
  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(opportunities.length / batchSize);
    
    console.log(`\n📦 Processando lote ${batchNum}/${totalBatches} (${batch.length} oportunidades)`);
    
    const batchPromises = batch.map(async (opportunity: any, idx: number) => {
      console.log(`   🔍 [${idx + 1}] Analisando: "${opportunity.title.substring(0, 50)}..."`);
      return await analyzeMatchWithAI(user, opportunity, hasWatsonX);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    console.log(`   ✅ Lote ${batchNum} concluído. Scores: ${batchResults.map(r => r.matchScore).join(', ')}%`);
    
    if (i + batchSize < opportunities.length) {
      console.log(`   ⏳ Aguardando 500ms antes do próximo lote...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

async function analyzeMatchWithAI(
  user: any, 
  opportunity: any, 
  hasWatsonX: boolean
): Promise<MatchResult> {
  if (hasWatsonX) {
    console.log(`      🧠 Chamando WatsonX para análise profunda...`);
    try {
      const aiResult = await callWatsonXForMatch(user, opportunity);
      console.log(`      ✅ WatsonX retornou score: ${aiResult.matchScore}%`);
      console.log(`      📝 Reason: ${aiResult.reasoning?.substring(0, 60)}...`);
      return aiResult;
    } catch (error) {
      console.error(`      ❌ WatsonX falhou:`, error);
      console.log(`      🔄 Usando fallback para esta oportunidade`);
      const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
      return createFallbackResult(opportunity, user, basicScore);
    }
  } else {
    const basicScore = calculateBasicScore(user.skills || [], opportunity.skills);
    console.log(`      📊 Fallback score: ${basicScore}% (sem IA)`);
    return createFallbackResult(opportunity, user, basicScore);
  }
}

async function callWatsonXForMatch(user: any, opportunity: any): Promise<MatchResult> {
  const startTime = Date.now();
  
  // Obter token IAM
  const iamResponse = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.IBM_API_KEY}`,
  });
  
  if (!iamResponse.ok) {
    throw new Error(`IAM token failed: ${iamResponse.status}`);
  }
  
  const iamData = await iamResponse.json();
  const accessToken = iamData.access_token;
  
  // Prompt detalhado para o WatsonX
  const prompt = `You are an expert volunteer-job matching AI. Analyze this match with extreme precision.

=== VOLUNTEER SKILLS (CRITICAL) ===
${user.skills?.map((s: string, i: number) => `${i+1}. ${s}`).join('\n') || 'No skills listed'}

=== OPPORTUNITY DETAILS ===
Title: ${opportunity.title}
Organization: ${opportunity.organization}
Required Skills: ${opportunity.skills?.join(', ') || 'Not specified'}
Description: ${opportunity.description?.substring(0, 500) || 'No description'}

=== YOUR TASK ===
1. Compare EACH volunteer skill with the opportunity requirements
2. Calculate a precise match score (0-100) based on REAL skill overlap
3. Identify EXACTLY which skills from the volunteer match
4. Provide a personalized recommendation in Portuguese

=== OUTPUT (JSON ONLY, no other text) ===
{
  "score": number,
  "reasoning": "Em português: análise detalhada do match",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "recommendation": "Em português: recomendação personalizada"
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
        max_new_tokens: 350,
        temperature: 0.2,
        min_new_tokens: 80,
      },
    }),
  });

  if (!watsonResponse.ok) {
    throw new Error(`WatsonX API error: ${watsonResponse.status}`);
  }

  const data = await watsonResponse.json();
  const aiText = data.results[0].generated_text;
  
  // Parse da resposta da IA
  const cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('No JSON found in WatsonX response');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validar matchedSkills contra as skills reais do usuário
  const userSkillsLower = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
    userSkillsLower.some((us: string) => us.includes(skill.toLowerCase()) || skill.toLowerCase().includes(us))
  );
  
  let score = Math.min(100, Math.max(0, parsed.score || 50));
  
  // Ajuste de score baseado em matched skills válidas
  if (validMatchedSkills.length > 0 && user.skills?.length > 0) {
    const skillMatchRatio = validMatchedSkills.length / Math.max(opportunity.skills?.length || 1, 1);
    const adjustedScore = Math.min(100, Math.max(0, score * (0.7 + skillMatchRatio * 0.3)));
    score = Math.floor(adjustedScore);
  }
  
  const priority: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  
  const elapsed = Date.now() - startTime;
  console.log(`         ⏱️  WatsonX análise em ${elapsed}ms`);
  
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
  console.log('📋 Executando fallback matching (sem IA)...');
  
  return opportunities.slice(0, 15).map((opp: any) => {
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