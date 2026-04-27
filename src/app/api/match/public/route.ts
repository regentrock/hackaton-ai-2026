// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Dados de emergência (APENAS para testar se o Orchestrate consegue receber algo)
// Assim que a GlobalGiving funcionar, você pode remover isso.
const EMERGENCY_DATA = [
  { title: "Projeto Piloto - Educação Ambiental", organization: "ONG Teste", location: "Brasil", matchScore: 85, theme: "Educação" },
  { title: "Curso de Inglês para Jovens", organization: "Instituto Aprender", location: "SP", matchScore: 90, theme: "Educação" },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  const useEmergency = url.searchParams.get('emergency') === 'true'; // Forçar emergency? ?a=b

  console.log(`[API Pública] Iniciando para área: ${area}`);

  // --- SE FORÇADO A USAR EMERGENCY (para testar o Orchestrate) ---
  if (useEmergency) {
    console.log(`[API Pública] Usando dados de EMERGÊNCIA para teste.`);
    let filteredEmergency = EMERGENCY_DATA;
    if (area) {
      filteredEmergency = EMERGENCY_DATA.filter(opp => opp.theme.toLowerCase().includes(area.toLowerCase()));
    }
    return NextResponse.json({ success: true, opportunities: filteredEmergency, total: filteredEmergency.length, source: "emergency" });
  }

  // --- FLUXO NORMAL: TENTAR A GLOBALGIVING REAL ---
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) {
    console.error(`[API Pública] Erro: GLOBAL_GIVING_API_KEY não configurada.`);
    // Fallback: retornar emergency data para não quebrar o Orchestrate
    return NextResponse.json({ success: false, opportunities: EMERGENCY_DATA, total: EMERGENCY_DATA.length, error: "API Key not set" });
  }

  const globalGivingUrl = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}`;

  try {
    const response = await fetch(globalGivingUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`GlobalGiving API respondeu com status ${response.status}`);
    }

    const data = await response.json();
    const projects = data?.projects?.project;

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      console.warn(`[API Pública] Nenhum projeto encontrado na GlobalGiving para o Brasil.`);
      // Retornar array vazio, mas com sucesso.
      return NextResponse.json({ success: true, opportunities: [], total: 0 });
    }

    // Mapear e filtrar os projetos reais
    let allOpportunities = projects.map((p: any) => ({
      title: p.title || 'Projeto sem título',
      organization: p.organization?.name || 'Organização não informada',
      location: p.location?.city ? `${p.location.city}, ${p.location.country || 'BR'}` : 'Local não informado',
      matchScore: 75, // Placeholder
      reasoning: `Oportunidade encontrada na área de ${p.themeName || 'voluntariado'}.`,
      theme: p.themeName || 'Tema não informado',
    }));

    let filteredOpportunities = allOpportunities;
    if (area) {
      const lowerArea = area.toLowerCase();
      filteredOpportunities = allOpportunities.filter(opp =>
        opp.theme?.toLowerCase().includes(lowerArea) ||
        opp.title?.toLowerCase().includes(lowerArea)
      );
    }

    console.log(`[API Pública] Sucesso! Retornando ${filteredOpportunities.length} oportunidades da GlobalGiving.`);
    return NextResponse.json({ success: true, opportunities: filteredOpportunities, total: filteredOpportunities.length, source: "globalgiving" });

  } catch (error: any) {
    console.error(`[API Pública] Erro ao buscar da GlobalGiving:`, error.message);
    // Em caso de erro, retornar emergency data para não quebrar o Orchestrate
    console.log(`[API Pública] Usando dados de EMERGÊNCIA devido a erro.`);
    let filteredEmergency = EMERGENCY_DATA;
    if (area) {
      filteredEmergency = EMERGENCY_DATA.filter(opp => opp.theme.toLowerCase().includes(area.toLowerCase()));
    }
    return NextResponse.json({ success: false, opportunities: filteredEmergency, total: filteredEmergency.length, error: error.message, source: "emergency" });
  }
}