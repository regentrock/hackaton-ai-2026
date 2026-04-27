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

const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID || "ae187a51-172a-4288-b5fe-fefae23ab71f";
const ORCHESTRATION_ID = process.env.NEXT_PUBLIC_ORCHESTRATION_ID || "20260423-1400-2730-305f-ec6ede7a1a7a_20260423-1400-4202-20dc-0f3e2d98827b";

export default function OrchestrateChat({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    const loadChat = async () => {
      try {
        // Obter token IBM usando sua API Key
        const tokenRes = await fetch('/api/ibm/token');
        const tokenData = await tokenRes.json();
        
        if (!tokenData.success) {
          throw new Error('Não foi possível obter autenticação IBM');
        }

        // Configurar o Orchestrate com o token
        window.wxOConfiguration = {
          orchestrationID: ORCHESTRATION_ID,
          hostURL: "https://dl.watson-orchestrate.ibm.com",
          rootElementID: containerRef.current?.id,
          chatOptions: {
            agentId: AGENT_ID,
            authToken: tokenData.token,
            userContext: {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              userSkills: user.skills || [],
              userLocation: user.location || '',
            }
          }
        };

        const script = document.createElement('script');
        script.src = `https://dl.watson-orchestrate.ibm.com/wxochat/wxoLoader.js?embed=true`;
        script.onload = () => {
          if (window.wxoLoader) {
            window.wxoLoader.init();
            setIsLoading(false);
          }
        };
        script.onerror = () => setError('Erro ao carregar o assistente');
        document.head.appendChild(script);
        
      } catch (err) {
        console.error(err);
        setError('Erro ao autenticar com IBM. Tente novamente.');
        setIsLoading(false);
      }
    };

    loadChat();
  }, [user]);

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
        <button onClick={onClose} className={styles.closeButton}>
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div id="orchestrate-chat-root" ref={containerRef} className={styles.chatRoot} />
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner}></div>
          <p>Autenticando com IBM Cloud...</p>
        </div>
      )}
      {error && (
        <div className={styles.errorOverlay}>
          <i className="fas fa-exclamation-circle"></i>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      )}
    </div>
  );
}