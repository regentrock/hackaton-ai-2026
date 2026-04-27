// app/api/orchestrate/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

const sessions = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId } = await request.json();
    
    console.log(`[Chat] Mensagem: "${message}"`);
    
    // Se for saudação ou pergunta sobre área, responder diretamente
    const msgLower = message.toLowerCase().trim();
    
    if (msgLower === 'oi' || msgLower === 'olá' || msgLower === 'ola') {
      return NextResponse.json({
        response: `Olá! 👋\n\nSou seu assistente de voluntariado. Posso ajudar você a encontrar oportunidades nas áreas:\n\n📚 Educação\n🏥 Saúde\n🌱 Meio Ambiente\n💻 Tecnologia\n🤝 Social\n\nQual área você tem interesse?`
      });
    }
    
    // Detectar área de interesse
    let area = '';
    if (msgLower.includes('educação') || msgLower.includes('ensino') || msgLower.includes('escola')) {
      area = 'Educação';
    } else if (msgLower.includes('saúde') || msgLower.includes('saude') || msgLower.includes('hospital')) {
      area = 'Saúde';
    } else if (msgLower.includes('ambiente') || msgLower.includes('ecologia') || msgLower.includes('sustentabilidade')) {
      area = 'Meio Ambiente';
    } else if (msgLower.includes('tecnologia') || msgLower.includes('tech') || msgLower.includes('programação')) {
      area = 'Tecnologia';
    } else if (msgLower.includes('social') || msgLower.includes('comunidade')) {
      area = 'Social';
    }
    
    // Se detectou área, buscar oportunidades
    if (area) {
      const opportunities = await fetchOpportunities(area);
      const response = formatOpportunitiesResponse(opportunities, area);
      return NextResponse.json({ response });
    }
    
    // Se não detectou área, pedir para especificar
    return NextResponse.json({
      response: `Me diga qual área você tem interesse:

📚 Educação
🏥 Saúde
🌱 Meio Ambiente
💻 Tecnologia
🤝 Social

Assim posso buscar as melhores oportunidades para você!`
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
  const url = `${baseUrl}/api/match/public${area ? `?area=${encodeURIComponent(area)}` : ''}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.opportunities || [];
  } catch (error) {
    console.error('Erro ao buscar oportunidades:', error);
    return [];
  }
}

function formatOpportunitiesResponse(opportunities: any[], area: string): string {
  if (opportunities.length === 0) {
    return `🔍 Não encontrei oportunidades na área de ${area} no momento.\n\n📌 Que tal tentar uma dessas áreas?\n\n📚 Educação\n🏥 Saúde\n🌱 Meio Ambiente\n💻 Tecnologia\n🤝 Social\n\nPosso ajudar com outra área!`;
  }
  
  let response = `🔍 Encontrei ${opportunities.length} oportunidade${opportunities.length > 1 ? 's' : ''} na área de ${area}:\n\n`;
  
  opportunities.slice(0, 5).forEach((opp, index) => {
    let icon = '⭐';
    const theme = (opp.theme || '').toLowerCase();
    if (theme.includes('education')) icon = '📚';
    else if (theme.includes('health')) icon = '🏥';
    else if (theme.includes('environment') || theme.includes('climate')) icon = '🌱';
    else if (theme.includes('technology')) icon = '💻';
    
    response += `${index + 1}. ${icon} **${opp.title}**\n`;
    response += `   📍 ${opp.organization}\n`;
    response += `   📍 ${opp.location}\n`;
    response += `   🎯 ${opp.matchScore}% compatível\n`;
    response += `   💡 ${opp.reasoning}\n\n`;
  });
  
  response += `---\n⭐ Qual dessas oportunidades mais te interessou? Posso te dar mais detalhes!`;
  
  return response;
}