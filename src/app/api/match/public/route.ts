// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log('========== [INÍCIO] Requisição para área:', area);
  
  // --- 1. Validar a chave da API ---
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) {
    console.error('[ERRO] Chave GLOBAL_GIVING_API_KEY não configurada.');
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Chave de API da GlobalGiving não configurada no servidor.'
    }, { status: 500 });
  }
  console.log('[INFO] Chave da API encontrada.');

  // --- 2. Construir e chamar a URL da GlobalGiving ---
  // Usando o endpoint de projetos do Brasil, retornando menos dados por página para testes.
  const globalGivingUrl = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=1&per_page=20`;
  console.log('[INFO] Chamando URL:', globalGivingUrl.replace(apiKey, '***'));

  let projectsData = null;
  try {
    const response = await fetch(globalGivingUrl, {
      headers: { 'Accept': 'application/json' },
    });
    console.log(`[INFO] Status da resposta da GlobalGiving: ${response.status}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    projectsData = await response.json();
    console.log('[INFO] Dados JSON recebidos da GlobalGiving com sucesso.');
  } catch (fetchError: any) {
    console.error('[ERRO] Falha na requisição à GlobalGiving:', fetchError.message);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: `Falha ao se comunicar com a GlobalGiving: ${fetchError.message}`
    }, { status: 502 });
  }

  // --- 3. Extrair o array de projetos da resposta ---
  // A estrutura da API é: { projects: { project: [ ... ] } }
  const projects = projectsData?.projects?.project;
  
  if (!projects || !Array.isArray(projects)) {
    console.error('[ERRO] Formato de resposta inesperado da GlobalGiving. Estrutura "projects.project" não encontrada.');
    console.log('[DEBUG] Resposta amostra (primeiros 200 chars):', JSON.stringify(projectsData).substring(0, 200));
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Formato de dados inesperado recebido da GlobalGiving.'
    }, { status: 502 });
  }
  
  console.log(`[INFO] Recebidos ${projects.length} projetos da GlobalGiving.`);

  // --- 4. Mapear para o formato que o Orchestrate espera ---
  if (projects.length === 0) {
    console.warn('[INFO] Nenhum projeto ativo encontrado para o Brasil.');
    return NextResponse.json({
      success: true,
      opportunities: [],
      total: 0,
      area: area,
      message: 'Nenhum projeto ativo encontrado na GlobalGiving para o Brasil no momento.'
    });
  }

  const rawOpportunities = projects.map((project: any) => ({
    id: project.id,
    title: project.title || 'Projeto sem título',
    organization: project.organization?.name || 'Organização não informada',
    location: `${project.location?.city || 'Local não informado'}, ${project.location?.country || 'BR'}`,
    description: (project.summary || project.description || '').substring(0, 400),
    theme: project.themeName || 'Tema não especificado',
    projectLink: project.projectLink,
    // Campos originais para debug
    _rawTheme: project.themeName
  }));

  // --- 5. Filtrar pela área, se fornecida ---
  let finalOpportunities = rawOpportunities;
  if (area) {
    const searchTerm = area.toLowerCase();
    finalOpportunities = rawOpportunities.filter(opp => {
      // Busca em português e inglês no título, tema e descrição
      const titleMatch = opp.title?.toLowerCase().includes(searchTerm);
      const themeMatch = opp.theme?.toLowerCase().includes(searchTerm);
      const descMatch = opp.description?.toLowerCase().includes(searchTerm);
      // Log para entender o que está sendo filtrado (útil para debug)
      if (titleMatch || themeMatch || descMatch) {
        console.log(`[DEBUG] Match para "${area}": ${opp.title} (Tema: ${opp.theme})`);
      }
      return titleMatch || themeMatch || descMatch;
    });
    console.log(`[INFO] Filtro por "${area}" aplicado. Resultados: ${finalOpportunities.length} de ${rawOpportunities.length}`);
  } else {
    console.log('[INFO] Nenhum filtro de área aplicado.');
  }

  // --- 6. Formatar a resposta FINAL para o Orchestrate (sem mocks, sem fallbacks)---
  const formattedResults = finalOpportunities.slice(0, 10).map(opp => ({
    title: opp.title,
    organization: opp.organization,
    location: opp.location,
    matchScore: 75, // Score padrão sem dados do usuário. Ajuste se tiver perfil.
    reasoning: `Oportunidade baseada no seu interesse por ${area || 'voluntariado'}. (Tema do projeto: ${opp.theme})`,
    matchedSkills: ['Comunicação', 'Trabalho em equipe'], // Placeholder sem perfil real
    theme: opp.theme,
    projectLink: opp.projectLink
  }));

  console.log(`========== [FIM] Retornando ${formattedResults.length} oportunidades. ==========`);
  
  return NextResponse.json({
    success: true,
    opportunities: formattedResults,
    total: formattedResults.length,
    area: area
  });
}