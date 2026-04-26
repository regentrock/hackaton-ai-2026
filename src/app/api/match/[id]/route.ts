import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🔍 FETCHING SINGLE MATCH:', params.id);
    
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

    // 2. Buscar todos os matches da API principal
    const apiKey = process.env.GLOBAL_GIVING_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Buscar projetos da GlobalGiving
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    // Encontrar o projeto específico pelo ID
    const project = projects.find((p: any) => p.id === params.id);
    
    if (!project) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    // Buscar perfil do usuário para calcular match
    const { prisma } = await import('@/src/lib/prisma');
    
    const user = await prisma.volunteer.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        skills: true,
        location: true,
        description: true,
        availability: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Extrair skills do projeto
    const projectSkills = extractSkillsFromProject(project);
    
    // Calcular match score
    const matchScore = calculateMatchScore(user.skills || [], projectSkills);
    const matchedSkills = findMatchingSkills(user.skills || [], projectSkills);
    const missingSkills = findMissingSkills(user.skills || [], projectSkills);
    
    // Gerar reasoning e recommendation
    const reasoning = generateReasoning(matchScore, matchedSkills, project.title);
    const recommendation = generateRecommendation(matchScore, matchedSkills);
    
    const priority: 'high' | 'medium' | 'low' = matchScore >= 70 ? 'high' : matchScore >= 40 ? 'medium' : 'low';

    const opportunity = {
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || '',
      skills: projectSkills,
      matchScore: matchScore,
      matchedSkills: matchedSkills,
      missingSkills: missingSkills,
      reasoning: reasoning,
      recommendation: recommendation,
      priority: priority,
      theme: project.themeName || 'Impacto Social',
      projectLink: project.projectLink
    };

    return NextResponse.json({
      success: true,
      opportunity: opportunity
    });

  } catch (error: any) {
    console.error('Error fetching match detail:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractSkillsFromProject(project: any): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  const skillMap = [
    { keywords: ['ensin', 'educa', 'profess', 'escola', 'criança', 'alfabetizacao', 'pedagogia'], skill: 'Educação' },
    { keywords: ['ingles', 'english', 'idioma', 'lingua'], skill: 'Inglês' },
    { keywords: ['programa', 'codigo', 'software', 'web', 'desenvolvimento', 'tecnologia'], skill: 'Programação' },
    { keywords: ['saude', 'medicina', 'enfermagem', 'cuidado', 'bem-estar'], skill: 'Saúde' },
    { keywords: ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem'], skill: 'Meio Ambiente' },
    { keywords: ['social', 'comunidade', 'assistencia', 'voluntariado', 'familia'], skill: 'Ação Social' }
  ];
  
  for (const item of skillMap) {
    if (item.keywords.some((kw: string) => text.includes(kw))) {
      skills.push(item.skill);
    }
  }
  
  if (skills.length === 0) {
    skills.push('Voluntariado Geral');
  }
  
  return [...new Set(skills)].slice(0, 5);
}

function calculateMatchScore(userSkills: string[], projectSkills: string[]): number {
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

function findMatchingSkills(userSkills: string[], projectSkills: string[]): string[] {
  const matches: string[] = [];
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  
  for (const projSkill of projectSkills) {
    if (userSkillsLower.some(us => us.includes(projSkill.toLowerCase()) || projSkill.toLowerCase().includes(us))) {
      matches.push(projSkill);
    }
  }
  
  return matches.slice(0, 4);
}

function findMissingSkills(userSkills: string[], projectSkills: string[]): string[] {
  const missing: string[] = [];
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  
  for (const projSkill of projectSkills) {
    if (!userSkillsLower.some(us => us.includes(projSkill.toLowerCase()) || projSkill.toLowerCase().includes(us))) {
      missing.push(projSkill);
    }
  }
  
  return missing.slice(0, 3);
}

function generateReasoning(score: number, matchedSkills: string[], title: string): string {
  if (score >= 70 && matchedSkills.length > 0) {
    return `Excelente compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são diretamente relevantes para o projeto "${title}". Você tem um perfortil muito alinhado com as necessidades desta organização.`;
  } else if (score >= 50) {
    if (matchedSkills.length > 0) {
      return `Boa compatibilidade! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes para este projeto. Considere se candidatar para aplicar seus conhecimentos.`;
    }
    return `Compatibilidade moderada. Este projeto pode se beneficiar da sua experiência, embora não haja um alinhamento direto de habilidades.`;
  } else {
    return `Compatibilidade em desenvolvimento. Este projeto pode ser uma oportunidade para você desenvolver novas habilidades e expandir sua experiência em voluntariado.`;
  }
}

function generateRecommendation(score: number, matchedSkills: string[]): string {
  if (score >= 70 && matchedSkills.length > 0) {
    return `🎯 RECOMENDAÇÃO FORTE: Candidate-se imediatamente! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são exatamente o que este projeto procura.`;
  } else if (score >= 50) {
    if (matchedSkills.length > 0) {
      return `👍 RECOMENDAÇÃO: Considere se candidatar. Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são valiosas para esta oportunidade.`;
    }
    return `💡 RECOMENDAÇÃO: Vale a pena explorar esta oportunidade. Você pode contribuir de forma significativa mesmo sem habilidades exatamente alinhadas.`;
  } else {
    return `📚 RECOMENDAÇÃO: Esta é uma ótima oportunidade para aprendizado e desenvolvimento de novas habilidades. Considere se candidatar para expandir sua experiência.`;
  }
}