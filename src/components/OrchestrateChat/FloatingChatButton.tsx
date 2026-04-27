'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import dynamic from 'next/dynamic';
import styles from './FloatingChatButton.module.css';

// Carregar o chat dinamicamente para não afetar o carregamento inicial
const OrchestrateChat = dynamic(
  () => import('./OrchestrateChat'),
  { ssr: false }
);

// Seus IDs (do código que você forneceu)
const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";
const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      <button 
        className={styles.chatButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir assistente"
      >
        <i className="fas fa-comment-dots"></i>
      </button>

      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <OrchestrateChat 
            orchestrationId={ORCHESTRATION_ID}
            agentId={AGENT_ID}
          />
        </>
      )}
    </>
  );
}