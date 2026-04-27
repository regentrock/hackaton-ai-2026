'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './FloatingChatButton.module.css';

export default function FloatingChatButton() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <button 
      className={styles.chatButton}
      onClick={() => router.push('/assistant')}
      aria-label="Abrir assistente"
    >
      <i className="fas fa-comment-dots"></i>
      <span className={styles.tooltip}>Assistente IA</span>
    </button>
  );
}