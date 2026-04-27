'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [moreFilter, setMoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedOpportunities, setSavedOpportunities] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(12);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchMatches(1);
      fetchSavedOpportunities();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMoreMatches();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, allMatches.length]);

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

  async function fetchMatches(pageNum: number, isLoadMore: boolean = false) {
    try {
      if (pageNum === 1) setLoading(true);
      setError(null);
      
      const res = await fetch(`/api/match?page=${pageNum}&limit=12`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        const matches: Match[] = data.matches || [];
        
        if (pageNum === 1) {
          setAllMatches(matches);
          setTopMatches(matches.slice(0, 6));
          setMoreMatches(matches.slice(6));
          setTotalMatches(data.total || matches.length);
          setHasMore(data.hasMore || false);
          setPage(data.page || 1);
        } else {
          setAllMatches((prev: Match[]) => {
            const existingIds = new Set(prev.map((m: Match) => m.id));
            const newMatches = matches.filter((m: Match) => !existingIds.has(m.id));
            return [...prev, ...newMatches];
          });
          setMoreMatches((prev: Match[]) => {
            const existingIds = new Set(prev.map((m: Match) => m.id));
            const newMatches = matches.filter((m: Match) => !existingIds.has(m.id));
            return [...prev, ...newMatches];
          });
          setHasMore(data.hasMore || false);
          setPage(data.page || pageNum);
        }
        
        console.log(`📊 Página ${pageNum}: ${matches.length} matches, Total: ${data.total}`);
      }
      
    } catch (err: any) {
      console.error('Error fetching matches:', err);
      setError(err.message || 'Erro ao carregar oportunidades');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const loadMoreMatches = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    await fetchMatches(nextPage, true);
  };

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
        setSavedOpportunities((prev: Set<string>) => new Set(prev).add(match.id));
        
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

  const getFilteredTopMatches = (): Match[] => {
    if (activeFilter === 'all') return topMatches;
    return topMatches.filter((m: Match) => {
      if (activeFilter === 'high') return m.matchScore >= 75;
      if (activeFilter === 'medium') return m.matchScore >= 60 && m.matchScore < 75;
      if (activeFilter === 'low') return m.matchScore < 60;
      return true;
    });
  };

  const getFilteredMoreMatches = (): Match[] => {
    let filtered = moreMatches;
    if (moreFilter !== 'all') {
      filtered = filtered.filter((m: Match) => {
        if (moreFilter === 'high') return m.matchScore >= 75;
        if (moreFilter === 'medium') return m.matchScore >= 60 && m.matchScore < 75;
        if (moreFilter === 'low') return m.matchScore < 60;
        return true;
      });
    }
    return filtered.slice(0, displayCount);
  };

  const loadMore = () => {
    setDisplayCount((prev: number) => prev + 12);
  };

  const hasMoreToShow = (): boolean => {
    let filtered = moreMatches;
    if (moreFilter !== 'all') {
      filtered = filtered.filter((m: Match) => {
        if (moreFilter === 'high') return m.matchScore >= 75;
        if (moreFilter === 'medium') return m.matchScore >= 60 && m.matchScore < 75;
        if (moreFilter === 'low') return m.matchScore < 60;
        return true;
      });
    }
    return displayCount < filtered.length;
  };

  const filteredTopMatches = getFilteredTopMatches();
  const filteredMoreMatches = getFilteredMoreMatches();
  
  const highCount = topMatches.filter((m: Match) => m.matchScore >= 75).length;
  const mediumCount = topMatches.filter((m: Match) => m.matchScore >= 60 && m.matchScore < 75).length;
  const lowCount = topMatches.filter((m: Match) => m.matchScore < 60).length;
  const moreTotal = moreMatches.length;

  const isSaved = (matchId: string): boolean => savedOpportunities.has(matchId);

  if (authLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Analisando oportunidades com IA WatsonX...</p>
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
          <button onClick={() => fetchMatches(1)} className={styles.retryButton}>
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
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>Oportunidades personalizadas</div>
            <h1 className={styles.title}>
              Olá, {user.name?.split(' ')[0] || 'Voluntário'}!
              <span className={styles.titleHighlight}>oportunidades selecionadas para você</span>
            </h1>
            <p className={styles.subtitle}>
              Análise inteligente das melhores oportunidades alinhadas às suas habilidades.
            </p>
          </div>
        </div>

        {user.skills && user.skills.length > 0 && (
          <div className={styles.skillsWrapper}>
            <div className={styles.skillsBadge}>
              <span>✨ {user.skills.slice(0, 5).join(' • ')}{user.skills.length > 5 && ` • +${user.skills.length - 5}`}</span>
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
            <p>Tente adicionar mais habilidades ao seu perfil</p>
            <button onClick={() => router.push('/dashboard')} className={styles.updateProfileBtn}>
              Atualizar perfil
            </button>
          </div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>🌟 Melhores opções para você</h2>
              <span className={styles.sectionCount}>{filteredTopMatches.length} oportunidades</span>
            </div>
            <div className={styles.horizontalScrollContainer}>
              <div className={styles.cardsRow}>
                {filteredTopMatches.map((match: Match) => {
                  const saved = isSaved(match.id);
                  return (
                    <div key={match.id} className={`${styles.matchCard} ${getPriorityClass(match.matchScore)}`}>
                      <div className={styles.cardStripe}></div>
                      <div className={styles.cardInner}>
                        {/* ... resto do card ... */}
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
                              <span>✨ Habilidades que combinam</span>
                            </div>
                            <div className={styles.skillsGroup}>
                              {match.matchedSkills.slice(0, 3).map((skill: string, i: number) => (
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
                              <strong>🎯 Recomendação</strong>
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
            {/* ... resto da seção more ... */}
          </div>
        )}
      </div>
    </div>
  );
}

function getScoreClass(score: number): string {
  if (score >= 75) return 'scoreHigh';
  if (score >= 60) return 'scoreMedium';
  if (score >= 45) return 'scoreLow';
  return 'scoreVeryLow';
}

function getPriorityClass(score: number): string {
  if (score >= 75) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}