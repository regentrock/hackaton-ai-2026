// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log(`🔍 API chamada para área: "${area}"`);
  
  // Dados FIXOS para garantir que sempre retorna algo
  const oportunidades = [
    {
      title: "Projeto de Alfabetização de Jovens e Adultos",
      organization: "Instituto Educar para o Futuro",
      location: "São Paulo, SP",
      matchScore: 92,
      reasoning: "Excelente oportunidade para aplicar seus conhecimentos em educação",
      matchedSkills: ["Ensino", "Comunicação", "Didática"],
      theme: "Educação"
    },
    {
      title: "Reforço Escolar para Crianças",
      organization: "ONG Criança Feliz",
      location: "Rio de Janeiro, RJ",
      matchScore: 88,
      reasoning: "Ótima chance de contribuir com a educação infantil",
      matchedSkills: ["Pedagogia", "Paciência", "Criatividade"],
      theme: "Educação"
    },
    {
      title: "Biblioteca Comunitária e Incentivo à Leitura",
      organization: "Instituto Leitura para Todos",
      location: "Belo Horizonte, MG",
      matchScore: 85,
      reasoning: "Perfeito para quem ama livros e educação",
      matchedSkills: ["Organização", "Comunicação", "Incentivo à leitura"],
      theme: "Educação"
    },
    {
      title: "Educação Ambiental nas Escolas",
      organization: "Sustentabilidade na Educação",
      location: "Curitiba, PR",
      matchScore: 82,
      reasoning: "Una educação com consciência ambiental",
      matchedSkills: ["Educação ambiental", "Planejamento", "Comunicação"],
      theme: "Educação"
    },
    {
      title: "Capacitação de Professores em Comunidades",
      organization: "Instituto Valoriza Professor",
      location: "Salvador, BA",
      matchScore: 90,
      reasoning: "Impacte diretamente a qualidade do ensino",
      matchedSkills: ["Formação de professores", "Liderança", "Empatia"],
      theme: "Educação"
    },
    {
      title: "Projeto de Saúde Comunitária",
      organization: "Saúde para Todos",
      location: "Recife, PE",
      matchScore: 75,
      reasoning: "Ótima oportunidade na área da saúde",
      matchedSkills: ["Atendimento", "Organização", "Empatia"],
      theme: "Saúde"
    },
    {
      title: "Reciclagem e Sustentabilidade",
      organization: "Verde é Vida",
      location: "Porto Alegre, RS",
      matchScore: 78,
      reasoning: "Contribua com o meio ambiente",
      matchedSkills: ["Educação ambiental", "Organização", "Comunicação"],
      theme: "Meio Ambiente"
    },
    {
      title: "Ensino de Programação para Jovens",
      organization: "Tech Solidária",
      location: "Remoto",
      matchScore: 95,
      reasoning: "Prepare jovens para o mercado de tecnologia",
      matchedSkills: ["Programação", "Didática", "Paciência"],
      theme: "Tecnologia"
    },
    {
      title: "Assistência Social a Famílias",
      organization: "Acolher",
      location: "Fortaleza, CE",
      matchScore: 80,
      reasoning: "Ajude quem mais precisa",
      matchedSkills: ["Escuta ativa", "Empatia", "Organização"],
      theme: "Social"
    }
  ];
  
  // Filtrar por área se especificada
  let resultados = oportunidades;
  if (area && area !== '') {
    const areaLower = area.toLowerCase();
    resultados = oportunidades.filter(opp => 
      opp.theme.toLowerCase() === areaLower ||
      opp.theme.toLowerCase().includes(areaLower)
    );
  }
  
  console.log(`✅ Retornando ${resultados.length} oportunidades para ${area || 'todas as áreas'}`);
  
  return NextResponse.json({
    success: true,
    opportunities: resultados,
    total: resultados.length,
    area: area || 'todas'
  });
}