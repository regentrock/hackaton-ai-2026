'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './assistant.module.css';

const CHAT_URL = "https://dl.watson-orchestrate.ibm.com/chat?agentId=ae187a51-172a-4288-b5fe-fefae23ab71f";

export default function AssistantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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
      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <i className="fas fa-arrow-left"></i>
          Voltar
        </button>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <i className="fas fa-robot"></i>
          </div>
          <h1 className={styles.title}>Assistente VoluntaRe</h1>
          <p className={styles.description}>
            Converse com nosso assistente inteligente para encontrar oportunidades de voluntariado
          </p>
        </div>
      </div>

      {/* Chat Container */}
      <div className={styles.chatWrapper}>
        {iframeLoading && (
          <div className={styles.iframeLoader}>
            <div className={styles.spinner}></div>
            <p>Conectando ao assistente...</p>
          </div>
        )}
        <iframe
          src={CHAT_URL}
          className={styles.chatIframe}
          title="Assistente VoluntaRe"
          allow="microphone; clipboard-read; clipboard-write"
          onLoad={() => setIframeLoading(false)}
        />
      </div>

      {/* Informações */}
      <div className={styles.info}>
        <p>
          <i className="fas fa-info-circle"></i>
          O assistente pode ajudar você a encontrar oportunidades de voluntariado baseadas nas suas habilidades.
          Diga algo como: "Encontre oportunidades para mim"
        </p>
      </div>
    </div>
  );
}