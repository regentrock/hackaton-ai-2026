'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './FloatingChatButton.module.css';

const ORCHESTRATE_URL = "https://dl.watson-orchestrate.ibm.com/chat?agentId=ae187a51-172a-4288-b5fe-fefae23ab71f";

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  const openOrchestrate = () => {
    window.open(ORCHESTRATE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button 
        className={styles.chatButton}
        onClick={openOrchestrate}
        aria-label="Abrir assistente"
      >
        <i className="fas fa-comment-dots"></i>
      </button>
    </>
  );
}