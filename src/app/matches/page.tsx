// page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import FloatingChatButton from '@/src/components/OrchestrateChat/FloatingChatButton';

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

interface SavedOpportunity {
  id: string;
  opportunityId: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  skills: string[];
  theme: string | null;
  matchScore: number | null;
  savedAt: string;
  notes: string | null;
}

export default function MatchesPage() {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [topMatches, setTopMatches] = useState<Match[]>([]);
  const [moreMatches, setMoreMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [moreFilter, setMoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedOpportunities, setSavedOpportunities] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(8);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchMatches();
      fetchSavedOpportunities();
    }
  }, [user, authLoading]);

  async function fetchSavedOpportunities() {
    try {
      const res = await fetch('/api/user/saved', {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        const savedData: SavedOpportunity[] = data.saved || [];
        const savedIds = new Set(savedData.map((item: SavedOpportunity) => item.opportunityId));
        setSavedOpportunities(savedIds);
      }
    } catch (error) {
      console.error('Erro ao buscar oportunidades salvas:', error);
    }
  }

  async function fetchMatches() {
    try {
      setLoading(true);
      setError(null);
      
      const res = await fetch('/api/match', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        const matches = data.matches || [];
        const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);
        
        console.log('Matches com scores:', sortedMatches.map(m => ({ title: m.title.substring(0, 30), score: m.matchScore })));
        
        setAllMatches(sortedMatches);
        setTopMatches(sortedMatches.slice(0, 6));
        setMoreMatches(sortedMatches.slice(6));
      }
      
    } catch (err: any) {
      console.error('Error fetching matches:', err);
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
        headers: { 'Content-Type': 'application/json' },
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
        setSavedOpportunities(prev => new Set(prev).add(match.id));
        
        const button = document.getElementById(`save-btn-${match.id}`);
        if (button) {
          const originalHtml = button.innerHTML;
          button.innerHTML = '<i class="fas fa-check"></i> Salvo!';
          button.classList.add(styles.saved);
          setTimeout(() => {
            if (button) {
              button.innerHTML = originalHtml;
              button.classList.remove(styles.saved);
            }
          }, 2000);
        }
      } else {
        alert('Erro ao salvar: ' + (data.error || 'Tente novamente'));
      }
    } catch (error) {
      console.error('Error saving opportunity:', error);
      alert('Erro ao salvar oportunidade. Tente novamente.');
    } finally {
      setSavingId(null);
    }
  }

  const getFilteredTopMatches = () => {
    if (activeFilter === 'all') return topMatches;
    return topMatches.filter(m => {
      if (activeFilter === 'high') return m.matchScore >= 65;
      if (activeFilter === 'medium') return m.matchScore >= 40 && m.matchScore < 65;
      if (activeFilter === 'low') return m.matchScore < 40;
      return true;
    });
  };

  const getFilteredMoreMatches = () => {
    let filtered = moreMatches;
    if (moreFilter !== 'all') {
      filtered = filtered.filter(m => {
        if (moreFilter === 'high') return m.matchScore >= 65;
        if (moreFilter === 'medium') return m.matchScore >= 40 && m.matchScore < 65;
        if (moreFilter === 'low') return m.matchScore < 40;
        return true;
      });
    }
    return filtered.slice(0, displayCount);
  };

  const loadMore = () => {
    setDisplayCount(prev => prev + 8);
  };

  const hasMoreToShow = () => {
    let filtered = moreMatches;
    if (moreFilter !== 'all') {
      filtered = filtered.filter(m => {
        if (moreFilter === 'high') return m.matchScore >= 65;
        if (moreFilter === 'medium') return m.matchScore >= 40 && m.matchScore < 65;
        if (moreFilter === 'low') return m.matchScore < 40;
        return true;
      });
    }
    return displayCount < filtered.length;
  };

  const filteredTopMatches = getFilteredTopMatches();
  const filteredMoreMatches = getFilteredMoreMatches();
  
  const highCount = topMatches.filter(m => m.matchScore >= 65).length;
  const mediumCount = topMatches.filter(m => m.matchScore >= 40 && m.matchScore < 65).length;
  const lowCount = topMatches.filter(m => m.matchScore < 40).length;
  const moreTotal = moreMatches.length;

  const isSaved = (matchId: string) => savedOpportunities.has(matchId);

  if (authLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Carregando oportunidades...</p>
        <p className={styles.subLoading}>Analisando seu perfil</p>
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

        {/* Header Modernizado */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>Oportunidades personalizadas</div>
            <h1 className={styles.title}>
              Oportunidade para você, {user.name?.split(' ')[0] || 'Voluntário'}!
              <span className={styles.titleHighlight}>oportunidades selecionadas para você</span>
            </h1>
            <p className={styles.subtitle}>
              Análise inteligente das melhores oportunidades alinhadas às suas habilidades e objetivos.
            </p>
          </div>
          
        </div>

        {user.skills && user.skills.length > 0 && (
          <div className={styles.skillsWrapper}>
            <div className={styles.skillsBadge}>
              <span>{user.skills.slice(0, 5).join(' • ')}{user.skills.length > 5 && ` • +${user.skills.length - 5}`}</span>
            </div>
          </div>
        )}

        {topMatches.length > 0 && (
          <div className={styles.statsRow}>
            {highCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.high}`}></span>
                <strong>{highCount}</strong>
                <span>Alta compatibilidade</span>
              </div>
            )}
            {mediumCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.medium}`}></span>
                <strong>{mediumCount}</strong>
                <span>Compatibilidade média</span>
              </div>
            )}
            {lowCount > 0 && (
              <div className={styles.statPill}>
                <span className={`${styles.statDot} ${styles.low}`}></span>
                <strong>{lowCount}</strong>
                <span>Potencial de desenvolvimento</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.filtersBar}>
          <button 
            onClick={() => setActiveFilter('all')}
            className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.active : ''}`}
          >
            <i className="fas fa-th-large"></i>
            Todas
          </button>
          {highCount > 0 && (
            <button 
              onClick={() => setActiveFilter('high')}
              className={`${styles.filterBtn} ${activeFilter === 'high' ? styles.active : ''}`}
            >
              <i className="fas fa-chart-line"></i>
              Alta compatibilidade
            </button>
          )}
          {mediumCount > 0 && (
            <button 
              onClick={() => setActiveFilter('medium')}
              className={`${styles.filterBtn} ${activeFilter === 'medium' ? styles.active : ''}`}
            >
              <i className="fas fa-chart-simple"></i>
              Média compatibilidade
            </button>
          )}
          {lowCount > 0 && (
            <button 
              onClick={() => setActiveFilter('low')}
              className={`${styles.filterBtn} ${activeFilter === 'low' ? styles.active : ''}`}
            >
              <i className="fas fa-seedling"></i>
              Em desenvolvimento
            </button>
          )}
        </div>

        {filteredTopMatches.length === 0 ? (
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
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Melhores opções para você</h2>
              <span className={styles.sectionCount}>{filteredTopMatches.length} oportunidades</span>
            </div>
            <div className={styles.horizontalScrollContainer}>
              <div className={styles.cardsRow}>
                {filteredTopMatches.map((match) => {
                  const saved = isSaved(match.id);
                  return (
                    <div key={match.id} className={`${styles.matchCard} ${getPriorityClass(match.matchScore)}`}>
                      <div className={styles.cardStripe}></div>
                      <div className={styles.cardInner}>
                        <div className={styles.cardHeader}>
                          <div className={styles.cardHeaderLeft}>
                            <div className={styles.cardTitleGroup}>
                              <h3 className={styles.cardTitle}>{match.title}</h3>
                              <p className={styles.organization}>{match.organization}</p>
                            </div>
                          </div>
                          <div className={`${styles.scoreBadge} ${getScoreClass(match.matchScore)}`}>
                            <span className={styles.scoreValue}>{match.matchScore}%</span>
                            <span className={styles.scoreLabel}>match</span>
                          </div>
                        </div>

                        <div className={styles.cardMeta}>
                          <span className={styles.metaItem}>
                            <i className="fas fa-map-marker-alt"></i>
                            {match.location}
                          </span>
                          {match.theme && (
                            <span className={styles.metaItem}>
                              {match.theme}
                            </span>
                          )}
                        </div>

                        <p className={styles.cardDescription}>{match.description?.substring(0, 120)}...</p>

                        {match.matchedSkills && match.matchedSkills.length > 0 && (
                          <div className={styles.sectionBlock}>
                            <div className={styles.sectionTitle}>
                              <span>Habilidades que combinam</span>
                            </div>
                            <div className={styles.skillsGroup}>
                              {match.matchedSkills.slice(0, 3).map((skill, i) => (
                                <span key={i} className={styles.skill}>{skill}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className={styles.cardInfo}>
                          <div className={styles.reasoningBlock}>
                            <i className="fas fa-info-circle"></i>
                            <p>{match.reasoning}</p>
                          </div>
                          <div className={styles.recommendationBlock}>
                            <div>
                              <strong>Recomendação</strong>
                              <p>{match.recommendation}</p>
                            </div>
                          </div>
                        </div>

                        <div className={styles.actionButtons}>
                          <button 
                            id={`save-btn-${match.id}`}
                            onClick={() => handleSaveOpportunity(match)}
                            disabled={savingId === match.id}
                            className={`${styles.interestButton} ${saved ? styles.saved : ''}`}
                          >
                            <i className={`fas ${saved ? 'fa-check' : 'fa-heart'}`}></i>
                            {savingId === match.id ? 'Salvando...' : (saved ? 'Salvo' : 'Tenho interesse')}
                          </button>
                          <button 
                            onClick={() => router.push(`/matches/${match.id}`)}
                            className={styles.detailsButton}
                          >
                            <span>Ver detalhes</span>
                            <i className="fas fa-arrow-right"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {moreMatches.length > 0 && (
          <div className={styles.moreSection}>
            <div className={styles.moreSectionHeader}>
              <div className={styles.moreSectionTitle}>
                <i className="fas fa-compass"></i>
                <h2 className={styles.sectionSubtitle}>Explorar mais oportunidades</h2>
                <span className={styles.totalCount}>{moreTotal} oportunidades disponíveis</span>
              </div>
              
              <div className={styles.moreControls}>
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>Filtrar:</span>
                  <div className={styles.filterChips}>
                    <button 
                      onClick={() => setMoreFilter('all')}
                      className={`${styles.chip} ${moreFilter === 'all' ? styles.active : ''}`}
                    >
                      Todos ({moreTotal})
                    </button>
                    <button 
                      onClick={() => setMoreFilter('high')}
                      className={`${styles.chip} ${moreFilter === 'high' ? styles.active : ''}`}
                    >
                      <i className="fas fa-chart-line"></i> Alta
                    </button>
                    <button 
                      onClick={() => setMoreFilter('medium')}
                      className={`${styles.chip} ${moreFilter === 'medium' ? styles.active : ''}`}
                    >
                      <i className="fas fa-chart-simple"></i> Média
                    </button>
                    <button 
                      onClick={() => setMoreFilter('low')}
                      className={`${styles.chip} ${moreFilter === 'low' ? styles.active : ''}`}
                    >
                      <i className="fas fa-seedling"></i> Baixa
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={styles.moreCardsGrid}>
              {filteredMoreMatches.map((match) => {
                const saved = isSaved(match.id);
                return (
                  <div key={match.id} className={`${styles.moreCard} ${getPriorityClass(match.matchScore)}`}>
                    <div className={styles.moreCardStripe}></div>
                    <div className={styles.moreCardInner}>
                      <div className={styles.moreCardHeader}>
                        <div className={styles.moreCardScore}>
                          <span className={styles.moreScoreValue}>{match.matchScore}%</span>
                        </div>
                        <div className={styles.moreCardIcon}>
                          <i className="fas fa-briefcase"></i>
                        </div>
                      </div>
                      <h4 className={styles.moreCardTitle}>{match.title}</h4>
                      <p className={styles.moreCardOrg}>{match.organization}</p>
                      <p className={styles.moreCardLocation}>
                        <i className="fas fa-map-marker-alt"></i> {match.location}
                      </p>
                      <div className={styles.moreCardActions}>
                        <button 
                          onClick={() => handleSaveOpportunity(match)}
                          disabled={savingId === match.id}
                          className={`${styles.moreSaveButton} ${saved ? styles.savedMore : ''}`}
                        >
                          <i className={`fas ${saved ? 'fa-check' : 'fa-heart'}`}></i>
                          {saved ? 'Salvo' : 'Salvar'}
                        </button>
                        <button 
                          onClick={() => router.push(`/matches/${match.id}`)}
                          className={styles.moreViewButton}
                        >
                          <i className="fas fa-arrow-right"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {hasMoreToShow() && (
              <div className={styles.loadMoreContainer}>
                <button onClick={loadMore} className={styles.loadMoreButton}>
                  <i className="fas fa-arrow-down"></i>
                  Carregar mais oportunidades
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <FloatingChatButton/>
    </div>
  );
}

function getScoreClass(score: number): string {
  if (score >= 70) return 'scoreHigh';
  if (score >= 45) return 'scoreMedium';
  if (score >= 25) return 'scoreLow';
  return 'scoreVeryLow';
}

function getPriorityClass(score: number): string {
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}