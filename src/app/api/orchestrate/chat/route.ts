// app/api/orchestrate/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

// Armazenar sessões por usuário
const sessions = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId } = await request.json();
    
    console.log(`[Orchestrate] Mensagem de ${userId}: "${message}"`);
    console.log(`[Orchestrate] SessionId recebido: ${sessionId}`);
    
    // 1. Obter token IBM
    const token = await getIBMToken();
    console.log(`[Orchestrate] Token obtido com sucesso`);
    
    // 2. Gerenciar sessão
    let currentSessionId = sessionId;
    if (!currentSessionId || !sessions.has(userId)) {
      console.log(`[Orchestrate] Criando nova sessão...`);
      currentSessionId = await createSession(token);
      sessions.set(userId, currentSessionId);
      console.log(`[Orchestrate] Nova sessão criada: ${currentSessionId}`);
    } else {
      currentSessionId = sessions.get(userId)!;
      console.log(`[Orchestrate] Usando sessão existente: ${currentSessionId}`);
    }
    
    // 3. Enviar mensagem para o agente
    console.log(`[Orchestrate] Enviando mensagem para o agente...`);
    const response = await sendMessage(token, currentSessionId, message);
    
    console.log(`[Orchestrate] Resposta recebida:`, JSON.stringify(response, null, 2));
    
    // 4. Extrair resposta do agente
    let responseText = '';
    
    // Verificar estrutura da resposta do Orchestrate
    if (response.output?.generic) {
      for (const item of response.output.generic) {
        if (item.type === 'text') {
          responseText += item.text + '\n';
        }
      }
    } else if (response.output?.text) {
      responseText = response.output.text;
    } else if (response.result?.output?.generic) {
      for (const item of response.result.output.generic) {
        if (item.type === 'text') {
          responseText += item.text + '\n';
        }
      }
    } else {
      responseText = response.text || response.message || 'Como posso ajudar você a encontrar oportunidades de voluntariado?';
    }
    
    responseText = responseText.trim();
    
    console.log(`[Orchestrate] Resposta extraída: "${responseText}"`);
    
    // 5. Se o agente pediu para usar a tool, buscar oportunidades
    if (responseText.toLowerCase().includes('findmatches') || 
        responseText.toLowerCase().includes('buscar') ||
        (message.toLowerCase().includes('educação') && responseText.length < 50)) {
      
      console.log(`[Orchestrate] Agente solicitou busca de oportunidades`);
      const area = extractArea(message);
      const opportunities = await fetchOpportunities(area);
      
      const formattedResponse = formatOpportunitiesResponse(opportunities, area);
      return NextResponse.json({
        response: formattedResponse,
        sessionId: currentSessionId
      });
    }
    
    return NextResponse.json({
      response: responseText || 'Me diga qual área de voluntariado você tem interesse (Educação, Saúde, Meio Ambiente, Tecnologia ou Social)',
      sessionId: currentSessionId
    });
    
  } catch (error: any) {
    console.error('[Orchestrate] Erro detalhado:', error);
    
    // Fallback amigável
    return NextResponse.json({
      response: `Olá! Sou seu assistente de voluntariado. Posso ajudar você a encontrar oportunidades nas áreas:

📚 Educação
🏥 Saúde
🌱 Meio Ambiente
💻 Tecnologia
🤝 Social

Qual área você tem interesse?`,
      error: error.message
    });
  }
}

async function getIBMToken(): Promise<string> {
  const apiKey = process.env.IBM_API_KEY;
  
  if (!apiKey) {
    throw new Error('IBM_API_KEY não configurada');
  }
  
  const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao obter token: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

async function createSession(token: string): Promise<string> {
  // URL correta para criar sessão no Watson Assistant/Orchestrate
  const url = `https://api.us-south.assistant.watson.cloud.ibm.com/v2/assistants/${AGENT_ID}/sessions?version=2024-02-01`;
  
  console.log(`[Orchestrate] Criando sessão em: ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Orchestrate] Erro ao criar sessão: ${response.status} - ${errorText}`);
    throw new Error(`Erro ao criar sessão: ${response.status}`);
  }
  
  const data = await response.json();
  return data.session_id;
}

async function sendMessage(token: string, sessionId: string, message: string): Promise<any> {
  const url = `https://api.us-south.assistant.watson.cloud.ibm.com/v2/assistants/${AGENT_ID}/sessions/${sessionId}/message?version=2024-02-01`;
  
  console.log(`[Orchestrate] Enviando mensagem para: ${url}`);
  
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
    const errorText = await response.text();
    console.error(`[Orchestrate] Erro ao enviar mensagem: ${response.status} - ${errorText}`);
    throw new Error(`Erro ao enviar mensagem: ${response.status}`);
  }
  
  return response.json();
}

function extractArea(message: string): string {
  const msg = message.toLowerCase();
  
  if (msg.includes('educação') || msg.includes('education') || msg.includes('ensino')) {
    return 'Educação';
  }
  if (msg.includes('saúde') || msg.includes('health')) {
    return 'Saúde';
  }
  if (msg.includes('ambiente') || msg.includes('environment')) {
    return 'Meio Ambiente';
  }
  if (msg.includes('tecnologia') || msg.includes('technology')) {
    return 'Tecnologia';
  }
  if (msg.includes('social') || msg.includes('community')) {
    return 'Social';
  }
  
  return '';
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
    return `Não encontrei oportunidades na área de ${area} no momento. Que tal tentar: Educação, Saúde, Meio Ambiente, Tecnologia ou Social?`;
  }
  
  let response = `🔍 Encontrei ${opportunities.length} oportunidade${opportunities.length > 1 ? 's' : ''}`;
  response += area ? ` na área de ${area}` : '';
  response += `:\n\n`;
  
  opportunities.slice(0, 5).forEach((opp, index) => {
    let icon = '⭐';
    const theme = (opp.theme || '').toLowerCase();
    if (theme.includes('education')) icon = '📚';
    else if (theme.includes('health')) icon = '🏥';
    else if (theme.includes('environment') || theme.includes('climate')) icon = '🌱';
    else if (theme.includes('technology')) icon = '💻';
    
    response += `${icon} *${opp.title}*\n`;
    response += `   📍 ${opp.organization}\n`;
    response += `   📍 ${opp.location}\n`;
    response += `   🎯 ${opp.matchScore}% compatível\n`;
    response += `   💡 ${opp.reasoning}\n\n`;
  });
  
  response += `Qual dessas oportunidades mais te interessou? Posso te dar mais detalhes!`;
  
  return response;
}