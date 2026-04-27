// app/api/match/public/route.ts - VERSÃO PURA (APENAS DADOS)
import { NextRequest, NextResponse } from 'next/server';

// Cache simples para não sobrecarregar a GlobalGiving
let cachedData: any = null;
let cacheTime = 0;

export async function GET(request: NextRequest) {
  console.log('[API] Buscando oportunidades da GlobalGiving');
  
  try {
    // Buscar TODAS as oportunidades (sem filtro)
    let opportunities = await fetchAllOpportunities();
    
    if (!opportunities || opportunities.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        total: 0
      });
    }
    
    console.log(`[API] Retornando ${opportunities.length} oportunidades (sem filtro)`);
    
    // Retornar TUDO - o Orchestrate/IA vai filtrar semanticamente
    return NextResponse.json({
      success: true,
      opportunities: opportunities,
      total: opportunities.length,
      source: 'globalgiving'
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

async function fetchAllOpportunities(): Promise<any[]> {
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
    
    // Buscar TODOS os projetos (sem filtro de área)
    const allProjects: any[] = [];
    
    for (let page = 1; page <= 3; page++) {
      const url = `https://api.globalgiving.org/api/public/projectservice/countries/BR/projects/active?api_key=${apiKey}&page=${page}&per_page=20`;
      
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      
      if (!response.ok) break;
      
      const data = await response.json();
      const projects = data?.projects?.project || [];
      
      if (projects.length === 0) break;
      
      allProjects.push(...projects);
      console.log(`[GlobalGiving] Página ${page}: +${projects.length} projetos`);
    }
    
    console.log(`[GlobalGiving] Total: ${allProjects.length} projetos encontrados`);
    
    // Mapear para formato limpo (sem filtro)
    const mapped = allProjects.map((p: any) => ({
      id: p.id,
      title: p.title || 'Projeto de Voluntariado',
      organization: p.organization?.name || 'Organização Parceira',
      location: p.location?.city ? `${p.location.city}, ${p.location.country || 'BR'}` : 'Brasil',
      description: (p.summary || p.description || '').substring(0, 500),
      theme: p.themeName || 'Voluntariado',
      projectLink: p.projectLink || '#',
      // Campo original para a IA analisar
      raw_title: p.title,
      raw_theme: p.themeName,
      raw_description: (p.summary || p.description || '').substring(0, 300)
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