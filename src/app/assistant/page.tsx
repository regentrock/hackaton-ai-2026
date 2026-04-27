'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

const CHAT_URL = "https://dl.watson-orchestrate.ibm.com/chat?agentId=ae187a51-172a-4288-b5fe-fefae23ab71f";

export default function AssistantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user && !redirecting) {
      setRedirecting(true);
      
      // Iniciar contagem regressiva
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Abrir em nova aba
            window.open(CHAT_URL, '_blank', 'noopener,noreferrer');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [user, loading, router, redirecting]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <i className="fas fa-robot"></i>
        </div>
        <h1 className={styles.title}>Assistente VoluntaRe</h1>
        <p className={styles.description}>
          O assistente será aberto em uma nova janela para garantir a melhor experiência.
        </p>
        
        {countdown > 0 ? (
          <div className={styles.countdown}>
            <div className={styles.countdownNumber}>{countdown}</div>
            <p>Abrindo em {countdown} segundo{countdown !== 1 ? 's' : ''}...</p>
          </div>
        ) : (
          <div className={styles.info}>
            <i className="fas fa-external-link-alt"></i>
            <p>Se a janela não abrir automaticamente, 
              <button onClick={() => window.open(CHAT_URL, '_blank')} className={styles.linkButton}>
                clique aqui
              </button>
            </p>
          </div>
        )}

        <button 
          onClick={() => router.back()} 
          className={styles.backButton}
        >
          <i className="fas fa-arrow-left"></i>
          Voltar para o dashboard
        </button>
      </div>
    </div>
  );
}