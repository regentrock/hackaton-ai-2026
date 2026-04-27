// app/api/orchestrate/opportunities/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const area = request.nextUrl.searchParams.get('area') || '';
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '5');
  
  console.log(`🔧 [Orchestrate] Buscando oportunidades para área: "${area}"`);
  
  try {
    // Buscar oportunidades da sua API real
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/match`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ API respondeu com erro: ${response.status}`);
      return NextResponse.json({
        success: false,
        error: `API respondeu com status ${response.status}`
      }, { status: response.status });
    }
    
    const data = await response.json();
    let matches = data.matches || [];
    
    console.log(`📦 Total de matches da API: ${matches.length}`);
    
    // Filtrar por área se especificada
    if (area) {
      const areaLower = area.toLowerCase();
      matches = matches.filter((match: any) => {
        const theme = (match.theme || '').toLowerCase();
        const title = (match.title || '').toLowerCase();
        const description = (match.description || '').toLowerCase();
        
        return theme.includes(areaLower) || 
               title.includes(areaLower) || 
               description.includes(areaLower);
      });
      console.log(`🎯 Filtrados ${matches.length} matches para área "${area}"`);
    }
    
    // Formatar resposta
    const formattedMatches = matches.slice(0, limit).map((match: any) => ({
      titulo: match.title,
      organizacao: match.organization,
      localizacao: match.location,
      compatibilidade: `${match.matchScore}%`,
      razao: match.reasoning || `Compatível com seu interesse em ${area || 'voluntariado'}`,
      habilidades: match.matchedSkills || []
    }));
    
    return NextResponse.json({
      success: true,
      oportunidades: formattedMatches,
      total_encontrado: matches.length,
      area_solicitada: area
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidades:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno ao buscar oportunidades'
    }, { status: 500 });
  }
}