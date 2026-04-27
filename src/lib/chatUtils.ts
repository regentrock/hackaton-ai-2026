// lib/chatUtils.ts
export const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
export const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

export const getChatUrl = (user: any) => {
  // Parâmetros OBRIGATÓRIOS para carregar o agente correto
  const params = new URLSearchParams({
    agentId: AGENT_ID,
    orchestrationId: ORCHESTRATION_ID,
  });
  
  // Adicionar contexto do usuário (opcional mas recomendado)
  if (user) {
    const userContext = {
      userId: user.id,
      name: user.name,
      email: user.email,
      skills: user.skills || [],
      location: user.location || ''
    };
    params.append('context', JSON.stringify(userContext));
  }
  
  return `https://dl.watson-orchestrate.ibm.com/chat?${params.toString()}`;
};

export const openChat = (user: any) => {
  const chatUrl = getChatUrl(user);
  console.log('[Chat] Abrindo URL:', chatUrl); // Para debug
  window.open(chatUrl, '_blank', 'noopener,noreferrer');
};