import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(request: NextRequest) {
  try {
    console.log('=== OPPORTUNITIES API ===');
    
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
    console.log('Skills:', user.skills);
    console.log('Location:', user.location);

    // =========================
    // 3. Buscar oportunidades (API GlobalGiving)
    // =========================
    let opportunities = [];
    
    try {
      opportunities = await fetchOpportunitiesFromGlobalGiving(user);
      console.log(`Found ${opportunities.length} opportunities`);
    } catch (apiError) {
      console.error('Error fetching from GlobalGiving:', apiError);
      // Fallback para dados locais
      opportunities = getLocalOpportunities(user);
    }

    // =========================
    // 4. Retornar oportunidades
    // =========================
    return NextResponse.json({
      success: true,
      opportunities: opportunities.slice(0, 10),
      total: opportunities.length
    });

  } catch (error: any) {
    console.error('Opportunities API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchOpportunitiesFromGlobalGiving(user: any): Promise<any[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('GLOBAL_GIVING_API_KEY not configured');
    return getLocalOpportunities(user);
  }

  try {
    // Buscar ONGs no Brasil
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects?api_key=${apiKey}`;
    console.log('Fetching from GlobalGiving...');
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 } // Cache por 1 hora
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    // Filtrar por localização se disponível
    let filtered = projects;
    if (user.location && user.location !== 'Não informada') {
      const userCity = user.location.split(',')[0].toLowerCase();
      filtered = projects.filter((p: any) => 
        p.location?.city?.toLowerCase().includes(userCity) ||
        p.location?.country?.toLowerCase().includes('brazil')
      );
    }
    
    // Mapear para o formato esperado
    return filtered.slice(0, 20).map((project: any) => ({
      id: project.id,
      title: project.title,
      organization: project.organization?.name || 'ONG Parceira',
      location: `${project.location?.city || ''}, ${project.location?.country || 'Brasil'}`,
      description: project.summary || project.description,
      skills: extractSkillsFromProject(project),
      contactEmail: project.contactEmail || 'voluntario@ong.org',
      matchScore: calculateMatchScore(user, project)
    }));
    
  } catch (error) {
    console.error('GlobalGiving API error:', error);
    return getLocalOpportunities(user);
  }
}

// Dados locais de fallback
function getLocalOpportunities(user: any): any[] {
  const baseOpportunities = [
    {
      id: '1',
      title: 'Professor de Inglês para Crianças',
      organization: 'ONG Educação Para Todos',
      location: user.location || 'São Paulo, SP',
      description: 'Ensinar inglês básico para crianças carentes em situação de vulnerabilidade social.',
      skills: ['Inglês', 'Ensino', 'Comunicação'],
      contactEmail: 'voluntarios@educacaoparatodos.org'
    },
    {
      id: '2',
      title: 'Desenvolvedor Web Voluntário',
      organization: 'Tech para o Bem',
      location: 'Remoto',
      description: 'Desenvolver e manter o site institucional da ONG, incluindo página de doações.',
      skills: ['React', 'JavaScript', 'HTML/CSS'],
      contactEmail: 'tech@paraoBem.org'
    },
    {
      id: '3',
      title: 'Assistente de Idosos',
      organization: 'Casa de Acolhida Vida Nova',
      location: user.location || 'Rio de Janeiro, RJ',
      description: 'Acompanhar e auxiliar idosos em atividades diárias e recreativas.',
      skills: ['Empatia', 'Comunicação', 'Organização'],
      contactEmail: 'contato@casaacolhida.org'
    }
  ];
  
  // Calcular match score baseado nas habilidades do usuário
  return baseOpportunities.map(opp => ({
    ...opp,
    matchScore: calculateMatchScoreFromSkills(user.skills || [], opp.skills)
  })).sort((a, b) => b.matchScore - a.matchScore);
}

function calculateMatchScoreFromSkills(userSkills: string[], oppSkills: string[]): number {
  if (!userSkills.length || !oppSkills.length) return 50;
  
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  const oppSkillsLower = oppSkills.map(s => s.toLowerCase());
  
  const matches = userSkillsLower.filter(skill => 
    oppSkillsLower.some(oppSkill => oppSkill.includes(skill) || skill.includes(oppSkill))
  );
  
  const score = (matches.length / Math.max(oppSkillsLower.length, 1)) * 100;
  return Math.min(100, Math.max(30, score));
}

function extractSkillsFromProject(project: any): string[] {
  const skills: string[] = [];
  const text = `${project.title} ${project.summary} ${project.description}`.toLowerCase();
  
  const keywords = [
    'ensino', 'educação', 'professor', 'crianças',
    'tecnologia', 'programação', 'desenvolvimento',
    'saúde', 'medicina', 'enfermagem',
    'social', 'assistência', 'comunidade'
  ];
  
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      skills.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  });
  
  return skills.length ? skills : ['Voluntariado'];
}

function calculateMatchScore(user: any, project: any): number {
  let score = 50;
  
  if (user.skills && user.skills.length) {
    const projectSkills = extractSkillsFromProject(project);
    const matchScore = calculateMatchScoreFromSkills(user.skills, projectSkills);
    score = (score + matchScore) / 2;
  }
  
  return Math.min(100, Math.max(30, Math.floor(score)));
}