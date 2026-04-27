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
  agentId: string;
  orchestrationId: string;
}

export default function OrchestrateChat({ agentId, orchestrationId }: OrchestrateChatProps) {
  const { user } = useAuth();
  const chatInitialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chatInitialized.current) return;
    if (!user) return;
    
    chatInitialized.current = true;

    const initChat = async () => {
      try {
        setLoading(true);
        
        // Obter configuração do Orchestrate via proxy
        const proxyRes = await fetch('/api/orchestrate/proxy');
        const config = await proxyRes.json();
        
        if (!config.token) {
          throw new Error('Não foi possível obter token de autenticação');
        }

        console.log('🎯 Inicializando chat do Orchestrate com token IBM...');

        window.wxOConfiguration = {
          orchestrationID: orchestrationId,
          hostURL: "https://dl.watson-orchestrate.ibm.com",
          rootElementID: "orchestrate-chat-root",
          chatOptions: {
            agentId: agentId,
            // 🔥 Usar o token IAM da IBM
            authToken: config.token,
            userContext: {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              userSkills: user.skills || [],
              userLocation: user.location || '',
            },
            initialMessage: `Olá ${user.name}! 👋\n\nSou o assistente de voluntariado da VoluntaRe. Com base nas suas habilidades (${user.skills?.join(', ') || 'nenhuma cadastrada ainda'}), posso ajudar você a encontrar oportunidades de voluntariado ideais para o seu perfil.\n\nO que você gostaria de fazer hoje?`
          }
        };

        const script = document.createElement('script');
        script.src = `${window.wxOConfiguration.hostURL}/wxochat/wxoLoader.js?embed=true`;
        script.async = true;
        script.onload = () => {
          if (window.wxoLoader) {
            window.wxoLoader.init();
            console.log('✅ Chat do Orchestrate inicializado com sucesso');
            setLoading(false);
          }
        };
        script.onerror = () => {
          setError('Erro ao carregar o chat');
          setLoading(false);
        };
        document.head.appendChild(script);

      } catch (err: any) {
        console.error('❌ Erro ao inicializar chat:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initChat();

    return () => {
      if (window.wxoLoader && window.wxoLoader.destroy) {
        window.wxoLoader.destroy();
      }
    };
  }, [orchestrationId, agentId, user]);

  if (!user) return null;

  return (
    <div className={styles.chatContainer}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner}></div>
          <p>Carregando assistente...</p>
        </div>
      )}
      {error && (
        <div className={styles.errorOverlay}>
          <i className="fas fa-exclamation-circle"></i>
          <p>Erro ao carregar chat</p>
          <button onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      )}
      <div id="orchestrate-chat-root" className={styles.chatRoot}></div>
    </div>
  );
}