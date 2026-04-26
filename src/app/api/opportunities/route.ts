import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/auth/authUtils';

interface Project {
  id: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  skills: string[];
  theme: string;
  url: string | null;
  imageUrl: string | null;
  matchScore?: number;
  matchedSkills?: string[];
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== OPPORTUNITIES API - GLOBALGIVING ONLY ===');
    
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

    console.log('User skills:', user.skills);

    // Buscar projetos REAIS do GlobalGiving
    const projects = await fetchGlobalGivingProjects();
    
    if (projects.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No projects found from GlobalGiving API. Please check API key.',
        opportunities: [],
        total: 0
      });
    }

    console.log(`✅ Retrieved ${projects.length} real projects from GlobalGiving`);

    // Filtrar projetos baseado nas skills do usuário
    let filteredProjects: Project[] = projects;
    
    if (user.skills && user.skills.length > 0) {
      const userSkillsLower = user.skills.map((s: string) => s.toLowerCase());
      
      filteredProjects = projects.filter((project: Project) => {
        const projectSkillsLower = project.skills.map((s: string) => s.toLowerCase());
        const projectText = `${project.title} ${project.description}`.toLowerCase();
        
        // Verificar se alguma skill do usuário corresponde ao projeto
        return userSkillsLower.some((skill: string) => 
          projectSkillsLower.some((ps: string) => ps.includes(skill) || skill.includes(ps)) ||
          projectText.includes(skill)
        );
      });
      
      console.log(`After skill filter: ${filteredProjects.length} projects`);
      
      // Se não encontrou nenhum com skill match, mostrar todos (melhor que ficar vazio)
      if (filteredProjects.length === 0) {
        filteredProjects = projects.slice(0, 20);
        console.log('No skill matches found, showing first 20 projects');
      }
    }

    // Calcular score para cada projeto
    const opportunitiesWithScore = filteredProjects.map((project: Project) => ({
      ...project,
      matchScore: calculateMatchScore(user.skills || [], project.skills),
      matchedSkills: findMatchingSkills(user.skills || [], project.skills)
    }));

    // Ordenar por score
    opportunitiesWithScore.sort((a: any, b: any) => b.matchScore - a.matchScore);

    return NextResponse.json({
      success: true,
      opportunities: opportunitiesWithScore.slice(0, 30),
      total: opportunitiesWithScore.length,
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

async function fetchGlobalGivingProjects(): Promise<Project[]> {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    console.error('GLOBAL_GIVING_API_KEY not configured');
    return [];
  }

  try {
    // Buscar projetos ativos no Brasil
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
    console.log('Fetching from GlobalGiving API...');
    
    const response = await fetch(url, {
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`GlobalGiving API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const projects = data.projects?.project || [];
    
    console.log(`Total projects from GlobalGiving: ${projects.length}`);
    
    // Mapear e extrair skills baseado no tema e descrição
    return projects.map((project: any): Project => ({
      id: project.id,
      title: project.title || 'Projeto de Voluntariado',
      organization: project.organization?.name || 'GlobalGiving Partner',
      location: `${project.location?.city || 'Brasil'}, ${project.location?.country || 'BR'}`,
      description: project.summary || project.description || 'Projeto que busca voluntários para causas sociais',
      skills: extractSkillsFromProject(project),
      theme: project.themeName || 'Desenvolvimento Social',
      url: project.projectLink || null,
      imageUrl: project.imageLink || null
    }));
    
  } catch (error) {
    console.error('GlobalGiving fetch error:', error);
    return [];
  }
}

function extractSkillsFromProject(project: any): string[] {
  const skills: string[] = [];
  const text = `${project.title || ''} ${project.summary || ''} ${project.description || ''} ${project.themeName || ''}`.toLowerCase();
  
  // Mapeamento de palavras-chave para habilidades
  const skillKeywordMap = [
    { keywords: ['ensin', 'educa', 'profess', 'escola', 'criança', 'criancas', 'aluno', 'aula', 'pedagogia', 'alfabetizacao'], skill: 'Ensino' },
    { keywords: ['ingles', 'english', 'idioma', 'lingua', 'foreign language'], skill: 'Inglês' },
    { keywords: ['matematica', 'math', 'numeros', 'calculo'], skill: 'Matemática' },
    { keywords: ['portugues', 'portuguese', 'leitura', 'escrita'], skill: 'Português' },
    { keywords: ['tecnologi', 'tech', 'programa', 'software', 'desenvolvimento', 'codigo', 'web'], skill: 'Tecnologia' },
    { keywords: ['saude', 'health', 'medic', 'enferm', 'bem-estar', 'cuidado'], skill: 'Saúde' },
    { keywords: ['ambiente', 'ambiental', 'ecolog', 'sustent', 'natureza', 'reciclagem'], skill: 'Meio Ambiente' },
    { keywords: ['social', 'comunidade', 'assist', 'volunt', 'familia', 'morador'], skill: 'Ação Social' },
    { keywords: ['cultura', 'arte', 'music', 'teatro', 'dança', 'oficina'], skill: 'Cultura' },
    { keywords: ['esporte', 'fisic', 'recrea', 'atividade', 'jogo'], skill: 'Esportes' },
    { keywords: ['crianca', 'infantil', 'juventude', 'jovem', 'adolescente'], skill: 'Trabalho com Crianças' },
    { keywords: ['idoso', 'terceira idade', 'melhor idade', 'envelhecimento'], skill: 'Trabalho com Idosos' }
  ];
  
  for (const item of skillKeywordMap) {
    if (item.keywords.some((kw: string) => text.includes(kw))) {
      skills.push(item.skill);
    }
  }
  
  // Se não identificou nenhuma skill, adicionar genérica
  if (skills.length === 0) {
    skills.push('Voluntariado Geral');
  }
  
  return [...new Set(skills)];
}

function calculateMatchScore(userSkills: string[], projectSkills: string[]): number {
  if (!userSkills || userSkills.length === 0) return 30;
  if (!projectSkills || projectSkills.length === 0) return 40;
  
  const userSkillsLower = userSkills.map((s: string) => s.toLowerCase());
  const projectSkillsLower = projectSkills.map((s: string) => s.toLowerCase());
  
  let matchCount = 0;
  for (const userSkill of userSkillsLower) {
    for (const projSkill of projectSkillsLower) {
      if (projSkill.includes(userSkill) || userSkill.includes(projSkill)) {
        matchCount++;
        break;
      }
    }
  }
  
  // Score baseado em quantas skills do projeto combinam
  let score = (matchCount / projectSkillsLower.length) * 100;
  
  // Bônus se o usuário tem skills relevantes
  if (matchCount >= 2) score += 10;
  if (matchCount >= 3) score += 5;
  
  return Math.min(100, Math.max(10, Math.floor(score)));
}

function findMatchingSkills(userSkills: string[], projectSkills: string[]): string[] {
  if (!userSkills || !projectSkills) return [];
  
  const matches: string[] = [];
  const userSkillsLower = userSkills.map((s: string) => s.toLowerCase());
  
  for (const projSkill of projectSkills) {
    const projSkillLower = projSkill.toLowerCase();
    if (userSkillsLower.some((us: string) => us.includes(projSkillLower) || projSkillLower.includes(us))) {
      matches.push(projSkill);
    }
  }
  
  return matches.slice(0, 5);
}