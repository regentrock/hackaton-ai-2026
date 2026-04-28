// app/api/orchestrate/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Armazenar conversas por usuário
const conversations = new Map<string, Array<{ role: string, content: string }>>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId, history, sessionId } = await request.json();
    
    console.log(`[WatsonX] Mensagem de ${userId}: "${message}"`);
    
    // Usar histórico enviado ou buscar do armazenamento
    let conversationHistory = history;
    if (!conversationHistory || conversationHistory.length === 0) {
      conversationHistory = conversations.get(userId) || [];
    }
    
    // Adicionar mensagem atual
    conversationHistory.push({ role: 'user', content: message });
    
    // Buscar oportunidades baseado na mensagem
    const area = extractArea(message);
    let opportunities: any[] = [];
    
    if (area) {
      opportunities = await fetchOpportunities(area);
      console.log(`[WatsonX] Encontradas ${opportunities.length} oportunidades para ${area}`);
    } else {
      // Verificar se já tem uma área das mensagens anteriores
      const previousArea = detectAreaFromHistory(conversationHistory);
      if (previousArea) {
        opportunities = await fetchOpportunities(previousArea);
        console.log(`[WatsonX] Usando área anterior: ${previousArea}`);
      } else {
        opportunities = await fetchOpportunities('');
      }
    }
    
    // Construir prompt com contexto
    const prompt = buildPromptWithContext(message, conversationHistory, opportunities, area);
    
    // Chamar IBM WatsonX
    const response = await callWatsonX(prompt);
    
    // Adicionar resposta ao histórico
    conversationHistory.push({ role: 'assistant', content: response });
    
    // Armazenar apenas as últimas 20 mensagens
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    conversations.set(userId, conversationHistory);
    
    return NextResponse.json({
      response: response,
      sessionId: sessionId || userId
    });
    
  } catch (error: any) {
    console.error('[WatsonX] Erro:', error);
    return NextResponse.json({
      response: `Olá! Sou seu assistente de voluntariado. Me diga qual área você tem interesse (Educação, Saúde, Meio Ambiente, Tecnologia ou Social) e vou buscar as melhores oportunidades para você!`
    });
  }
}

function detectAreaFromHistory(history: any[]): string {
  for (const msg of history.slice().reverse()) {
    if (msg.role === 'user') {
      const area = extractArea(msg.content);
      if (area) return area;
    }
  }
  return '';
}

function buildPromptWithContext(message: string, history: any[], opportunities: any[], detectedArea: string): string {
  // Construir histórico formatado
  const formattedHistory = history.slice(-6).map(msg => {
    const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
    return `${role}: ${msg.content}`;
  }).join('\n');
  
  const oppsText = opportunities.length > 0 
    ? `OPORTUNIDADES DISPONÍVEIS:\n${opportunities.slice(0, 5).map((opp, i) => 
        `${i+1}. ${opp.title} - ${opp.organization} (${opp.location}) - Compatibilidade: ${opp.matchScore}%\n   ${opp.reasoning}`
      ).join('\n\n')}`
    : 'Nenhuma oportunidade específica encontrada para esta área.';
  
  const areaText = detectedArea ? `Área de interesse: ${detectedArea}` : 'Área ainda não especificada.';
  
  return `[INST] Você é o VolunteerMatcher, um assistente especializado em voluntariado.

REGRAS:
1. Responda em português (PT-BR)
2. Seja educado e encorajador
3. Use emojis com moderação (📚🏥🌱💻🤝)
4. Se o usuário pedir oportunidades, use a lista abaixo
5. Mantenha respostas concisas (máximo 4 frases)
6. SEMPRE ofereça ajuda adicional

HISTÓRICO DA CONVERSA:
${formattedHistory}

${areaText}
${opportunities.length > 0 ? `\n${oppsText}` : ''}

PERGUNTA ATUAL: ${message}

Responda de forma natural e útil, considerando o histórico da conversa. Se o usuário ainda não especificou uma área, pergunte qual ele tem interesse.

SUA RESPOSTA:[/INST]`;
}

async function callWatsonX(prompt: string): Promise<string> {
  const token = await getIBMToken();
  const projectId = process.env.IBM_PROJECT_ID;
  const url = `${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      input: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.1
      },
      model_id: 'ibm/granite-3-8b-instruct',
      project_id: projectId
    })
  });
  
  if (!response.ok) {
    throw new Error(`WatsonX API error: ${response.status}`);
  }
  
  const data = await response.json();
  let generatedText = data.results?.[0]?.generated_text || '';
  
  generatedText = generatedText.trim();
  if (generatedText.includes('SUA RESPOSTA:')) {
    generatedText = generatedText.split('SUA RESPOSTA:')[1].trim();
  }
  if (generatedText.includes('[/INST]')) {
    generatedText = generatedText.split('[/INST]')[1].trim();
  }
  
  return generatedText;
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
  
  const data = await response.json();
  return data.access_token;
}

function extractArea(message: string): string {
  const msg = message.toLowerCase();
  
  if (msg.includes('educação') || msg.includes('education') || msg.includes('ensino') || msg.includes('escola')) {
    return 'Educação';
  }
  if (msg.includes('saúde') || msg.includes('saude') || msg.includes('health') || msg.includes('hospital')) {
    return 'Saúde';
  }
  if (msg.includes('ambiente') || msg.includes('environment') || msg.includes('ecologia')) {
    return 'Meio Ambiente';
  }
  if (msg.includes('tecnologia') || msg.includes('technology') || msg.includes('tech')) {
    return 'Tecnologia';
  }
  if (msg.includes('social') || msg.includes('community') || msg.includes('comunidade')) {
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