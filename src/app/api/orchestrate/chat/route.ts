// app/api/orchestrate/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";

// Armazenar sessões por usuário
const sessions = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId } = await request.json();
    
    console.log(`[Orchestrate] Mensagem de ${userId}: ${message}`);
    
    // 1. Obter token IBM
    const token = await getIBMToken();
    
    // 2. Gerenciar sessão
    let currentSessionId = sessionId;
    if (!currentSessionId || !sessions.has(userId)) {
      currentSessionId = await createSession(token);
      sessions.set(userId, currentSessionId);
      console.log(`[Orchestrate] Nova sessão criada: ${currentSessionId}`);
    } else {
      currentSessionId = sessions.get(userId)!;
    }
    
    // 3. Enviar mensagem para o agente
    const response = await sendMessage(token, currentSessionId, message);
    
    // 4. Verificar se o agente quer buscar oportunidades
    const responseText = response.output?.generic?.[0]?.text || '';
    
    // Se o agente chamar a tool ou mencionar busca, fazemos a busca
    if (responseText.toLowerCase().includes('findmatches') || 
        responseText.toLowerCase().includes('buscar') ||
        message.toLowerCase().includes('oportunidade') ||
        message.toLowerCase().includes('vaga')) {
      
      const area = extractArea(message);
      const opportunities = await fetchOpportunities(area);
      
      const formattedResponse = formatOpportunitiesResponse(opportunities, area, responseText);
      
      return NextResponse.json({
        response: formattedResponse,
        sessionId: currentSessionId
      });
    }
    
    return NextResponse.json({
      response: responseText || 'Como posso ajudar você a encontrar oportunidades de voluntariado?',
      sessionId: currentSessionId
    });
    
  } catch (error: any) {
    console.error('[Orchestrate] Erro:', error);
    
    // Fallback: resposta amigável
    return NextResponse.json({
      response: 'Estou aqui para ajudar! Me diga qual área de voluntariado você tem interesse (Educação, Saúde, Meio Ambiente, Tecnologia ou Social) que posso buscar as melhores oportunidades para você.',
      error: error.message
    });
  }
}

async function getIBMToken(): Promise<string> {
  const apiKey = process.env.IBM_API_KEY;
  
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey!
    })
  });
  
  if (!response.ok) {
    throw new Error(`Erro ao obter token: ${response.status}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

async function createSession(token: string): Promise<string> {
  // Endpoint correto para criar sessão no Orchestrate
  const url = `https://api.us-south.assistant.watson.cloud.ibm.com/v1/assistants/${AGENT_ID}/sessions?version=2024-02-01`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao criar sessão: ${error}`);
  }
  
  const data = await response.json();
  return data.session_id;
}

async function sendMessage(token: string, sessionId: string, message: string): Promise<any> {
  const url = `https://api.us-south.assistant.watson.cloud.ibm.com/v1/assistants/${AGENT_ID}/sessions/${sessionId}/message?version=2024-02-01`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: {
        text: message
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao enviar mensagem: ${error}`);
  }
  
  return response.json();
}

function extractArea(message: string): string {
  const msg = message.toLowerCase();
  
  if (msg.includes('educação') || msg.includes('education') || msg.includes('ensino') || msg.includes('escola')) {
    return 'Educação';
  }
  if (msg.includes('saúde') || msg.includes('health') || msg.includes('hospital') || msg.includes('medicina')) {
    return 'Saúde';
  }
  if (msg.includes('ambiente') || msg.includes('environment') || msg.includes('ecologia') || msg.includes('sustentabilidade')) {
    return 'Meio Ambiente';
  }
  if (msg.includes('tecnologia') || msg.includes('technology') || msg.includes('tech') || msg.includes('programação')) {
    return 'Tecnologia';
  }
  if (msg.includes('social') || msg.includes('community') || msg.includes('comunidade') || msg.includes('assistência')) {
    return 'Social';
  }
  
  return '';
}

async function fetchOpportunities(area: string): Promise<any[]> {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hackaton-ai-2026.vercel.app'}/api/match/public${area ? `?area=${encodeURIComponent(area)}` : ''}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.opportunities || [];
  } catch (error) {
    console.error('Erro ao buscar oportunidades:', error);
    return [];
  }
}

function formatOpportunitiesResponse(opportunities: any[], area: string, originalResponse: string): string {
  if (opportunities.length === 0) {
    return `Não encontrei oportunidades na área de ${area || 'voluntariado'} no momento. Que tal tentar: Educação, Saúde, Meio Ambiente, Tecnologia ou Social? Posso ajudar com outra área.`;
  }
  
  let response = `Encontrei ${opportunities.length} oportunidade${opportunities.length > 1 ? 's' : ''}`;
  response += area ? ` na área de ${area}` : '';
  response += `:\n\n`;
  
  opportunities.slice(0, 5).forEach((opp, index) => {
    let icon = '⭐';
    const theme = (opp.theme || '').toLowerCase();
    if (theme.includes('education')) icon = '📚';
    else if (theme.includes('health')) icon = '🏥';
    else if (theme.includes('environment') || theme.includes('climate')) icon = '🌱';
    else if (theme.includes('technology')) icon = '💻';
    else if (theme.includes('social') || theme.includes('community')) icon = '🤝';
    
    response += `${icon} **${opp.title}**\n`;
    response += `   📍 Organização: ${opp.organization}\n`;
    response += `   📍 Local: ${opp.location}\n`;
    response += `   🎯 Compatibilidade: ${opp.matchScore}%\n`;
    response += `   💡 ${opp.reasoning}\n\n`;
  });
  
  response += `Qual dessas oportunidades mais te interessou? Posso te dar mais detalhes!`;
  
  return response;
}