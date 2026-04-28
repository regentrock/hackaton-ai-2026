// app/api/orchestrate/chat/route.ts - VERSÃO SIMPLIFICADA
import { NextRequest, NextResponse } from 'next/server';

// Armazenar a última área selecionada por usuário
const userSelectedArea = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId } = await request.json();
    
    const msgLower = message.toLowerCase().trim();
    
    console.log(`[Chat] Mensagem de ${userId}: "${msgLower}"`);
    
    // Verificar se é saudação
    if (msgLower === 'oi' || msgLower === 'olá' || msgLower === 'ola' || msgLower === 'hey') {
      return NextResponse.json({
        response: `Olá! 👋\n\nSou seu assistente de voluntariado. Posso ajudar você a encontrar oportunidades nas áreas:\n\n📚 Educação\n🏥 Saúde\n🌱 Meio Ambiente\n💻 Tecnologia\n🤝 Social\n\nQual área você tem interesse?`
      });
    }
    
    // Verificar se já tem uma área selecionada para este usuário
    let currentArea = userSelectedArea.get(userId) || '';
    
    // Procurar por área na mensagem atual
    let detectedArea = '';
    if (msgLower.includes('educação') || msgLower.includes('ensino') || msgLower.includes('escola')) {
      detectedArea = 'Educação';
    } else if (msgLower.includes('saúde') || msgLower.includes('saude') || msgLower.includes('hospital')) {
      detectedArea = 'Saúde';
    } else if (msgLower.includes('ambiente') || msgLower.includes('ecologia') || msgLower.includes('sustentabilidade')) {
      detectedArea = 'Meio Ambiente';
    } else if (msgLower.includes('tecnologia') || msgLower.includes('tech') || msgLower.includes('programação')) {
      detectedArea = 'Tecnologia';
    } else if (msgLower.includes('social') || msgLower.includes('comunidade')) {
      detectedArea = 'Social';
    }
    
    // Se detectou nova área, atualizar
    if (detectedArea) {
      currentArea = detectedArea;
      userSelectedArea.set(userId, currentArea);
      console.log(`[Chat] Área selecionada para ${userId}: ${currentArea}`);
    }
    
    // Se tem uma área selecionada, buscar oportunidades
    if (currentArea) {
      const opportunities = await fetchOpportunities(currentArea);
      
      if (opportunities.length === 0) {
        return NextResponse.json({
          response: `🔍 Não encontrei oportunidades na área de ${currentArea} no momento.\n\n📌 Que tal tentar outra área?\n\n📚 Educação\n🏥 Saúde\n🌱 Meio Ambiente\n💻 Tecnologia\n🤝 Social\n\nQual você prefere?`
        });
      }
      
      let responseText = `🔍 Encontrei ${opportunities.length} oportunidade(s) na área de ${currentArea}:\n\n`;
      
      opportunities.slice(0, 5).forEach((opp, index) => {
        let icon = '⭐';
        const theme = (opp.theme || '').toLowerCase();
        if (theme.includes('education')) icon = '📚';
        else if (theme.includes('health')) icon = '🏥';
        else if (theme.includes('environment') || theme.includes('climate')) icon = '🌱';
        else if (theme.includes('technology')) icon = '💻';
        
        responseText += `${index + 1}. ${icon} **${opp.title}**\n`;
        responseText += `   📍 ${opp.organization}\n`;
        responseText += `   📍 ${opp.location}\n`;
        responseText += `   🎯 ${opp.matchScore}% compatível\n`;
        responseText += `   💡 ${opp.reasoning}\n\n`;
      });
      
      responseText += `---\n⭐ Qual dessas oportunidades mais te interessou? Posso te dar mais detalhes!`;
      
      return NextResponse.json({
        response: responseText
      });
    }
    
    // Se não tem área selecionada e não detectou na mensagem
    return NextResponse.json({
      response: `Me diga qual área você tem interesse:\n\n📚 Educação\n🏥 Saúde\n🌱 Meio Ambiente\n💻 Tecnologia\n🤝 Social\n\nAssim posso buscar as melhores oportunidades para você!`
    });
    
  } catch (error: any) {
    console.error('[Chat] Erro:', error);
    return NextResponse.json({
      response: `Olá! Sou seu assistente de voluntariado. Me diga qual área você tem interesse (Educação, Saúde, Meio Ambiente, Tecnologia ou Social) e vou buscar as melhores oportunidades para você!`
    });
  }
}

async function fetchOpportunities(area: string): Promise<any[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hackaton-ai-2026.vercel.app';
  const url = `${baseUrl}/api/match/public?area=${encodeURIComponent(area)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.opportunities || [];
  } catch (error) {
    console.error('Erro ao buscar oportunidades:', error);
    return [];
  }
}