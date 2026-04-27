// components/OrchestrateChat/FloatingChatButton.tsx
'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import { openChat } from '@/src/lib/chatUtils';
import styles from './FloatingChatButton.module.css';

export default function FloatingChatButton() {
  const { user } = useAuth();

  if (!user) return null;

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