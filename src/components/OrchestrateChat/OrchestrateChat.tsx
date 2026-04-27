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
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (!user) return;

    initialized.current = true;

    // Suprimir erros específicos do Orchestrate no console
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args[0]?.toString() || '';
      if (message.includes('WxOChat') || 
          message.includes('getUserProfile') || 
          message.includes('401') ||
          message.includes('NoJwtError')) {
        return; // Ignorar
      }
      originalConsoleError(...args);
    };

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
        console.log('✅ Orchestrate Chat inicializado');
        setIsLoading(false);
      }
    };
    
    script.onerror = () => {
      console.error('❌ Erro ao carregar o Orchestrate Chat');
      setIsLoading(false);
    };
    
    document.head.appendChild(script);

    return () => {
      console.error = originalConsoleError;
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
            // Recarregar a página para limpar
            window.location.reload();
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
      
      <div id="orchestrate-chat-root" className={styles.chatWidget} />
    </div>
  );
}