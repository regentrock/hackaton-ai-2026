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

  // Função para obter o token via API
  const getAuthToken = async (): Promise<string | null> => {
    try {
      // Tenta pegar do cookie
      const cookies = document.cookie.split(';');
      const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
      if (authCookie) {
        const token = authCookie.split('=')[1];
        console.log('📌 Token obtido do cookie:', token.substring(0, 20) + '...');
        return token;
      }
      
      // Se não tiver no cookie, tenta via fetch
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      if (res.ok) {
        // O token já está no cookie, então deve funcionar
        const newCookies = document.cookie.split(';');
        const newAuthCookie = newCookies.find(c => c.trim().startsWith('auth_token='));
        if (newAuthCookie) {
          const token = newAuthCookie.split('=')[1];
          console.log('📌 Token obtido via API');
          return token;
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao obter token:', error);
      return null;
    }
  };

  useEffect(() => {
    if (chatInitialized.current) return;
    if (!user) return;
    
    chatInitialized.current = true;

    // Inicializar o chat
    const initChat = async () => {
      const authToken = await getAuthToken();
      
      console.log('🎯 Inicializando chat do Orchestrate...');
      console.log('👤 Usuário:', user.name);
      console.log('🔑 Token presente:', !!authToken);

      window.wxOConfiguration = {
        orchestrationID: orchestrationId,
        hostURL: "https://dl.watson-orchestrate.ibm.com",
        rootElementID: "orchestrate-chat-root",
        chatOptions: {
          agentId: agentId,
          // 🔥 Passar o token JWT
          ...(authToken && { authToken: authToken }),
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
          console.log('✅ Chat inicializado com sucesso');
        }
      };
      script.onerror = () => {
        console.error('❌ Erro ao carregar o chat do Orchestrate');
      };
      document.head.appendChild(script);
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
      <div id="orchestrate-chat-root" className={styles.chatRoot}></div>
    </div>
  );
}