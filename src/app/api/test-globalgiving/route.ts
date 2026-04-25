import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not found' }, { status: 500 });
  }

  const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    const data = await response.json();
    const projects = data.projects?.project || [];
    
    return NextResponse.json({
      success: true,
      totalProjects: projects.length,
      firstProject: projects[0] ? {
        title: projects[0].title,
        theme: projects[0].themeName,
        summary: projects[0].summary
      } : null,
      sampleSkills: projects.slice(0, 5).map((p: any) => ({
        title: p.title,
        extractedSkills: extractSkillsFromTitle(p.title)
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function extractSkillsFromTitle(title: string): string[] {
  const skills: string[] = [];
  const text = title.toLowerCase();
  
  if (text.includes('educ') || text.includes('ensin') || text.includes('profess')) skills.push('Ensino');
  if (text.includes('criança') || text.includes('criancas')) skills.push('Crianças');
  if (text.includes('saude')) skills.push('Saúde');
  if (text.includes('ambient')) skills.push('Meio Ambiente');
  if (text.includes('social')) skills.push('Ação Social');
  
  return skills;
}