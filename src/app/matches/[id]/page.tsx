'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import styles from './page.module.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

interface OpportunityDetail {
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
  theme?: string;
  projectLink?: string;
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user && params.id) {
      fetchOpportunityDetail();
    }
  }, [user, authLoading, params.id]);

  async function fetchOpportunityDetail() {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching opportunity detail for ID:', params.id);
      
      const res = await fetch(`/api/match/${params.id}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success && data.opportunity) {
        setOpportunity(data.opportunity);
      } else {
        throw new Error('Oportunidade não encontrada');
      }
      
    } catch (err: any) {
      console.error('Error fetching opportunity detail:', err);
      setError(err.message || 'Erro ao carregar detalhes da oportunidade');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Carregando detalhes da oportunidade...</p>
      </div>
    );
  }

  if (!user) return null;

  if (error || !opportunity) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorCard}>
          <i className="fas fa-exclamation-triangle"></i>
          <h2>Erro ao carregar</h2>
          <p>{error || 'Oportunidade não encontrada'}</p>
          <button onClick={() => router.push('/matches')} className={styles.backButton}>
            <i className="fas fa-arrow-left"></i>
            Voltar para oportunidades
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <button onClick={() => router.push('/matches')} className={styles.backButton}>
            <i className="fas fa-arrow-left"></i>
            Voltar
          </button>
          <div className={styles.topBarActions}>
            <button className={styles.saveButton}>
              <i className="fas fa-bookmark"></i>
              Salvar
            </button>
            <button className={styles.contactButton}>
              <i className="fas fa-envelope"></i>
              Contato
            </button>
          </div>
        </div>
      </div>

      {/* Hero Banner */}
      <div className={styles.heroBanner}>
        <div className={styles.heroInner}>
          <div className={styles.heroMeta}>
            <div className={styles.orgChip}>
              <div className={styles.orgChipIcon}>
                <i className="fas fa-building"></i>
              </div>
              <span className={styles.orgChipName}>{opportunity.organization}</span>
            </div>
            <div className={`${styles.priorityBadge} ${styles[opportunity.priority]}`}>
              <i className="fas fa-chart-line"></i>
              {opportunity.priority === 'high' ? 'Alta prioridade' : opportunity.priority === 'medium' ? 'Média prioridade' : 'Em desenvolvimento'}
            </div>
          </div>

          <h1 className={styles.heroTitle}>{opportunity.title}</h1>

          <div className={styles.heroFooter}>
            <span className={styles.heroMetaItem}>
              <i className="fas fa-map-marker-alt"></i>
              {opportunity.location}
            </span>
            {opportunity.theme && (
              <span className={styles.heroMetaItem}>
                <i className="fas fa-tag"></i>
                {opportunity.theme}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className={styles.layout}>
        {/* Left Column */}
        <div className={styles.mainContent}>
          {/* Description Block */}
          <div className={styles.contentBlock}>
            <div className={styles.blockHeader}>
              <div className={styles.blockHeaderIcon}>
                <i className="fas fa-align-left"></i>
              </div>
              <span className={styles.blockHeaderTitle}>Sobre a oportunidade</span>
            </div>
            <div className={styles.blockBody}>
              <p className={styles.description}>{opportunity.description}</p>
            </div>
          </div>

          {/* Skills Block */}
          <div className={styles.contentBlock}>
            <div className={styles.blockHeader}>
              <div className={styles.blockHeaderIcon}>
                <i className="fas fa-code"></i>
              </div>
              <span className={styles.blockHeaderTitle}>Habilidades desejadas</span>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.skillsGrid}>
                {opportunity.skills?.map((skill, i) => (
                  <span key={i} className={styles.skillTag}>{skill}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Match Analysis Block */}
          <div className={styles.contentBlock}>
            <div className={styles.blockHeader}>
              <div className={styles.blockHeaderIcon}>
                <i className="fas fa-chart-line"></i>
              </div>
              <span className={styles.blockHeaderTitle}>Análise do match</span>
            </div>
            <div className={styles.blockBody}>
              {/* Match Panels */}
              <div className={styles.matchPanels}>
                {opportunity.matchedSkills && opportunity.matchedSkills.length > 0 && (
                  <div className={`${styles.matchPanel} ${styles.green}`}>
                    <div className={styles.matchPanelLabel}>
                      <i className="fas fa-check-circle"></i>
                      Suas habilidades que combinam
                    </div>
                    <div className={styles.matchSkillsList}>
                      {opportunity.matchedSkills.map((skill, i) => (
                        <span key={i} className={styles.matchedSkill}>{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {opportunity.missingSkills && opportunity.missingSkills.length > 0 && (
                  <div className={`${styles.matchPanel} ${styles.amber}`}>
                    <div className={styles.matchPanelLabel}>
                      <i className="fas fa-lightbulb"></i>
                      Habilidades para desenvolver
                    </div>
                    <div className={styles.matchSkillsList}>
                      {opportunity.missingSkills.map((skill, i) => (
                        <span key={i} className={styles.missingSkill}>{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reasoning */}
              <div className={styles.quoteBlock}>
                <div className={styles.quoteLabel}>Análise detalhada</div>
                <p className={styles.quoteText}>{opportunity.reasoning}</p>
              </div>

              {/* Recommendation */}
              <div className={styles.recommendBlock}>
                <div className={styles.recommendIcon}>
                  <i className="fas fa-gem"></i>
                </div>
                <div>
                  <div className={styles.recommendLabel}>Recomendação personalizada</div>
                  <p className={styles.recommendText}>{opportunity.recommendation}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={styles.sidebar}>
          {/* Score Card */}
          <div className={`${styles.scoreCard} ${styles[opportunity.priority]}`}>
            <div className={styles.scoreCardLabel}>Compatibilidade</div>
            <div className={styles.scoreRing}>
              <svg className={styles.scoreRingCircle} viewBox="0 0 100 100">
                <circle className={styles.scoreRingBg} cx="50" cy="50" r="45" />
                <circle 
                  className={`${styles.scoreRingFill} ${getScoreRingClass(opportunity.matchScore)}`} 
                  cx="50" cy="50" r="45" 
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - opportunity.matchScore / 100)}`}
                />
              </svg>
              <div className={styles.scoreCenter}>
                <span className={styles.scoreNumber}>{opportunity.matchScore}</span>
                <span className={styles.scorePercent}>%</span>
              </div>
            </div>
            <div className={styles.scoreCardPriority}>
              {opportunity.priority === 'high' ? 'Excelente oportunidade' : 
               opportunity.priority === 'medium' ? 'Boa oportunidade' : 
               'Em desenvolvimento'}
            </div>
          </div>

          {/* Info Widget */}
          <div className={styles.infoWidget}>
            <div className={styles.infoWidgetTitle}>Informações</div>
            <div className={styles.infoRow}>
              <div className={styles.infoRowIcon}>
                <i className="fas fa-map-marker-alt"></i>
              </div>
              <div>
                <div className={styles.infoRowLabel}>Localização</div>
                <div className={styles.infoRowValue}>{opportunity.location}</div>
              </div>
            </div>
            <div className={styles.infoRow}>
              <div className={styles.infoRowIcon}>
                <i className="fas fa-building"></i>
              </div>
              <div>
                <div className={styles.infoRowLabel}>Organização</div>
                <div className={styles.infoRowValue}>{opportunity.organization}</div>
              </div>
            </div>
          </div>

          {/* CTA Block */}
          <div className={styles.ctaBlock}>
            <div className={styles.ctaTitle}>Quer se candidatar?</div>
            <div className={styles.ctaSubtitle}>
              Essa oportunidade pode ser um ótimo passo na sua jornada de voluntariado
            </div>
            <button className={styles.ctaButton}>
              Tenho interesse
            </button>
          </div>

          {/* Disclaimer */}
          <div className={styles.disclaimer}>
            <i className="fas fa-info-circle"></i>
            Informações fornecidas pela GlobalGiving. Entre em contato diretamente com a organização.
          </div>
        </div>
      </div>
    </div>
  );
}

function getScoreRingClass(score: number): string {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 25) return 'low';
  return 'scoreVeryLow';
}