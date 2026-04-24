'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface Match {
  title: string;
  organization?: string;
  location: string;
  reason: string;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirecionar se não estiver autenticado
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    // Se estiver autenticado, buscar matches
    if (user) {
      fetchMatches();
    }
  }, [user, authLoading]);

  async function fetchMatches() {
    try {
      setLoading(true);
      setError(null);

      // Usar URL relativa para funcionar em qualquer ambiente
      const res = await fetch('/api/match', {
        method: 'GET',
        credentials: 'include', // ESSENCIAL para enviar os cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${res.status}: Falha ao buscar oportunidades`);
      }

      const data = await res.json();
      
      // Garantir que data é um array
      setMatches(Array.isArray(data) ? data : []);
      
    } catch (err: any) {
      console.error("ERROR fetching matches:", err);
      setError(err.message || "Erro ao carregar oportunidades");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Encontrando as melhores oportunidades para você...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Será redirecionado pelo useEffect
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <h2 style={styles.errorTitle}>❌ Ops! Algo deu errado</h2>
          <p style={styles.errorMessage}>{error}</p>
          <button onClick={() => fetchMatches()} style={styles.retryButton}>
            Tentar Novamente
          </button>
          <button onClick={() => router.push('/dashboard')} style={styles.backButton}>
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🤝 Oportunidades de Voluntariado</h1>
        <p style={styles.subtitle}>
          Baseado no seu perfil, estas oportunidades podem ser ideais para você
        </p>
      </div>

      {matches.length === 0 ? (
        <div style={styles.emptyCard}>
          <p style={styles.emptyIcon}>🔍</p>
          <p style={styles.emptyText}>Nenhuma oportunidade encontrada no momento.</p>
          <p style={styles.emptyHint}>Tente atualizar seu perfil com mais habilidades ou localização.</p>
          <button onClick={() => router.push('/dashboard')} style={styles.backButton}>
            Voltar ao Dashboard
          </button>
        </div>
      ) : (
        <div style={styles.matchesGrid}>
          {matches.map((match, index) => (
            <div key={index} style={styles.matchCard}>
              <div style={styles.matchNumber}>#{index + 1}</div>
              <h2 style={styles.matchTitle}>{match.title}</h2>
              {match.organization && (
                <p style={styles.matchOrg}>
                  <strong>🏢 Organização:</strong> {match.organization}
                </p>
              )}
              <p style={styles.matchLocation}>
                <strong>📍 Localização:</strong> {match.location}
              </p>
              <p style={styles.matchReason}>
                <strong>💡 Por que esta oportunidade?</strong>
                <br />
                {match.reason}
              </p>
            </div>
          ))}
        </div>
      )}
      
      <button onClick={() => router.push('/dashboard')} style={styles.backButtonBottom}>
        ← Voltar ao Dashboard
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    color: '#1f2937',
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#6b7280',
  },
  matchesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  matchCard: {
    position: 'relative' as const,
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    border: '1px solid #e5e7eb',
  },
  matchNumber: {
    position: 'absolute' as const,
    top: '-10px',
    left: '10px',
    backgroundColor: '#c1121f',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  matchTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#1f2937',
    marginTop: '0.5rem',
    marginBottom: '1rem',
  },
  matchOrg: {
    fontSize: '0.875rem',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  matchLocation: {
    fontSize: '0.875rem',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  matchReason: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e5e7eb',
    lineHeight: '1.5',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#c1121f',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '1rem',
    fontSize: '1rem',
    color: '#6b7280',
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    padding: '2rem',
    textAlign: 'center' as const,
    maxWidth: '500px',
    margin: '0 auto',
  },
  errorTitle: {
    fontSize: '1.25rem',
    color: '#991b1b',
    marginBottom: '1rem',
  },
  errorMessage: {
    color: '#7f1d1d',
    marginBottom: '1.5rem',
  },
  emptyCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: '12px',
    padding: '3rem',
    textAlign: 'center' as const,
    maxWidth: '600px',
    margin: '0 auto',
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  emptyText: {
    fontSize: '1.125rem',
    color: '#4b5563',
    marginBottom: '0.5rem',
  },
  emptyHint: {
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  retryButton: {
    backgroundColor: '#c1121f',
    color: 'white',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginRight: '0.5rem',
  },
  backButton: {
    backgroundColor: '#6b7280',
    color: 'white',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  backButtonBottom: {
    display: 'block',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    padding: '0.75rem 1.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    margin: '1rem auto 0',
    textAlign: 'center' as const,
  },
};

// Adicionar keyframes para a animação do spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);
}