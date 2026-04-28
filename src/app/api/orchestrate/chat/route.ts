// app/api/orchestrate/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Armazenar histórico de conversas por usuário
const conversationHistory = new Map<string, Array<{ role: string, content: string }>>();

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId } = await request.json();
    
    console.log(`[WatsonX] Mensagem de ${userId}: "${message}"`);
    
    // Obter histórico do usuário
    let history = conversationHistory.get(userId) || [];
    
    // Adicionar mensagem do usuário ao histórico
    history.push({ role: 'user', content: message });
    
    // Buscar oportunidades relevantes baseado na mensagem
    const area = extractArea(message);
    let opportunities: any[] = [];
    
    if (area) {
      opportunities = await fetchOpportunities(area);
      console.log(`[WatsonX] Encontradas ${opportunities.length} oportunidades para ${area}`);
    } else {
      // Buscar oportunidades gerais se não tiver área específica
      opportunities = await fetchOpportunities('');
    }
    
    // Construir prompt para o WatsonX
    const prompt = buildPrompt(message, history, opportunities, area);
    
    // Chamar IBM WatsonX (Granite)
    const response = await callWatsonX(prompt);
    
    // Adicionar resposta ao histórico
    history.push({ role: 'assistant', content: response });
    
    // Manter apenas as últimas 10 mensagens
    if (history.length > 10) {
      history = history.slice(-10);
    }
    conversationHistory.set(userId, history);
    
    return NextResponse.json({
      response: response,
      sessionId: sessionId || userId
    });
    
  } catch (error: any) {
    console.error('[WatsonX] Erro:', error);
    
    // Fallback
    return NextResponse.json({
      response: `Olá! Sou seu assistente de voluntariado. Me diga qual área você tem interesse (Educação, Saúde, Meio Ambiente, Tecnologia ou Social) e vou buscar as melhores oportunidades para você!`
    });
  }
}

function buildPrompt(message: string, history: any[], opportunities: any[], detectedArea: string): string {
  const oppsText = opportunities.length > 0 
    ? `OPORTUNIDADES DISPONÍVEIS:\n${opportunities.slice(0, 5).map((opp, i) => 
        `${i+1}. ${opp.title} - ${opp.organization} (${opp.location}) - Compatibilidade: ${opp.matchScore}%\n   ${opp.reasoning}`
      ).join('\n\n')}`
    : 'Nenhuma oportunidade específica encontrada para esta área.';
  
  const areaText = detectedArea ? `Área de interesse identificada: ${detectedArea}` : 'Ainda não identifiquei uma área específica.';
  
  return `[INST] Você é o VolunteerMatcher, um assistente especializado em conectar voluntários a oportunidades de voluntariado.

INSTRUÇÕES IMPORTANTES:
1. Seja sempre educado, empático e encorajador
2. Responda em português (PT-BR)
3. Use emojis moderadamente (📚, 🏥, 🌱, 💻, 🤝)
4. Se o usuário pedir oportunidades em uma área, use as oportunidades listadas abaixo
5. Se não houver oportunidades para a área, sugira outras áreas
6. Mantenha as respostas concisas (2-4 frases por vez)
7. Sempre ofereça ajuda adicional

CONTEXTO DA CONVERSA:
${history.slice(-3).map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`).join('\n')}

ÁREA IDENTIFICADA: ${areaText}

${oppsText}

PERGUNTA DO USUÁRIO: ${message}

Responda de forma natural e útil, usando as oportunidades disponíveis se relevante. Se o usuário não especificou uma área, pergunte qual ele tem interesse.

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
        top_k: 50,
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
  
  // Limpar a resposta
  generatedText = generatedText.trim();
  
  // Se a resposta ainda tiver o prompt, remover
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
  if (msg.includes('ambiente') || msg.includes('environment') || msg.includes('ecologia') || msg.includes('sustentabilidade')) {
    return 'Meio Ambiente';
  }
  if (msg.includes('tecnologia') || msg.includes('technology') || msg.includes('tech') || msg.includes('programação')) {
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