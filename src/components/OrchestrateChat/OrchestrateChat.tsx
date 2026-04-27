'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import styles from './OrchestrateChat.module.css';

interface OrchestrateChatProps {
  agentId: string;
  orchestrationId: string;
}

export default function OrchestrateChat({ agentId, orchestrationId }: OrchestrateChatProps) {
  const { user } = useAuth();

  if (!user) return null;

  // URL do Orchestrate no modo embed
  const chatUrl = `https://dl.watson-orchestrate.ibm.com/chat?agentId=${agentId}&embed=true`;

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div className={styles.chatHeaderInfo}>
          <i className="fas fa-robot"></i>
          <div>
            <h3>Assistente VoluntaRe</h3>
            <p>Baseado nas suas habilidades</p>
          </div>
        </div>
      </div>
      <iframe
        src={chatUrl}
        className={styles.chatIframe}
        title="Assistente VoluntaRe"
        allow="microphone; clipboard-read; clipboard-write"
      />
    </div>
  );
}