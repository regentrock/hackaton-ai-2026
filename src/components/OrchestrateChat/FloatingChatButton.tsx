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

const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";
const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";

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
        aria-label="Abrir chat"
      >
        <i className="fas fa-comment-dots"></i>
      </button>

      {/* Chat */}
      {isOpen && (
        <div className={styles.chatWrapper}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderInfo}>
              <i className="fas fa-robot"></i>
              <div>
                <h3>Assistente VoluntaRe</h3>
                <p>Baseado nas suas habilidades</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className={styles.closeButton}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <OrchestrateChat 
            agentId={AGENT_ID}
            orchestrationId={ORCHESTRATION_ID}
          />
        </div>
      )}
    </>
  );
}