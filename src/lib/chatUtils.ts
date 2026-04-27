// lib/chatUtils.ts
export const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
export const CHAT_URL = `https://dl.watson-orchestrate.ibm.com/chat?agentId=${AGENT_ID}`;

export const openChat = () => {
  window.open(CHAT_URL, '_blank', 'noopener,noreferrer');
};