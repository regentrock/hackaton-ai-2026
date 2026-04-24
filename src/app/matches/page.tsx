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
  matchScore?: number;
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
      setMatches(Array.isArray(data) ? data : []);
      
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
      
      {matches.length === 0 ? (
        <div style={styles.emptyCard}>
          <p>Nenhuma oportunidade encontrada no momento.</p>
          <p>Tente atualizar seu perfil com mais habilidades.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {matches.map((match) => (
            <div key={match.id} style={styles.card}>
              <h2>{match.title}</h2>
              <p><strong>🏢 {match.organization}</strong></p>
              <p><strong>📍 {match.location}</strong></p>
              <p>{match.description}</p>
              {match.skills && match.skills.length > 0 && (
                <div style={styles.skills}>
                  {match.skills.map((skill, i) => (
                    <span key={i} style={styles.skillTag}>{skill}</span>
                  ))}
                </div>
              )}
              {match.matchScore && (
                <div style={styles.matchScore}>
                  Compatibilidade: {match.matchScore}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  title: {
    fontSize: '2rem',
    marginBottom: '2rem',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
  },
  skills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '1rem',
  },
  skillTag: {
    backgroundColor: '#e5e7eb',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.75rem',
  },
  matchScore: {
    marginTop: '1rem',
    padding: '0.5rem',
    backgroundColor: '#dcfce7',
    borderRadius: '8px',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: 'bold',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
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
    textAlign: 'center',
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
  emptyCard: {
    textAlign: 'center',
    padding: '3rem',
    backgroundColor: '#f3f4f6',
    borderRadius: '12px',
  },
};

// Adicionar keyframe para animação
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}