// components/OrchestrateChat/FloatingChatButton.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './FloatingChatButton.module.css';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
}

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [orchestrationId, setOrchestrationId] = useState<string | null>(null);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inicializar sessão do Orchestrate
  useEffect(() => {
    if (isOpen && !sessionId && user) {
      initializeOrchestrateSession();
    }
  }, [isOpen, user, sessionId]);

  // Rolar para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function initializeOrchestrateSession() {
    try {
      console.log('🚀 Inicializando sessão do Orchestrate...');
      
      const response = await fetch('/api/orchestrate/session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          userName: user?.name,
          userSkills: user?.skills || []
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(data.sessionId);
        setOrchestrationId(data.orchestrationId);
        
        // Adicionar mensagem de boas-vinda
        const welcomeMessage: Message = {
          id: Date.now().toString(),
          text: `Olá ${user?.name?.split(' ')[0] || 'Voluntário'}! Sou seu assistente de voluntariado. Posso ajudar você a encontrar oportunidades na área de educação, saúde, meio ambiente, tecnologia ou social. Como posso ajudar hoje?`,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages([welcomeMessage]);
        
        console.log('✅ Sessão do Orchestrate iniciada');
      } else {
        console.error('❌ Falha ao iniciar sessão do Orchestrate');
        showOfflineMessage();
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar sessão:', error);
      showOfflineMessage();
    }
  }

  function showOfflineMessage() {
    const offlineMessage: Message = {
      id: Date.now().toString(),
      text: 'Estou conectado e pronto para ajudar! Por favor, digite sua mensagem sobre oportunidades de voluntariado e te ajudarei a encontrar as melhores opções.',
      sender: 'bot',
      timestamp: new Date()
    };
    setMessages([offlineMessage]);
  }

  async function handleSendMessage() {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    // Adicionar mensagem de loading
    const loadingMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: loadingMessageId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
      isLoading: true
    }]);
    
    try {
      let response;
      
      // Se tem sessão do Orchestrate, usar a IBM
      if (sessionId && orchestrationId) {
        response = await fetch('/api/orchestrate/chat', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: inputValue,
            sessionId: sessionId,
            orchestrationId: orchestrationId,
            userId: user?.id,
            userSkills: user?.skills || [],
            userDescription: user?.description || ''
          })
        });
      } else {
        // Fallback: usar API local de matching
        response = await fetch('/api/chat/matches', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: inputValue,
            userId: user?.id
          })
        });
      }
      
      // Remover mensagem de loading
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));
      
      if (response.ok) {
        const data = await response.json();
        
        const botMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: data.response || data.message,
          sender: 'bot',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, botMessage]);
        
        // Se tiver oportunidades, sugerir visualização
        if (data.opportunities && data.opportunities.length > 0) {
          const suggestionMessage: Message = {
            id: (Date.now() + 3).toString(),
            text: `Encontrei ${data.opportunities.length} oportunidades. Acesse a página de oportunidades para ver todos os detalhes.`,
            sender: 'bot',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, suggestionMessage]);
        }
      } else {
        throw new Error('Falha na comunicação');
      }
      
    } catch (error) {
      console.error('Erro no chat:', error);
      
      // Remover mensagem de loading
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));
      
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        text: 'Desculpe, estou com dificuldade técnica no momento. Por favor, tente novamente em alguns instantes ou acesse diretamente a página de oportunidades.',
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={styles.chatButton}
        aria-label="Abrir chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor"/>
          <circle cx="8" cy="10" r="1.5" fill="white"/>
          <circle cx="12" cy="10" r="1.5" fill="white"/>
          <circle cx="16" cy="10" r="1.5" fill="white"/>
        </svg>
      </button>
    );
  }

  return (
    <div className={styles.chatWindow}>
      <div className={styles.chatHeader}>
        <div className={styles.chatHeaderInfo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor"/>
            <path d="M12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="white"/>
          </svg>
          <span>Assistente de Voluntariado</span>
        </div>
        <button onClick={() => setIsOpen(false)} className={styles.closeButton} aria-label="Fechar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      
      <div className={styles.chatMessages}>
        {messages.length === 0 ? (
          <div className={styles.welcomeMessage}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#b02629" opacity="0.8"/>
              <circle cx="8" cy="10" r="1.5" fill="white"/>
              <circle cx="12" cy="10" r="1.5" fill="white"/>
              <circle cx="16" cy="10" r="1.5" fill="white"/>
            </svg>
            <p>Olá! Sou seu assistente de voluntariado.</p>
            <p>Posso ajudar você a encontrar oportunidades nas áreas:</p>
            <ul>
              <li>Educação</li>
              <li>Saúde</li>
              <li>Meio Ambiente</li>
              <li>Tecnologia</li>
              <li>Social</li>
            </ul>
            <p>Como posso ajudar você hoje?</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.sender === 'user' ? styles.userMessage : styles.botMessage}`}
            >
              {msg.sender === 'bot' && !msg.isLoading && (
                <div className={styles.botAvatar}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor"/>
                    <path d="M12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="white"/>
                  </svg>
                </div>
              )}
              <div className={styles.messageContent}>
                {msg.isLoading ? (
                  <div className={styles.typingIndicator}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                ) : (
                  <>
                    <p>{msg.text}</p>
                    <span className={styles.messageTime}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
              {msg.sender === 'user' && (
                <div className={styles.userAvatar}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                  </svg>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className={styles.chatInput}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Digite sua mensagem..."
          disabled={isLoading}
        />
        <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
  );
}