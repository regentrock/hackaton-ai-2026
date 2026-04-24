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
    console.log('User Skills:', user.skills);
    console.log('User Location:', user.location);

    // =========================
    // 3. Buscar projetos REAIS do GlobalGiving
    // =========================
    let projects = [];
    
    try {
      projects = await fetchGlobalGivingProjects(user);
      console.log(`✅ Found ${projects.length} real projects from GlobalGiving`);
    } catch (error) {
      console.error('❌ Error fetching from GlobalGiving:', error);
      return NextResponse.json(
        { error: 'Failed to fetch opportunities from GlobalGiving' },
        { status: 500 }
      );
    }

    if (projects.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        message: 'Nenhum projeto encontrado no GlobalGiving para sua região',
        total: 0
      });
    }

    // =========================
    // 4. Calcular match score para cada projeto
    // =========================
    const opportunities = projects.map((project: any) => {
      const matchScore = calculateMatchScore(user, project);
      const matchedSkills = findMatchingSkills(user.skills || [], project.skills || []);
      
      return {
        id: project.id,
        title: project.title,
        organization: project.organization,
        location: project.location,
        description: project.description,
        skills: project.skills,
        contactEmail: project.contactEmail,
        themeName: project.themeName,
        matchScore: matchScore,
        matchedSkills: matchedSkills,
        matchReason: generateMatchReason(matchScore, matchedSkills, project.title)
      };
    });

    // Ordenar por match score
    opportunities.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      success: true,
      opportunities: opportunities.slice(0, 15),
      total: opportunities.length,
      source: 'GlobalGiving API',
      userSkills: user.skills || []
    });

  } catch (error: any) {
    console.error('Opportunities API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Busca projetos REAIS do GlobalGiving
 */
async function fetchGlobalGivingProjects(user: any): Promise<any[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    throw new Error('GLOBAL_GIVING_API_KEY not configured');
  }

  // Extrair país e cidade do usuário
  let country = 'BR'; // Brasil
  let city = '';
  
  if (user.location && user.location !== 'Não informada') {
    city = user.location.split(',')[0].trim();
  }

  // URL da API do GlobalGiving para projetos no Brasil
  // Documentação: https://www.globalgiving.org/api/
  const url = `https://api.globalgiving.org/api/public/projectservice/countries/${country}/projects?api_key=${apiKey}&api_version=2`;
  
  console.log('Fetching from GlobalGiving API...');
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    next: { revalidate: 3600 } // Cache por 1 hora
  });

  if (!response.ok) {
    throw new Error(`GlobalGiving API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  // Extrair projetos da resposta
  let projects = data.projects?.project || [];
  
  console.log(`Total projects from GlobalGiving: ${projects.length}`);
  
  // Filtrar por cidade se especificada
  if (city) {
    const cityLower = city.toLowerCase();
    projects = projects.filter((p: any) => {
      const projectCity = p.location?.city?.toLowerCase() || '';
      const projectCountry = p.location?.country?.toLowerCase() || '';
      return projectCity.includes(cityLower) || projectCountry === 'brazil';
    });
    console.log(`Filtered to ${projects.length} projects near ${city}`);
  }
  
  // Mapear para o formato que usamos
  return projects.slice(0, 30).map((project: any) => ({
    id: project.id,
    title: project.title || 'Projeto de Voluntariado',
    organization: project.organization?.name || 'Organização Parceira',
    location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
    description: project.summary || project.description || 'Ajude este projeto através de voluntariado',
    skills: extractSkillsFromProject(project),
    contactEmail: project.contactEmail || 'voluntarios@globalgiving.org',
    themeName: project.themeName || 'Desenvolvimento Social',
    url: project.url
  }));
}

/**
 * Extrai habilidades relevantes do projeto
 */
function extractSkillsFromProject(project: any): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  // Mapeamento de palavras-chave para habilidades
  const keywordMap: { [key: string]: string[] } = {
    'educação': ['Ensino', 'Educação', 'Crianças', 'Escola'],
    'tecnologia': ['Tecnologia', 'Programação', 'Desenvolvimento Web', 'TI'],
    'saúde': ['Saúde', 'Medicina', 'Enfermagem', 'Bem-estar'],
    'ambiente': ['Meio Ambiente', 'Sustentabilidade', 'Ecologia'],
    'social': ['Assistência Social', 'Comunidade', 'Ação Social'],
    'cultura': ['Arte', 'Cultura', 'Música', 'Design'],
    'esporte': ['Esporte', 'Atividade Física', 'Recreação'],
    'alimentação': ['Alimentação', 'Nutrição', 'Culinária'],
    'água': ['Água', 'Saneamento', 'Higiene'],
    'empoderamento': ['Empoderamento', 'Liderança', 'Mentoria']
  };
  
  for (const [key, value] of Object.entries(keywordMap)) {
    if (text.includes(key)) {
      skills.push(...value);
    }
  }
  
  // Habilidades específicas baseadas no título
  if (text.includes('ensin') || text.includes('educa')) {
    skills.push('Ensino', 'Comunicação');
  }
  if (text.includes('tech') || text.includes('program')) {
    skills.push('Programação', 'Tecnologia');
  }
  if (text.includes('saude') || text.includes('medic')) {
    skills.push('Saúde', 'Atendimento');
  }
  
  // Remover duplicatas e limitar
  const uniqueSkills = [...new Set(skills)];
  return uniqueSkills.slice(0, 5);
}

/**
 * Calcula match score baseado nas habilidades do usuário e do projeto
 */
function calculateMatchScore(user: any, project: any): number {
  const userSkills = user.skills?.map((s: string) => s.toLowerCase()) || [];
  const projectSkills = project.skills?.map((s: string) => s.toLowerCase()) || [];
  
  if (userSkills.length === 0) {
    // Base score se não tem habilidades cadastradas
    return 50;
  }
  
  if (projectSkills.length === 0) {
    return 45;
  }
  
  // Calcular matching
  let matchCount = 0;
  for (const userSkill of userSkills) {
    for (const projectSkill of projectSkills) {
      if (userSkill.includes(projectSkill) || projectSkill.includes(userSkill)) {
        matchCount++;
        break;
      }
    }
  }
  
  // Score percentual baseado em quantas habilidades do projeto o usuário tem
  const skillScore = (matchCount / projectSkills.length) * 70;
  
  // Bonus por localização
  let locationBonus = 0;
  const userLocation = user.location?.toLowerCase() || '';
  const projectLocation = project.location?.toLowerCase() || '';
  
  if (userLocation && projectLocation) {
    if (userLocation.includes('remoto') || projectLocation.includes('remoto')) {
      locationBonus = 30;
    } else if (userLocation.split(',')[0] === projectLocation.split(',')[0]) {
      locationBonus = 30; // Mesma cidade
    } else if (userLocation.split(',')[1] === projectLocation.split(',')[1]) {
      locationBonus = 15; // Mesmo estado
    }
  }
  
  let totalScore = skillScore + locationBonus;
  
  // Garantir entre 0 e 100
  return Math.min(100, Math.max(0, Math.floor(totalScore)));
}

function findMatchingSkills(userSkills: string[], projectSkills: string[]): string[] {
  const matches: string[] = [];
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  
  for (const projectSkill of projectSkills) {
    if (userSkillsLower.some(us => us.includes(projectSkill.toLowerCase()) || projectSkill.toLowerCase().includes(us))) {
      matches.push(projectSkill);
    }
  }
  
  return matches.slice(0, 3);
}

function generateMatchReason(score: number, matchedSkills: string[], title: string): string {
  if (score >= 80) {
    return `🎯 Excelente match! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são ideais para este projeto.`;
  } else if (score >= 60) {
    if (matchedSkills.length > 0) {
      return `👍 Bom match! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes para "${title}".`;
    }
    return `👍 Este projeto alinha com seu perfil. Considere se candidatar!`;
  } else if (score >= 40) {
    return `💡 Oportunidade interessante. Você pode desenvolver novas habilidades enquanto ajuda.`;
  } else {
    return `📚 Uma chance de explorar novas áreas de atuação e fazer a diferença.`;
  }
}