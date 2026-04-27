// app/api/match/public/route.ts - VERSÃO SIMPLIFICADA E GARANTIDA
import { NextRequest, NextResponse } from 'next/server';

// Cache simples
let cachedData: any = null;
let cacheTime = 0;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') || '';
  
  console.log(`[API] Buscando oportunidades para: "${area}"`);
  
  try {
    // Buscar dados (com cache de 5 minutos)
    let opportunities = await fetchFromGlobalGiving();
    
    if (!opportunities || opportunities.length === 0) {
      console.log('[API] Nenhuma oportunidade encontrada');
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0,
        area: area
      });
    }
    
    console.log(`[API] Total de oportunidades: ${opportunities.length}`);
    console.log(`[API] Primeiras oportunidades:`, opportunities.slice(0, 2).map(o => o.title));
    
    // Filtrar por área
    let filtered = opportunities;
    if (area && area.trim() !== '') {
      const areaLower = area.toLowerCase();
      filtered = opportunities.filter(opp => {
        const theme = (opp.theme || '').toLowerCase();
        const title = (opp.title || '').toLowerCase();
        return theme.includes(areaLower) || title.includes(areaLower);
      });
      console.log(`[API] Filtrados ${filtered.length} oportunidades para "${area}"`);
    }
    
    // Formatar resposta
    const results = filtered.slice(0, 10).map(opp => ({
      title: opp.title,
      organization: opp.organization,
      location: opp.location,
      matchScore: 75,
      reasoning: `Oportunidade em ${opp.theme || 'voluntariado'} - excelente para seu perfil!`,
      matchedSkills: ['Comunicação', 'Trabalho em equipe'],
      theme: opp.theme,
      projectLink: opp.projectLink
    }));
    
    return NextResponse.json({
      success: true,
      opportunities: results,
      total: results.length,
      area: area
    });
    
  } catch (error: any) {
    console.error('[API] Erro:', error);
    return NextResponse.json({
      success: false,
      opportunities: [],
      total: 0,
      error: error.message
    }, { status: 500 });
  }
}

async function fetchFromGlobalGiving(): Promise<any[]> {
  // Verificar cache
  const now = Date.now();
  if (cachedData && (now - cacheTime) < 5 * 60 * 1000) {
    console.log('[Cache] Usando dados em cache');
    return cachedData;
  }
  
  const apiKey = process.env.GLOBAL_GIVING_API_KEY;
  if (!apiKey) {
    console.error('[Erro] API Key não configurada');
    return [];
  }
  
  try {
    console.log('[GlobalGiving] Buscando projetos...');
    
    // Buscar apenas uma página para teste
    const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=1&per_page=20`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`[GlobalGiving] HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    // Extrair projetos - a estrutura CORRETA é data.projects.project
    const projects = data?.projects?.project;
    
    if (!projects || !Array.isArray(projects)) {
      console.error('[GlobalGiving] Estrutura inesperada. Keys:', Object.keys(data || {}));
      return [];
    }
    
    console.log(`[GlobalGiving] ${projects.length} projetos encontrados`);
    
    // Mapear para o formato desejado
    const mapped = projects.map((p: any) => ({
      id: p.id,
      title: p.title || 'Projeto de Voluntariado',
      organization: p.organization?.name || 'Organização Parceira',
      location: p.location?.city ? `${p.location.city}, ${p.location.country || 'BR'}` : 'Brasil',
      description: (p.summary || p.description || '').substring(0, 300),
      theme: p.themeName || 'Voluntariado',
      projectLink: p.projectLink || '#',
      matchScore: 75
    }));
    
    // Armazenar em cache
    cachedData = mapped;
    cacheTime = now;
    
    return mapped;
    
  } catch (error: any) {
    console.error('[GlobalGiving] Erro:', error.message);
    return [];
  }
}