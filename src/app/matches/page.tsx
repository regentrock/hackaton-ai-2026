'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface Match {
  id: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  skills: string[];
  contactEmail: string;
  matchScore: number;
  matchedSkills?: string[];
  matchReason?: string;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

      const res = await fetch('/api/opportunities', {
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
      setMatches(data.opportunities || []);
      
    } catch (err: any) {
      console.error('Error fetching matches:', err);
      setError(err.message || 'Erro ao carregar oportunidades');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Encontrando as melhores oportunidades para você...</p>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <h2>❌ Erro</h2>
          <p>{error}</p>
          <button onClick={fetchMatches} style={styles.retryButton}>
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🤝 Oportunidades para Você</h1>
      
      {user.skills && user.skills.length > 0 && (
        <div style={styles.userSkillsCard}>
          <strong>⭐ Suas habilidades:</strong>
          <div style={styles.userSkillsList}>
            {user.skills.map((skill: string, i: number) => (
              <span key={i} style={styles.userSkillTag}>{skill}</span>
            ))}
          </div>
        </div>
      )}
      
      {matches.length === 0 ? (
        <div style={styles.emptyCard}>
          <p>Nenhuma oportunidade encontrada no momento.</p>
          <p>Tente atualizar seu perfil com mais habilidades.</p>
          <button onClick={() => router.push('/dashboard')} style={styles.updateButton}>
            Atualizar Perfil
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {matches.map((match) => (
            <div key={match.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>{match.title}</h2>
                <div style={styles.matchScoreBadge(match.matchScore)}>
                                  {match.matchScore}% match
                </div>
              </div>
              
              <p style={styles.orgName}>🏢 {match.organization}</p>
              <p style={styles.location}>📍 {match.location}</p>
              <p style={styles.description}>{match.description}</p>
              
              {match.matchedSkills && match.matchedSkills.length > 0 && (
                <div style={styles.matchedSkillsSection}>
                  <strong>✅ Habilidades compatíveis:</strong>
                  <div style={styles.skillsList}>
                    {match.matchedSkills.map((skill, i) => (
                      <span key={i} style={styles.matchedSkillTag}>{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {match.skills && match.skills.length > 0 && (
                <div style={styles.skillsSection}>
                  <strong>📋 Habilidades desejadas:</strong>
                  <div style={styles.skillsList}>
                    {match.skills.slice(0, 5).map((skill, i) => (
                      <span key={i} style={styles.skillTag}>{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {match.matchReason && (
                <p style={styles.matchReason}>{match.matchReason}</p>
              )}
              
              <a href={`mailto:${match.contactEmail}`} style={styles.contactButton}>
                📧 Entrar em Contato
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: any } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
  },
  title: {
    fontSize: '2rem',
    marginBottom: '1.5rem',
    textAlign: 'center',
    color: '#1f2937',
  },
  userSkillsCard: {
    backgroundColor: '#e0e7ff',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '2rem',
    textAlign: 'center',
  },
  userSkillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    justifyContent: 'center',
    marginTop: '0.5rem',
  },
  userSkillTag: {
    backgroundColor: '#4f46e5',
    color: 'white',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.875rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontSize: '1.25rem',
    color: '#1f2937',
    margin: 0,
    flex: 1,
  },
  matchScoreBadge: (score: number) => ({
    backgroundColor: score >= 70 ? '#dcfce7' : score >= 40 ? '#fef3c7' : '#fee2e2',
    color: score >= 70 ? '#166534' : score >= 40 ? '#92400e' : '#991b1b',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    marginLeft: '0.5rem',
    whiteSpace: 'nowrap' as const,
  }),
  orgName: {
    fontSize: '0.875rem',
    color: '#4b5563',
    marginBottom: '0.5rem',
  },
  location: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '0.75rem',
  },
  description: {
    fontSize: '0.875rem',
    color: '#374151',
    lineHeight: '1.5',
    marginBottom: '1rem',
  },
  matchedSkillsSection: {
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e5e7eb',
  },
  skillsSection: {
    marginTop: '0.75rem',
  },
  skillsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  matchedSkillTag: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
  },
  skillTag: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
  },
  matchReason: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginTop: '0.75rem',
    fontStyle: 'italic',
  },
  contactButton: {
    display: 'block',
    textAlign: 'center' as const,
    backgroundColor: '#c1121f',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: '500',
    marginTop: '1rem',
    transition: 'background-color 0.2s',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#c1121f',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    padding: '2rem',
    borderRadius: '12px',
    textAlign: 'center' as const,
  },
  retryButton: {
    backgroundColor: '#c1121f',
    color: '#fff',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  updateButton: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  emptyCard: {
    textAlign: 'center' as const,
    padding: '3rem',
    backgroundColor: '#fff',
    borderRadius: '12px',
  },
};

// Adicionar keyframe para animação
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}