// app/api/match/public/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log('========== [INÍCIO] Requisição para área:', area);
  
  // 1. Verificar API Key
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  console.log('[1] API Key presente?', apiKey ? 'SIM' : 'NÃO');
  console.log('[1] API Key (primeiros 8 chars):', apiKey ? apiKey.substring(0, 8) + '...' : 'N/A');
  
  if (!apiKey) {
    console.error('[ERRO] GLOBAL_GIVING_API_KEY não configurada');
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'API Key não configurada'
    });
  }
  
  // 2. Construir URL da GlobalGiving
  const globalGivingUrl = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=1&per_page=20`;
  console.log('[2] URL chamada (com API Key oculta):', globalGivingUrl.replace(apiKey, '***'));
  
  // 3. Fazer a requisição
  let response;
  try {
    response = await fetch(globalGivingUrl, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    console.log('[3] Status da resposta:', response.status);
  } catch (fetchError: any) {
    console.error('[ERRO] Falha no fetch:', fetchError.message);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: `Erro ao chamar GlobalGiving: ${fetchError.message}`
    });
  }
  
  if (!response.ok) {
    console.error('[ERRO] Resposta não OK:', response.status, response.statusText);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: `GlobalGiving respondeu com status ${response.status}`
    });
  }
  
  // 4. Parsear resposta
  let data;
  try {
    data = await response.json();
    console.log('[4] Dados recebidos com sucesso');
  } catch (parseError: any) {
    console.error('[ERRO] Falha ao parsear JSON:', parseError.message);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Erro ao processar resposta da GlobalGiving'
    });
  }
  
  // 5. Extrair projetos
  const projects = data?.projects?.project;
  console.log('[5] Projetos encontrados:', projects ? projects.length : 0);
  
  if (!projects || !Array.isArray(projects)) {
    console.error('[ERRO] Estrutura inesperada. keys:', Object.keys(data || {}));
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: 'Formato de resposta inesperado da GlobalGiving'
    });
  }
  
  if (projects.length === 0) {
    console.warn('[AVISO] Nenhum projeto ativo encontrado para o Brasil');
    return NextResponse.json({
      success: true,
      opportunities: [],
      total: 0,
      area: area,
      message: 'Nenhum projeto ativo no momento'
    });
  }
  
  // 6. Mapear oportunidades
  const allOpportunities = projects.map((p: any) => ({
    title: p.title || 'Projeto sem título',
    organization: p.organization?.name || 'ONG não informada',
    location: `${p.location?.city || 'Local não informado'}, ${p.location?.country || 'BR'}`,
    description: (p.summary || p.description || '').substring(0, 300),
    theme: p.themeName || 'Tema não informado',
    projectLink: p.projectLink
  }));
  
  console.log('[6] Oportunidades mapeadas:', allOpportunities.length);
  console.log('[6] Primeiro título:', allOpportunities[0]?.title);
  
  // 7. Filtrar por área
  let filteredOpportunities = allOpportunities;
  if (area) {
    const areaLower = area.toLowerCase();
    filteredOpportunities = allOpportunities.filter(opp => {
      const theme = (opp.theme || '').toLowerCase();
      const title = (opp.title || '').toLowerCase();
      return theme.includes(areaLower) || title.includes(areaLower);
    });
    console.log('[7] Filtrados por área:', filteredOpportunities.length);
  }
  
  // 8. Formatar resposta
  const results = filteredOpportunities.slice(0, 10).map(opp => ({
    title: opp.title,
    organization: opp.organization,
    location: opp.location,
    matchScore: 75,
    reasoning: `Oportunidade na área de ${opp.theme}`,
    matchedSkills: ['Comunicação', 'Trabalho em equipe'],
    theme: opp.theme,
    projectLink: opp.projectLink
  }));
  
  console.log('[8] FINAL - Retornando', results.length, 'oportunidades');
  console.log('========== [FIM] ==========');
  
  return NextResponse.json({
    success: true,
    opportunities: results,
    total: results.length,
    area: area
  });
}