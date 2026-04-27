'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import dynamic from 'next/dynamic';
import styles from './FloatingChatButton.module.css';

// Carregar o chat dinamicamente
const OrchestrateChat = dynamic(
  () => import('./OrchestrateChat'),
  { ssr: false }
);

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      {/* Botão flutuante */}
      <button 
        className={styles.chatButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir assistente"
      >
        <i className="fas fa-comment-dots"></i>
      </button>

      {/* Chat (aparece quando aberto) */}
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <OrchestrateChat 
            agentId={AGENT_ID}
            orchestrationId={ORCHESTRATION_ID}
          />
        </>
      )}
    </>
  );
}