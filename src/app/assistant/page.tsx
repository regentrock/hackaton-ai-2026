'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './assistant.module.css';

declare global {
  interface Window {
    wxOConfiguration: any;
    wxoLoader: any;
  }
}

const AGENT_ID = "ae187a51-172a-4288-b5fe-fefae23ab71f";
const ORCHESTRATION_ID = "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

export default function AssistantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user && !initialized.current) {
      initialized.current = true;
      loadOrchestrateChat();
    }
  }, [user, loading, router]);

  const loadOrchestrateChat = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Tentar obter um token IAM
      let iamToken = null;
      try {
        const tokenRes = await fetch('/api/orchestrate/token', {
          method: 'POST',
          credentials: 'include',
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          iamToken = tokenData.token;
        }
      } catch (err) {
        console.warn('Não foi possível obter token IAM');
      }

      // Configuração do Orchestrate
      window.wxOConfiguration = {
        orchestrationID: ORCHESTRATION_ID,
        hostURL: "https://dl.watson-orchestrate.ibm.com",
        rootElementID: "orchestrate-chat-root",
        chatOptions: {
          agentId: AGENT_ID,
          // Tentar usar token se disponível
          ...(iamToken && { authToken: iamToken }),
          userContext: {
            userId: user?.id,
            userName: user?.name,
            userEmail: user?.email,
            userSkills: user?.skills || [],
            userLocation: user?.location || '',
          }
        }
      };

      // Carregar script
      const script = document.createElement('script');
      script.src = `https://dl.watson-orchestrate.ibm.com/wxochat/wxoLoader.js?embed=true`;
      script.async = true;
      
      script.onload = () => {
        if (window.wxoLoader) {
          window.wxoLoader.init();
          console.log('✅ Orchestrate Chat inicializado');
          setIsLoading(false);
        }
      };
      
      script.onerror = () => {
        setError('Erro ao carregar o assistente. Tente recarregar a página.');
        setIsLoading(false);
      };
      
      document.head.appendChild(script);

    } catch (err) {
      console.error('Erro:', err);
      setError('Erro ao iniciar o assistente');
      setIsLoading(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Carregando assistente...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <i className="fas fa-arrow-left"></i> Voltar
        </button>
        <h1 className={styles.title}>Assistente VoluntaRe</h1>
        <p className={styles.subtitle}>Converse com nosso agente inteligente</p>
      </div>

      {error && (
        <div className={styles.errorContainer}>
          <i className="fas fa-exclamation-triangle"></i>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      )}

      <div id="orchestrate-chat-root" className={styles.chatContainer}></div>
    </div>
  );
}