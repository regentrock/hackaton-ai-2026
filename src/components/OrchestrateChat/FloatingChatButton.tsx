// components/OrchestrateChat/FloatingChatButton.tsx - VERIFIQUE ESTE ARQUIVO
// Ou o arquivo que contém a lógica do chat da IBM

'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './FloatingChatButton.module.css';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Carregar oportunidades ao iniciar
  useEffect(() => {
    if (user) {
      fetchOpportunities();
    }
  }, [user]);
  
  async function fetchOpportunities() {
    try {
      const response = await fetch('/api/match', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data.matches || []);
        console.log(`📦 ${opportunities.length} oportunidades carregadas para o chat`);
      }
    } catch (error) {
      console.error('Erro ao carregar oportunidades:', error);
    }
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
    
    try {
      // 🔥 CORREÇÃO: Buscar oportunidades da API local
      let opportunitiesData = opportunities;
      
      // Se não tem oportunidades em cache, buscar agora
      if (opportunitiesData.length === 0) {
        const response = await fetch('/api/match', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          opportunitiesData = data.matches || [];
          setOpportunities(opportunitiesData);
        }
      }
      
      // Filtrar oportunidades baseado na pergunta do usuário
      const userQuery = inputValue.toLowerCase();
      let relevantOpportunities = opportunitiesData;
      
      // Se o usuário pediu por área específica
      if (userQuery.includes('educação') || userQuery.includes('ensino') || userQuery.includes('escola')) {
        relevantOpportunities = opportunitiesData.filter(opp => 
          opp.theme?.toLowerCase().includes('educação') ||
          opp.title?.toLowerCase().includes('educação') ||
          opp.title?.toLowerCase().includes('escola') ||
          opp.title?.toLowerCase().includes('ensino')
        );
      } else if (userQuery.includes('saúde') || userQuery.includes('hospital')) {
        relevantOpportunities = opportunitiesData.filter(opp => 
          opp.theme?.toLowerCase().includes('saúde') ||
          opp.title?.toLowerCase().includes('saúde') ||
          opp.title?.toLowerCase().includes('hospital')
        );
      } else if (userQuery.includes('ambiente') || userQuery.includes('ecologia')) {
        relevantOpportunities = opportunitiesData.filter(opp => 
          opp.theme?.toLowerCase().includes('ambiente') ||
          opp.title?.toLowerCase().includes('ambiente') ||
          opp.title?.toLowerCase().includes('ecologia')
        );
      }
      
      // Gerar resposta
      let botResponse = '';
      
      if (relevantOpportunities.length > 0) {
        const topOpportunities = relevantOpportunities.slice(0, 5);
        botResponse = `Encontrei ${relevantOpportunities.length} oportunidades de voluntariado! Aqui estão algumas sugestões:\n\n`;
        
        topOpportunities.forEach((opp, index) => {
          botResponse += `${index + 1}. **${opp.title}**\n`;
          botResponse += `   📍 ${opp.location}\n`;
          botResponse += `   🏷️ ${opp.theme || 'Voluntariado'}\n`;
          botResponse += `   📊 Compatibilidade: ${opp.matchScore}%\n`;
          botResponse += `   💡 ${opp.reasoning?.substring(0, 100)}...\n\n`;
        });
        
        botResponse += `Quer saber mais sobre alguma dessas oportunidades? Posso te ajudar com mais detalhes!`;
      } else {
        // Se não encontrou oportunidades específicas, mostrar as melhores no geral
        const topGeneral = opportunitiesData.slice(0, 5);
        
        if (topGeneral.length > 0) {
          botResponse = `Com base no seu perfil, encontrei estas oportunidades que podem te interessar:\n\n`;
          
          topGeneral.forEach((opp, index) => {
            botResponse += `${index + 1}. **${opp.title}**\n`;
            botResponse += `   📍 ${opp.location}\n`;
            botResponse += `   📊 Compatibilidade: ${opp.matchScore}%\n\n`;
          });
          
          botResponse += `Posso filtrar por área específica (educação, saúde, ambiente) se você preferir!`;
        } else {
          botResponse = `No momento não encontrei oportunidades específicas para "${inputValue}". Que tal atualizar seu perfil com mais habilidades? Ou posso sugerir algumas vagas gerais para você começar!`;
        }
      }
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: botResponse,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);
      
    } catch (error) {
      console.error('Erro no chat:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Desculpe, estou com dificuldade técnica no momento. Por favor, tente novamente em alguns instantes ou acesse diretamente a página de oportunidades para ver as vagas disponíveis.`,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }
  
  // Rolar para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  return (
    <>
      {/* Botão flutuante */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={styles.chatButton}
        >
          <i className="fas fa-comment-dots"></i>
        </button>
      )}
      
      {/* Janela do chat */}
      {isOpen && (
        <div className={styles.chatWindow}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderInfo}>
              <i className="fas fa-robot"></i>
              <span>Assistente de Voluntariado</span>
            </div>
            <button onClick={() => setIsOpen(false)} className={styles.closeButton}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <div className={styles.chatMessages}>
            {messages.length === 0 && (
              <div className={styles.welcomeMessage}>
                <i className="fas fa-hand-wave"></i>
                <p>Olá! 👋 Sou seu assistente de voluntariado.</p>
                <p>Posso ajudar você a encontrar oportunidades na área de:</p>
                <ul>
                  <li>🎓 Educação</li>
                  <li>🏥 Saúde</li>
                  <li>🌱 Meio Ambiente</li>
                  <li>🤝 Social</li>
                  <li>💻 Tecnologia</li>
                </ul>
                <p>Me diga o que você procura!</p>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${msg.sender === 'user' ? styles.userMessage : styles.botMessage}`}
              >
                {msg.sender === 'bot' && <i className="fas fa-robot"></i>}
                <div className={styles.messageContent}>
                  <p>{msg.text}</p>
                  <span className={styles.messageTime}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {msg.sender === 'user' && <i className="fas fa-user"></i>}
              </div>
            ))}
            
            {isLoading && (
              <div className={styles.typingIndicator}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          <div className={styles.chatInput}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Digite sua mensagem..."
              disabled={isLoading}
            />
            <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}