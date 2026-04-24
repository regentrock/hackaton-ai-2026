import { NextRequest, NextResponse } from 'next/server';

// Dados mock de oportunidades
const mockOpportunities = [
  {
    id: 1,
    title: "Professor de Inglês para Crianças",
    organization: "ONG Educação Para Todos",
    location: "São Paulo, SP",
    description: "Ensinar inglês básico para crianças carentes",
    skills: ["Inglês", "Ensino", "Comunicação"]
  },
  {
    id: 2,
    title: "Desenvolvedor Web para Site de Doações",
    organization: "Ajuda Digital",
    location: "Rio de Janeiro, RJ",
    description: "Desenvolver e manter site de doações",
    skills: ["JavaScript", "React", "Web Development"]
  },
  {
    id: 3,
    title: "Assistente Social",
    organization: "Casa de Acolhida",
    location: "Belo Horizonte, MG",
    description: "Acompanhamento de famílias em situação de vulnerabilidade",
    skills: ["Assistência Social", "Psicologia", "Comunicação"]
  },
  {
    id: 4,
    title: "Designer Gráfico",
    organization: "Arte Solidária",
    location: "Porto Alegre, RS",
    description: "Criar materiais gráficos para campanhas",
    skills: ["Design", "Photoshop", "Ilustração"]
  },
  {
    id: 5,
    title: "Mentor de Programação",
    organization: "Tech para Todos",
    location: "Recife, PE",
    description: "Mentorar jovens em programação",
    skills: ["Programação", "Mentoria", "JavaScript"]
  },
  {
    id: 6,
    title: "Cozinheiro chefe",
    organization: "ONG alimentar",
    location: "Hortolândia, SP",
    description: "Preparar alimentos para os necessitados",
    skills: ["cozinhar", "alimentação", "comida"]
  }
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const city = searchParams.get('city');
    
    let filtered = [...mockOpportunities];
    
    if (city && city !== 'Não informada') {
      // Filtrar por cidade (case insensitive, partial match)
      filtered = mockOpportunities.filter(opp => 
        opp.location.toLowerCase().includes(city.toLowerCase())
      );
    }
    
    return NextResponse.json({
      success: true,
      opportunities: filtered,
      total: filtered.length,
      city: city || 'Todos'
    });
    
  } catch (error) {
    console.error('Erro ao buscar oportunidades:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar oportunidades' },
      { status: 500 }
    );
  }
}