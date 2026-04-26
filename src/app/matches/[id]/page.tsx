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
            Voltar para oportunidades
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.container}>
        {/* Back Button */}
        <button onClick={() => router.push('/matches')} className={styles.backButton}>
          <i className="fas fa-arrow-left"></i>
          Voltar para oportunidades
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.scoreBadge}>
            <span className={styles.scoreValue}>{opportunity.matchScore}%</span>
            <span className={styles.scoreLabel}>compatibilidade</span>
          </div>
          <h1 className={styles.title}>{opportunity.title}</h1>
          <p className={styles.organization}>
            <i className="fas fa-building"></i>
            {opportunity.organization}
          </p>
          <div className={styles.metaInfo}>
            <span className={styles.metaItem}>
              <i className="fas fa-map-marker-alt"></i>
              {opportunity.location}
            </span>
            {opportunity.theme && (
              <span className={styles.metaItem}>
                <i className="fas fa-tag"></i>
                {opportunity.theme}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <i className="fas fa-info-circle"></i>
            Sobre a oportunidade
          </h2>
          <p className={styles.description}>{opportunity.description}</p>
        </div>

        {/* Skills Required */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <i className="fas fa-code"></i>
            Habilidades desejadas
          </h2>
          <div className={styles.skillsList}>
            {opportunity.skills?.map((skill, i) => (
              <span key={i} className={styles.skillTag}>{skill}</span>
            ))}
          </div>
        </div>

        {/* Match Analysis */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <i className="fas fa-chart-line"></i>
            Análise do match
          </h2>
          
          {opportunity.matchedSkills && opportunity.matchedSkills.length > 0 && (
            <div className={styles.matchBlock}>
              <div className={styles.matchIcon}>
                <i className="fas fa-check-circle"></i>
              </div>
              <div>
                <strong>Suas habilidades que combinam:</strong>
                <div className={styles.matchedSkillsList}>
                  {opportunity.matchedSkills.map((skill, i) => (
                    <span key={i} className={styles.matchedSkill}>{skill}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {opportunity.missingSkills && opportunity.missingSkills.length > 0 && (
            <div className={styles.missingBlock}>
              <div className={styles.missingIcon}>
                <i className="fas fa-lightbulb"></i>
              </div>
              <div>
                <strong>Habilidades para desenvolver:</strong>
                <div className={styles.missingSkillsList}>
                  {opportunity.missingSkills.map((skill, i) => (
                    <span key={i} className={styles.missingSkill}>{skill}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className={styles.reasoningBlock}>
            <i className="fas fa-quote-left"></i>
            <div>
              <strong>Análise detalhada</strong>
              <p>{opportunity.reasoning}</p>
            </div>
          </div>

          <div className={styles.recommendationBlock}>
            <i className="fas fa-gem"></i>
            <div>
              <strong>Recomendação personalizada</strong>
              <p>{opportunity.recommendation}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button className={styles.contactButton}>
            <i className="fas fa-envelope"></i>
            Entrar em contato
          </button>
          <button className={styles.saveButton}>
            <i className="fas fa-bookmark"></i>
            Salvar oportunidade
          </button>
        </div>

        {/* Disclaimer */}
        <p className={styles.disclaimer}>
          <i className="fas fa-info-circle"></i>
          As informações desta oportunidade são fornecidas pela GlobalGiving. 
          Entre em contato diretamente com a organização para mais detalhes.
        </p>
      </div>
    </div>
  );
}