'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import dynamic from 'next/dynamic';
import styles from './FloatingChatButton.module.css';

const OrchestrateChat = dynamic(() => import('./OrchestrateChat'), { ssr: false });

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      <button className={styles.chatButton} onClick={() => setIsOpen(true)}>
        <i className="fas fa-comment-dots"></i>
      </button>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <OrchestrateChat onClose={() => setIsOpen(false)} />
        </>
      )}
    </>
  );
}