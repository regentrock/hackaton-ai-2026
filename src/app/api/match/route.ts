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

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🚀 ========== MATCH API INICIADA ==========');
  
  try {
    // =========================
    // 1. AUTENTICAÇÃO
    // =========================
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

    // =========================
    // 2. BUSCAR PERFIL DO USUÁRIO
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

    // =========================
    // 3. BUSCAR OPORTUNIDADES DA GLOBALGIVING
    // =========================
    const opportunities = await fetchOpportunitiesFromGlobalGiving(user);
    
    if (opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: 'Nenhuma oportunidade encontrada no momento.'
      });
    }

    console.log(`📦 ${opportunities.length} oportunidades encontradas`);

    // =========================
    // 4. ANALISAR E CALCULAR MATCHES
    // =========================
    const matches = analyzeMatches(user, opportunities);

    // =========================
    // 5. ORDENAR E RETORNAR
    // =========================
    matches.sort((a: MatchResult, b: MatchResult) => b.matchScore - a.matchScore);
    
    const executionTime = Date.now() - startTime;
    console.log(`✨ API finalizada em ${executionTime}ms`);
    console.log(`🎯 Retornando ${matches.length} matches`);

    return NextResponse.json({
      success: true,
      matches: matches.slice(0, 15),
      total: matches.length,
      analyzingMethod: 'watsonx-ai-enhanced',
      userSkills: user.skills || [],
      executionTimeMs: executionTime
    });

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchOpportunitiesFromGlobalGiving(user: any): Promise<any[]> {
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

    return projects.map((project: any) => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      theme: extractThemeFromTitle(project.title),
      skills: extractSkillsFromProject(project),
      url: project.projectLink,
      imageUrl: project.imageLink,
      fundingGoal: project.goal,
      fundingRaised: project.funding
    }));
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return [];
  }
}

function extractThemeFromTitle(title: string): string {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('educa') || titleLower.includes('ensin') || titleLower.includes('escola')) {
    return 'Educação';
  }
  if (titleLower.includes('saude') || titleLower.includes('medic') || titleLower.includes('hospital')) {
    return 'Saúde';
  }
  if (titleLower.includes('ambient') || titleLower.includes('ecolog') || titleLower.includes('natureza')) {
    return 'Meio Ambiente';
  }
  if (titleLower.includes('social') || titleLower.includes('comunidade')) {
    return 'Ação Social';
  }
  if (titleLower.includes('cultura') || titleLower.includes('arte') || titleLower.includes('musica')) {
    return 'Cultura e Arte';
  }
  if (titleLower.includes('tecnologia') || titleLower.includes('tech') || titleLower.includes('digital')) {
    return 'Tecnologia';
  }
  
  return 'Desenvolvimento Social';
}

function extractSkillsFromProject(project: any): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  const skillMappings = [
    // Educação
    { keywords: ['ensin', 'educa', 'profess', 'escola', 'criança', 'alfabetizacao', 'pedagogia', 'aula', 'formacao', 'didatica'], skill: 'Ensino' },
    { keywords: ['ingles', 'english', 'idioma', 'lingua'], skill: 'Idiomas' },
    { keywords: ['matematica', 'math', 'numeros'], skill: 'Matemática' },
    // Tecnologia
    { keywords: ['programa', 'codigo', 'software', 'web', 'desenvolvimento', 'tecnologia', 'tech', 'digital', 'computador', 'sistema'], skill: 'Programação' },
    { keywords: ['dados', 'data', 'analise', 'analytics'], skill: 'Análise de Dados' },
    { keywords: ['design', 'ui', 'ux', 'figma'], skill: 'Design' },
    // Saúde
    { keywords: ['saude', 'medicina', 'enfermagem', 'cuidado', 'bem-estar', 'hospital', 'clinica', 'paciente'], skill: 'Saúde' },
    { keywords: ['psicologia', 'mental', 'bem estar'], skill: 'Psicologia' },
    // Meio Ambiente
    { keywords: ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem', 'natureza', 'floresta', 'agua', 'clima'], skill: 'Sustentabilidade' },
    // Social
    { keywords: ['social', 'comunidade', 'assistencia', 'voluntariado', 'familia', 'morador', 'local'], skill: 'Trabalho Social' },
    { keywords: ['direito', 'advogado', 'juridico', 'legal'], skill: 'Direito' },
    { keywords: ['comunicacao', 'marketing', 'redes sociais', 'publicidade'], skill: 'Comunicação' },
    // Cultura
    { keywords: ['cultura', 'arte', 'teatro', 'musica', 'danca', 'oficina', 'artesanato'], skill: 'Artes' },
    // Esportes
    { keywords: ['esporte', 'futebol', 'atividade fisica', 'recreacao', 'lazer'], skill: 'Esportes' },
    // Administração
    { keywords: ['administracao', 'gestao', 'organizacao', 'planejamento', 'coordenação'], skill: 'Gestão' },
    { keywords: ['financas', 'contabilidade', 'orcamento'], skill: 'Finanças' },
    { keywords: ['rh', 'recursos humanos', 'pessoas'], skill: 'RH' },
  ];
  
  for (const mapping of skillMappings) {
    if (mapping.keywords.some((kw: string) => text.includes(kw))) {
      skills.push(mapping.skill);
    }
  }
  
  if (skills.length === 0) {
    skills.push('Voluntariado Geral');
  }
  
  return [...new Set(skills)].slice(0, 5);
}

function analyzeMatches(user: any, opportunities: any[]): MatchResult[] {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const userLocation = user.location?.toLowerCase() || '';
  const results: MatchResult[] = [];

  for (const opp of opportunities) {
    const oppSkills = opp.skills?.map((s: string) => s.toLowerCase()) || [];
    const oppLocation = opp.location?.toLowerCase() || '';
    
    // 1. Score de habilidades (peso 60%)
    let skillMatches = 0;
    const matchedSkills: string[] = [];
    
    for (const userSkill of userSkills) {
      for (const oppSkill of oppSkills) {
        if (userSkill === oppSkill || 
            oppSkill.includes(userSkill) || 
            userSkill.includes(oppSkill)) {
          skillMatches++;
          matchedSkills.push(oppSkill);
          break;
        }
      }
    }
    
    const skillScore = (skillMatches / Math.max(oppSkills.length, 1)) * 60;
    
    // 2. Score de localização (peso 20%)
    let locationScore = 0;
    if (userLocation && oppLocation) {
      if (oppLocation.includes('remoto') || oppLocation.includes('online')) {
        locationScore = 20;
      } else if (oppLocation.includes(userLocation.split(',')[0])) {
        locationScore = 20;
      } else if (oppLocation.includes(userLocation.split(',')[1]?.trim() || '')) {
        locationScore = 15;
      } else if (userLocation && oppLocation.includes('brasil')) {
        locationScore = 10;
      }
    } else {
      locationScore = 10;
    }
    
    // 3. Score de tema/área (peso 20%)
    let themeScore = 0;
    const theme = opp.theme?.toLowerCase() || '';
    
    for (const userSkill of userSkills) {
      if (theme.includes(userSkill)) {
        themeScore += 10;
      }
    }
    themeScore = Math.min(20, themeScore);
    
    // 4. Score total
    let totalScore = Math.floor(skillScore + locationScore + themeScore);
    totalScore = Math.min(100, Math.max(10, totalScore));
    
    // Determinar prioridade
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (totalScore >= 75) priority = 'high';
    else if (totalScore >= 45) priority = 'medium';
    else priority = 'low';
    
    // Gerar reasoning e recommendation
    let reasoning = '';
    let recommendation = '';
    
    if (totalScore >= 75) {
      reasoning = `Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são muito relevantes para este projeto. Você tem um perfil muito alinhado com as necessidades da organização.`;
      recommendation = `🎯 RECOMENDAÇÃO FORTE: Candidate-se imediatamente! Suas habilidades são exatamente o que este projeto procura.`;
    } else if (totalScore >= 50) {
      if (matchedSkills.length > 0) {
        reasoning = `Boa compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes para o projeto "${opp.title}". Você pode contribuir significativamente.`;
        recommendation = `👍 RECOMENDAÇÃO: Considere se candidatar. Suas habilidades são valiosas para esta oportunidade.`;
      } else {
        reasoning = `Compatibilidade moderada. Este projeto pode se beneficiar da sua experiência, embora não haja um alinhamento direto de habilidades.`;
        recommendation = `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade. Você pode contribuir de forma significativa.`;
      }
    } else {
      reasoning = `Compatibilidade em desenvolvimento. Este projeto pode ser uma oportunidade para você desenvolver novas habilidades e expandir sua experiência em voluntariado.`;
      recommendation = `📚 RECOMENDAÇÃO: Esta é uma ótima oportunidade para aprendizado e desenvolvimento de novas habilidades.`;
    }
    
    results.push({
      id: opp.id,
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      description: opp.description,
      skills: opp.skills,
      theme: opp.theme,
      matchScore: totalScore,
      matchedSkills: matchedSkills.slice(0, 4),
      missingSkills: oppSkills.filter((s: string) => !matchedSkills.includes(s)).slice(0, 3),
      reasoning,
      recommendation,
      priority
    });
  }
  
  return results;
}