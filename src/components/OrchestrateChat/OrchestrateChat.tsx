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

  // Função para obter o token de autenticação
  const getAuthToken = () => {
    // Pegar o token dos cookies (ou de onde você armazena)
    const cookies = document.cookie.split(';');
    const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
    if (authCookie) {
      return authCookie.split('=')[1];
    }
    return null;
  };

  useEffect(() => {
    if (chatInitialized.current) return;
    if (!user) return;
    
    chatInitialized.current = true;

    const authToken = getAuthToken();
    console.log('🎯 Inicializando chat com token:', authToken ? 'Token presente' : 'Sem token');

    // Configurar o chat do Orchestrate COM contexto do usuário
    window.wxOConfiguration = {
      orchestrationID: orchestrationId,
      hostURL: "https://dl.watson-orchestrate.ibm.com",
      rootElementID: "orchestrate-chat-root",
      chatOptions: {
        agentId: agentId,
        // 🔥 Adicionar token de autenticação 🔥
        authToken: authToken || undefined,
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
    script.onerror = () => {
      console.error('❌ Erro ao carregar o chat do Orchestrate');
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