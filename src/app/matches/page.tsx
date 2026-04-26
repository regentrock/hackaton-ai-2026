'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css'; 
import '@fortawesome/fontawesome-free/css/all.min.css';

interface Match {
  id: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  skills: string[];
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  projectLink?: string;
  theme?: string;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingAI, setUsingAI] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchMatches();
    }
  }, [user, authLoading]);

  async function fetchMatches() {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Fetching matches from API...');
      
      const res = await fetch('/api/match', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      
      console.log('📊 Matches received:', data);
      console.log('🤖 Using AI:', data.usingAI);
      console.log('📈 Total matches:', data.matches?.length);
      
      if (data.success) {
        setMatches(data.matches || []);
        setUsingAI(data.usingAI || false);
      } else {
        setMatches(data.matches || []);
      }
      
    } catch (err: any) {
      console.error('❌ Error fetching matches:', err);
      setError(err.message || 'Erro ao carregar oportunidades');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOpportunity(match: Match) {
    if (savingId === match.id) return;
    
    setSavingId(match.id);
    
    try {
      const res = await fetch('/api/user/saved', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opportunityId: match.id,
          title: match.title,
          organization: match.organization,
          location: match.location,
          description: match.description,
          skills: match.skills,
          theme: match.theme,
          matchScore: match.matchScore,
          projectLink: match.projectLink
        })
      });

      const data = await res.json();
      
      if (data.success) {
        // Feedback visual - mudar cor do botão temporariamente
        const button = document.getElementById(`save-btn-${match.id}`);
        if (button) {
          button.innerHTML = '<i class="fas fa-check"></i> Salvo!';
          button.classList.add(styles.saved);
          setTimeout(() => {
            button.innerHTML = '<i class="fas fa-heart"></i> Tenho interesse';
            button.classList.remove(styles.saved);
          }, 2000);
        }
        console.log('✅ Oportunidade salva com sucesso');
      } else {
        alert('Erro ao salvar: ' + (data.error || 'Tente novamente'));
      }
    } catch (error) {
      console.error('❌ Error saving opportunity:', error);
      alert('Erro ao salvar oportunidade. Tente novamente.');
    } finally {
      setSavingId(null);
    }
  }

  const getFilteredMatches = () => {
    if (activeFilter === 'all') return matches;
    return matches.filter(m => m.priority === activeFilter);
  };

  const filteredMatches = getFilteredMatches();
  const highCount = matches.filter(m => m.priority === 'high').length;
  const mediumCount = matches.filter(m => m.priority === 'medium').length;
  const lowCount = matches.filter(m => m.priority === 'low').length;

  if (authLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Analisando oportunidades com IA WatsonX...</p>
        <p className={styles.subLoading}>Isso pode levar alguns segundos</p>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorCard}>
          <i className="fas fa-exclamation-triangle"></i>
          <h2>Erro ao carregar</h2>
          <p>{error}</p>
          <button onClick={fetchMatches} className={styles.retryButton}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.eyebrow}>Oportunidades para você</div>
            <h1 className={styles.title}>
              Seu painel de matches
              <span className={styles.titleHighlight}>baseado no seu perfil e habilidades</span>
            </h1>
            <p className={styles.subtitle}>
              Nossa IA analisou seu perfil e selecionou as melhores oportunidades com base nas suas competências.
            </p>
          </div>
          {usingAI && (
            <div className={styles.aiBadge}>
              <i className="fas fa-brain"></i>
              <span>Match por IA WatsonX</span>
            </div>
          )}
        </div>

        {/* User Skills */}
        {user.skills && user.skills.length > 0 && (
          <div className={styles.skillsSection}>
            <div className={styles.skillsHeader}>
              <i className="fas fa-code"></i>
              <span>Suas habilidades</span>
            </div>
            <div className={styles.skillsDivider}></div>
            <div className={styles.skillsList}>
              {user.skills.map((skill: string, i: number) => (
                <span key={i} className={styles.skillTag}>{skill}</span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Row */}
        {matches.length > 0 && (
          <div className={styles.statsRow}>
            {highCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.high}`}></span>
                <strong>{highCount}</strong>
                <span>alta compatibilidade</span>
              </div>
            )}
            {mediumCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.medium}`}></span>
                <strong>{mediumCount}</strong>
                <span>compatibilidade média</span>
              </div>
            )}
            {lowCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.low}`}></span>
                <strong>{lowCount}</strong>
                <span>em desenvolvimento</span>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        {matches.length > 0 && (
          <div className={styles.filtersBar}>
            <button 
              onClick={() => setActiveFilter('all')}
              className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.active : ''}`}
            >
              Todos
              <span className={styles.filterCount}>{matches.length}</span>
            </button>
            {highCount > 0 && (
              <button 
                onClick={() => setActiveFilter('high')}
                className={`${styles.filterBtn} ${activeFilter === 'high' ? styles.active : ''}`}
              >
                <i className="fas fa-star"></i>
                Alta compatibilidade
                <span className={styles.filterCount}>{highCount}</span>
              </button>
            )}
            {mediumCount > 0 && (
              <button 
                onClick={() => setActiveFilter('medium')}
                className={`${styles.filterBtn} ${activeFilter === 'medium' ? styles.active : ''}`}
              >
                <i className="fas fa-chart-line"></i>
                Média compatibilidade
                <span className={styles.filterCount}>{mediumCount}</span>
              </button>
            )}
            {lowCount > 0 && (
              <button 
                onClick={() => setActiveFilter('low')}
                className={`${styles.filterBtn} ${activeFilter === 'low' ? styles.active : ''}`}
              >
                <i className="fas fa-graduation-cap"></i>
                Desenvolvimento
                <span className={styles.filterCount}>{lowCount}</span>
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {filteredMatches.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <i className="fas fa-search"></i>
            </div>
            <h3>Nenhuma oportunidade encontrada</h3>
            <p>Tente ajustar seus filtros ou adicionar mais habilidades ao seu perfil</p>
            <button onClick={() => router.push('/dashboard')} className={styles.updateProfileBtn}>
              Atualizar perfil
            </button>
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {filteredMatches.map((match) => (
              <div key={match.id} className={`${styles.matchCard} ${styles[match.priority]}`}>
                
                {/* Priority stripe */}
                <div className={styles.cardStripe}></div>

                <div className={styles.cardInner}>
                  {/* Header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardHeaderLeft}>
                      <div className={styles.organizationIcon}>
                        <i className="fas fa-building"></i>
                      </div>
                      <div className={styles.cardTitleGroup}>
                        <h3 className={styles.cardTitle}>{match.title}</h3>
                        <p className={styles.organization}>{match.organization}</p>
                      </div>
                    </div>
                    <div className={`${styles.scoreBadge} ${styles[getScoreClass(match.matchScore)]}`}>
                      <span className={styles.scoreValue}>{match.matchScore}%</span>
                      <span className={styles.scoreLabel}>match</span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <i className="fas fa-map-marker-alt"></i>
                      {match.location}
                    </span>
                    {match.theme && (
                      <span className={styles.metaItem}>
                        <i className="fas fa-tag"></i>
                        {match.theme}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className={styles.cardDescription}>{match.description?.substring(0, 120)}...</p>

                  {/* Matched Skills */}
                  {match.matchedSkills && match.matchedSkills.length > 0 && (
                    <div className={styles.sectionBlock}>
                      <div className={styles.sectionTitle}>
                        <i className="fas fa-check-circle"></i>
                        <span>Habilidades que combinam</span>
                      </div>
                      <div className={styles.skillsGroup}>
                        {match.matchedSkills.map((skill, i) => (
                          <span key={i} className={`${styles.skill} ${styles.skillMatch}`}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Skills */}
                  {match.missingSkills && match.missingSkills.length > 0 && (
                    <div className={styles.sectionBlock}>
                      <div className={styles.sectionTitle}>
                        <i className="fas fa-lightbulb"></i>
                        <span>Habilidades para desenvolver</span>
                      </div>
                      <div className={styles.skillsGroup}>
                        {match.missingSkills.slice(0, 3).map((skill, i) => (
                          <span key={i} className={`${styles.skill} ${styles.skillMissing}`}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div className={styles.reasoningBlock}>
                    <i className="fas fa-quote-left"></i>
                    <p>{match.reasoning}</p>
                  </div>

                  {/* Recommendation */}
                  <div className={styles.recommendationBlock}>
                    <i className="fas fa-gem"></i>
                    <div>
                      <strong>Recomendação</strong>
                      <p>{match.recommendation}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className={styles.actionButtons}>
                    <button 
                      id={`save-btn-${match.id}`}
                      onClick={() => handleSaveOpportunity(match)}
                      disabled={savingId === match.id}
                      className={styles.interestButton}
                    >
                      <i className="fas fa-heart"></i>
                      {savingId === match.id ? 'Salvando...' : 'Tenho interesse'}
                    </button>
                    <button 
                      onClick={() => router.push(`/matches/${match.id}`)}
                      className={styles.detailsButton}
                    >
                      <i className="fas fa-arrow-right"></i>
                      Mais detalhes
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function getScoreClass(score: number): string {
  if (score >= 75) return 'scoreHigh';
  if (score >= 50) return 'scoreMedium';
  if (score >= 25) return 'scoreLow';
  return 'scoreVeryLow';
}