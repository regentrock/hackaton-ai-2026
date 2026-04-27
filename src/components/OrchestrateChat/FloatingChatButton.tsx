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

const ORCHESTRATION_ID = process.env.NEXT_PUBLIC_ORCHESTRATION_ID || "";
const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID || "";

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      {/* Botão flutuante */}
      <button 
        className={styles.chatButton}
        onClick={() => setIsOpen(true)}
        aria-label="Abrir assistente"
      >
        <i className="fas fa-comment-dots"></i>
        <span className={styles.tooltip}>Assistente IA</span>
      </button>

      {/* Modal do Chat */}
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <OrchestrateChat 
            orchestrationId={ORCHESTRATION_ID}
            agentId={AGENT_ID}
            onClose={() => setIsOpen(false)}
          />
        </>
      )}
    </>
  );
}