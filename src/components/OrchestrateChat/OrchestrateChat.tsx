'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './OrchestrateChat.module.css';

declare global {
  interface Window {
    wxOConfiguration: any;
    wxoLoader: any;
  }
}

interface OrchestrateChatProps {
  orchestrationId: string;
  agentId: string;
  hostURL?: string;
}

export default function OrchestrateChat({ 
  orchestrationId, 
  agentId, 
  hostURL = "https://dl.watson-orchestrate.ibm.com" 
}: OrchestrateChatProps) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // Limpar configuração anterior
    if (initialized.current) return;
    if (!user) return;

    initialized.current = true;
    setIsLoading(true);

    // Configurar o Orchestrate
    window.wxOConfiguration = {
      orchestrationID: orchestrationId,
      hostURL: hostURL,
      rootElementID: "orchestrate-chat-root",
      chatOptions: {
        agentId: agentId,
        userContext: {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userSkills: user.skills || [],
          userLocation: user.location || '',
          userDescription: user.description || '',
          userAvailability: user.availability || ''
        }
      }
    };

    // Carregar o script do Orchestrate
    const script = document.createElement('script');
    script.src = `${hostURL}/wxochat/wxoLoader.js?embed=true`;
    script.async = true;
    
    script.onload = () => {
      if (window.wxoLoader) {
        window.wxoLoader.init();
        console.log('✅ Orchestrate Chat inicializado com sucesso');
        setIsLoading(false);
      }
    };
    
    script.onerror = () => {
      console.error('❌ Erro ao carregar o Orchestrate Chat');
      setError('Não foi possível carregar o assistente. Tente novamente mais tarde.');
      setIsLoading(false);
    };
    
    document.head.appendChild(script);

    // Cleanup
    return () => {
      if (window.wxoLoader && window.wxoLoader.destroy) {
        window.wxoLoader.destroy();
      }
    };
  }, [orchestrationId, agentId, hostURL, user]);

  if (!user) return null;

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
        <button 
          className={styles.closeButton}
          onClick={() => {
            if (window.wxoLoader && window.wxoLoader.destroy) {
              window.wxoLoader.destroy();
            }
          }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner}></div>
          <p>Carregando assistente...</p>
        </div>
      )}
      
      {error && (
        <div className={styles.errorOverlay}>
          <i className="fas fa-exclamation-circle"></i>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      )}
      
      <div id="orchestrate-chat-root" className={styles.chatWidget} />
    </div>
  );
}