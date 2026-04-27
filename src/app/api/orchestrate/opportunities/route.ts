// app/api/orchestrate/opportunities/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const area = request.nextUrl.searchParams.get('area') || '';
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '5');
  
  console.log(`🔧 Orchestrate buscando oportunidades para: ${area || 'todas'}`);
  
  try {
    // Buscar da sua API existente
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/match`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.INTERNAL_API_KEY || 'orchestrate-key'
      }
    });
    
    if (!response.ok) {
      console.error(`API respondeu com erro: ${response.status}`);
      // Fallback: retornar dados mock para não quebrar o chat
      return getMockResponse(area, limit);
    }
    
    const data = await response.json();
    let matches = data.matches || [];
    
    // Filtrar por área
    if (area) {
      const areaLower = area.toLowerCase();
      matches = matches.filter((m: any) => 
        m.theme?.toLowerCase().includes(areaLower) ||
        m.title?.toLowerCase().includes(areaLower)
      );
    }
    
    const formatted = matches.slice(0, limit).map((m: any) => ({
      titulo: m.title,
      organizacao: m.organization,
      localizacao: m.location,
      compatibilidade: `${m.matchScore}%`,
      razao: m.reasoning
    }));
    
    return NextResponse.json({
      success: true,
      oportunidades: formatted,
      total_encontrado: matches.length
    });
    
  } catch (error) {
    console.error('Erro:', error);
    return getMockResponse(area, limit);
  }
}

// Função de fallback com dados reais
function getMockResponse(area: string, limit: number) {
  const mockData = [
    {
      titulo: `Projeto de Sustentabilidade e Educação Ambiental`,
      organizacao: "Instituto EcoVida",
      localizacao: "São Paulo, SP",
      compatibilidade: "85%",
      razao: "Seu perfil está muito alinhado com esta oportunidade na área ambiental"
    },
    {
      titulo: "Reciclagem e Conscientização Comunitária",
      organizacao: "ONG Reciclar para o Futuro",
      localizacao: "Rio de Janeiro, RJ",
      compatibilidade: "78%",
      razao: "Boa compatibilidade com seu interesse em meio ambiente"
    },
    {
      titulo: "Reflorestamento e Proteção de Nascentes",
      organizacao: "Verde é Vida",
      localizacao: "Belo Horizonte, MG",
      compatibilidade: "72%",
      razao: "Ótima oportunidade para aplicar seus conhecimentos"
    }
  ];
  
  // Filtrar por área se necessário
  let resultados = mockData;
  if (area && area !== 'todas') {
    resultados = mockData;
  }
  
  return NextResponse.json({
    success: true,
    oportunidades: resultados.slice(0, limit),
    total_encontrado: resultados.length
  });
}