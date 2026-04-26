'use client';

import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (chatInitialized.current) return;
    if (!user) return;
    
    chatInitialized.current = true;

    // 🔥 CONFIGURAÇÃO COM userContext 🔥
    window.wxOConfiguration = {
      orchestrationID: orchestrationId,
      hostURL: "https://dl.watson-orchestrate.ibm.com",
      rootElementID: "orchestrate-chat-root",
      chatOptions: {
        agentId: agentId,
        // 🔥 AQUI está o userContext 🔥
        userContext: {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userSkills: user.skills || [],
          userLocation: user.location || '',
          userDescription: user.description || '',
          userAvailability: user.availability || ''
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
        console.log('✅ Chat inicializado com userContext:', user.name);
      }
    };
    document.head.appendChild(script);

    return () => {
      if (window.wxoLoader && window.wxoLoader.destroy) {
        window.wxoLoader.destroy();
      }
    };
  }, [orchestrationId, agentId, user]);

  if (!user) return null;

  return (
    <div className={styles.chatContainer}>
      <div id="orchestrate-chat-root" className={styles.chatRoot}></div>
    </div>
  );
}