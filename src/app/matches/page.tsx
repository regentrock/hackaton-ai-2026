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
  score: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
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
      
      if (data.success) {
        setMatches(data.matches || []);
        setUsingAI(data.usingAI || false);
      } else {
        setMatches(data.matches || []);
      }
      
    } catch (err: any) {
      console.error('Error fetching matches:', err);
      setError(err.message || 'Erro ao carregar oportunidades');
    } finally {
      setLoading(false);
    }
  }

  const highPriorityMatches = matches.filter(m => m.priority === 'high');
  const mediumPriorityMatches = matches.filter(m => m.priority === 'medium');
  const lowPriorityMatches = matches.filter(m => m.priority === 'low');

  if (authLoading || loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Analisando oportunidades com IA...</p>
        <p style={styles.subLoading}>Isso pode levar alguns segundos</p>
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
      <div style={styles.header}>
        <h1 style={styles.title}>🤝 Oportunidades Inteligentes para Você</h1>
        {usingAI && (
          <div style={styles.aiBadge}>
            🧠 Match realizado com IA WatsonX
          </div>
        )}
      </div>
      
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
          <p>Nenhuma oportunidade encontrada para suas habilidades.</p>
          <p>Tente adicionar mais habilidades ao seu perfil.</p>
          <button onClick={() => router.push('/dashboard')} style={styles.updateButton}>
            Atualizar Perfil
          </button>
        </div>
      ) : (
        <>
          {/* Recomendações Prioritárias */}
          {highPriorityMatches.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>🎯 Recomendações Prioritárias</h2>
              <div style={styles.grid}>
                {highPriorityMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
          
          {/* Outras Recomendações */}
          {mediumPriorityMatches.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>👍 Boas Oportunidades</h2>
              <div style={styles.grid}>
                {mediumPriorityMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
          
          {/* Oportunidades para Desenvolvimento */}
          {lowPriorityMatches.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>📚 Oportunidades para Desenvolver Novas Habilidades</h2>
              <div style={styles.grid}>
                {lowPriorityMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>{match.title}</h2>
        <div style={styles.matchScoreBadge(match.score)}>
          {match.score}% match
        </div>
      </div>
      
      <p style={styles.orgName}>🏢 {match.organization}</p>
      <p style={styles.location}>📍 {match.location}</p>
      {match.theme && (
        <p style={styles.theme}>🎯 Tema: {match.theme}</p>
      )}
      <p style={styles.description}>{match.description?.substring(0, 200)}...</p>
      
      {match.matchedSkills && match.matchedSkills.length > 0 && (
        <div style={styles.matchedSkillsSection}>
          <strong>✅ Suas habilidades que combinam:</strong>
          <div style={styles.skillsList}>
            {match.matchedSkills.map((skill, i) => (
              <span key={i} style={styles.matchedSkillTag}>{skill}</span>
            ))}
          </div>
        </div>
      )}
      
      {match.missingSkills && match.missingSkills.length > 0 && (
        <div style={styles.missingSkillsSection}>
          <strong>📚 Habilidades para desenvolver:</strong>
          <div style={styles.skillsList}>
            {match.missingSkills.map((skill, i) => (
              <span key={i} style={styles.missingSkillTag}>{skill}</span>
            ))}
          </div>
        </div>
      )}
      
      <div style={styles.reasoningSection}>
        <strong>💡 Análise do Match:</strong>
        <p style={styles.reasoning}>{match.reasoning}</p>
      </div>
      
      <div style={styles.recommendationSection}>
        <strong>🎯 Recomendação:</strong>
        <p style={styles.recommendation}>{match.recommendation}</p>
      </div>
      
      <a href={`mailto:voluntarios@globalgiving.org?subject=Interesse no projeto: ${match.title}`} style={styles.contactButton}>
        📧 Tenho Interesse
      </a>
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
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    marginBottom: '0.5rem',
    color: '#1f2937',
  },
  aiBadge: {
    display: 'inline-block',
    backgroundColor: '#7c3aed',
    color: 'white',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
    marginTop: '0.5rem',
  },
  subLoading: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.5rem',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    marginBottom: '1rem',
    color: '#374151',
  },
  userSkillsCard: {
    backgroundColor: '#e0e7ff',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '2rem',
    textAlign: 'center' as const,
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
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
    backgroundColor: score >= 75 ? '#dcfce7' : score >= 50 ? '#fef3c7' : '#fee2e2',
    color: score >= 75 ? '#166534' : score >= 50 ? '#92400e' : '#991b1b',
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
    marginBottom: '0.25rem',
  },
  location: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '0.25rem',
  },
  theme: {
    fontSize: '0.75rem',
    color: '#7c3aed',
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
  missingSkillsSection: {
    marginTop: '0.75rem',
  },
  reasoningSection: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
  },
  recommendationSection: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
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
  missingSkillTag: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
  },
  reasoning: {
    fontSize: '0.75rem',
    color: '#4b5563',
    marginTop: '0.25rem',
    marginBottom: 0,
  },
  recommendation: {
    fontSize: '0.75rem',
    color: '#92400e',
    marginTop: '0.25rem',
    marginBottom: 0,
    fontWeight: '500' as const,
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
    marginTop: '0.75rem',
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

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}