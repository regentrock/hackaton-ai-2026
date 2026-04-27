// components/OrchestrateChat/FloatingChatButton.tsx
'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import styles from './FloatingChatButton.module.css';

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
const CHAT_URL = `https://dl.watson-orchestrate.ibm.com/chat?agentId=${AGENT_ID}`;

export default function FloatingChatButton() {
  const { user } = useAuth();

  if (!user) return null;

  const openChat = () => {
    window.open(CHAT_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <button 
      className={styles.chatButton}
      onClick={openChat}
      aria-label="Abrir assistente IBM watsonx"
    >
      <i className="fas fa-comment-dots"></i>
      <span className={styles.tooltip}>Assistente IBM watsonx</span>
    </button>
  );
}