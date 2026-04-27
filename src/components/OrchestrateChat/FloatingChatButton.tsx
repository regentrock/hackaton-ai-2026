// components/OrchestrateChat/FloatingChatButton.tsx
'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import CustomChat from '@/src/components/CustomChat/CustomChat';
import styles from './FloatingChatButton.module.css';

export default function FloatingChatButton() {
  const { user } = useAuth();

  if (!user) return null;

  return <CustomChat />;
}