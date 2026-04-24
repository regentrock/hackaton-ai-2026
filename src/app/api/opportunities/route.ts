import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

interface GlobalGivingProject {
  id: string;
  title: string;
  summary: string;
  activities: string;
  themeName: string;
  organization: {
    id: string;
    name: string;
    mission: string;
  };
  country: string;
  iso3166CountryCode: string;
  contactCity: string;
  contactCountry: string;
  status: string;
  funding: number;
  goal: number;
  remaining: number;
  projectLink: string;
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== OPPORTUNITIES API - GLOBALGIVING ONLY ===');
    
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
    console.log('User Skills:', user.skills);
    console.log('User Location:', user.location);

    // =========================
    // 3. Buscar projetos REAIS do GlobalGiving
    // =========================
    // Usando endpoint correto: /countries/BR/projects/active [citation:1][citation:6]
    const projects = await fetchGlobalGivingProjects();
    
    if (!projects || projects.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No projects found from GlobalGiving API',
        opportunities: [],
        total: 0
      });
    }

    console.log(`✅ Retrieved ${projects.length} real projects from GlobalGiving`);

    // =========================
    // 4. Filtrar por localização (se possível)
    // =========================
    let filteredProjects = projects;
    
    if (user.location && user.location !== 'Não informada') {
      const userCity = user.location.split(',')[0].trim().toLowerCase();
      filteredProjects = projects.filter(project => 
        project.contactCity?.toLowerCase().includes(userCity) ||
        project.contactCountry?.toLowerCase() === 'brazil'
      );
      
      // Se não encontrar projetos na cidade, mostrar todos do Brasil
      if (filteredProjects.length === 0) {
        filteredProjects = projects;
      }
    }

    // =========================
    // 5. Formatar oportunidades (APENAS dados reais)
    // =========================
    const opportunities = filteredProjects.map(project => ({
      id: project.id,
      title: project.title,
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.contactCity || 'Brazil'}, ${project.contactCountry || 'BR'}`,
      description: project.summary || project.activities || project.organization?.mission,
      skills: extractSkillsFromProject(project),
      contactEmail: null,
      theme: project.themeName,
      funding: {
        raised: project.funding,
        goal: project.goal,
        remaining: project.remaining
      },
      projectLink: project.projectLink,
      status: project.status,
      source: 'GlobalGiving'
    }));

    // =========================
    // 6. Calcular match score baseado nas skills do usuário
    // =========================
    const opportunitiesWithScore = opportunities.map(opp => {
      const matchScore = calculateMatchScoreWithUserSkills(user, opp);
      const matchedSkills = user.skills?.filter(skill => 
        opp.skills.some(oppSkill => 
          oppSkill.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(oppSkill.toLowerCase())
        )
      ) || [];
      
      return {
        ...opp,
        matchScore,
        matchedSkills: matchedSkills.slice(0, 3),
        matchReason: generateMatchReason(matchScore, matchedSkills, opp.title)
      };
    });

    // Ordenar por match score
    opportunitiesWithScore.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      success: true,
      opportunities: opportunitiesWithScore,
      total: opportunitiesWithScore.length,
      source: 'GlobalGiving API',
      userSkills: user.skills || []
    });

  } catch (error: any) {
    console.error('Opportunities API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch from GlobalGiving API' },
      { status: 500 }
    );
  }
}

/**
 * Busca projetos reais do GlobalGiving
 * Usa o endpoint /countries/BR/projects/active conforme documentação [citation:1][citation:6]
 */
async function fetchGlobalGivingProjects(): Promise<GlobalGivingProject[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    throw new Error('GLOBAL_GIVING_API_KEY not configured');
  }

  let allProjects: GlobalGivingProject[] = [];
  let hasNext = true;
  let nextProjectId: string | null = null;
  
  // Máximo de 30 projetos (3 páginas de 10 resultados cada)
  let pageCount = 0;
  const MAX_PAGES = 3;

  while (hasNext && pageCount < MAX_PAGES) {
    // Construir URL conforme documentação [citation:1]
    let url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    if (nextProjectId) {
      url += `&nextProjectId=${nextProjectId}`;
    }
    
    console.log(`Fetching GlobalGiving projects (page ${pageCount + 1})...`);
    
    const response = await fetch(url, {
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      next: { revalidate: 3600 } // Cache por 1 hora
    });

    if (!response.ok) {
      throw new Error(`GlobalGiving API error: ${response.status}`);
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    allProjects = [...allProjects, ...projects];
    
    // Verificar se há mais resultados [citation:1]
    hasNext = data.projects?.hasNext === 'true' || data.projects?.hasNext === true;
    nextProjectId = data.projects?.nextProjectId || null;
    pageCount++;
  }

  console.log(`Total projects fetched: ${allProjects.length}`);
  return allProjects;
}

/**
 * Extrai habilidades do projeto baseado no tema e atividades
 */
function extractSkillsFromProject(project: GlobalGivingProject): string[] {
  const skills: string[] = [];
  const text = `${project.themeName || ''} ${project.title || ''} ${project.organization?.mission || ''}`.toLowerCase();
  
  const skillMapping: { [key: string]: string[] } = {
    'educação': ['Ensino', 'Educação', 'Crianças', 'Pedagogia'],
    'tecnologia': ['Tecnologia', 'Programação', 'TI', 'Desenvolvimento'],
    'saúde': ['Saúde', 'Medicina', 'Enfermagem', 'Bem-estar'],
    'ambiente': ['Meio Ambiente', 'Sustentabilidade', 'Ecologia'],
    'social': ['Assistência Social', 'Comunidade', 'Ação Social'],
    'cultura': ['Arte', 'Cultura', 'Música', 'Design'],
    'esporte': ['Esporte', 'Atividade Física', 'Recreação'],
    'comunidade': ['Comunidade', 'Liderança', 'Organização']
  };
  
  for (const [key, value] of Object.entries(skillMapping)) {
    if (text.includes(key)) {
      skills.push(...value);
    }
  }
  
  return [...new Set(skills)].slice(0, 5);
}

/**
 * Calcula match score baseado nas habilidades do usuário
 */
function calculateMatchScoreWithUserSkills(user: any, opportunity: any): number {
  if (!user.skills || user.skills.length === 0) {
    return 50; // Score neutro
  }
  
  if (!opportunity.skills || opportunity.skills.length === 0) {
    return 40;
  }
  
  const userSkillsLower = user.skills.map((s: string) => s.toLowerCase());
  let matchCount = 0;
  
  for (const userSkill of userSkillsLower) {
    for (const oppSkill of opportunity.skills) {
      if (userSkill.includes(oppSkill.toLowerCase()) || oppSkill.toLowerCase().includes(userSkill)) {
        matchCount++;
        break;
      }
    }
  }
  
  const score = (matchCount / opportunity.skills.length) * 100;
  return Math.min(100, Math.max(20, Math.floor(score)));
}

function generateMatchReason(score: number, matchedSkills: string[], title: string): string {
  if (score >= 80 && matchedSkills.length > 0) {
    return `🎯 Excelente match! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são muito relevantes para este projeto.`;
  } else if (score >= 60) {
    return `👍 Bom match! Este projeto alinha com seu perfil.`;
  } else if (score >= 40) {
    return `💡 Oportunidade interessante para desenvolver novas habilidades.`;
  } else {
    return `📚 Uma chance de explorar novas áreas e fazer a diferença.`;
  }
}