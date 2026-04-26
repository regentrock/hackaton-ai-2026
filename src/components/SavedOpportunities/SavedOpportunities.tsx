'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './SavedOpportunities.module.css';

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

export default function SavedOpportunities() {
  const [saved, setSaved] = useState<SavedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      fetchSaved();
    }
  }, [user]);

  async function fetchSaved() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/user/saved', {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Erro ao carregar oportunidades salvas');
      }

      const data = await res.json();
      setSaved(data.saved || []);
    } catch (err: any) {
      console.error('Error fetching saved:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(opportunityId: string) {
    try {
      const res = await fetch(`/api/user/saved?opportunityId=${opportunityId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setSaved(saved.filter(s => s.opportunityId !== opportunityId));
      }
    } catch (error) {
      console.error('Error removing:', error);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Oportunidades salvas</h3>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Oportunidades salvas</h3>
        </div>
        <div className={styles.errorMessage}>
          <p>Erro ao carregar oportunidades salvas</p>
        </div>
      </div>
    );
  }

  if (saved.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Oportunidades salvas</h3>
        </div>
        <div className={styles.emptyMessage}>
          <p>Você ainda não salvou nenhuma oportunidade.</p>
          <button 
            onClick={() => router.push('/matches')}
            className={styles.exploreButton}
          >
            Explorar oportunidades
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          Oportunidades salvas
          <span className={styles.count}>{saved.length}</span>
        </h3>
      </div>

      <div className={styles.list}>
        {saved.slice(0, 5).map((item) => (
          <div key={item.id} className={styles.card}>
            <div className={styles.cardContent}>
              <div>
                <h4 className={styles.cardTitle}>{item.title}</h4>
                <p className={styles.cardOrganization}>{item.organization}</p>
              </div>
              <div className={styles.cardMeta}>
                <span className={styles.metaDate}>
                  <i className="fas fa-calendar-alt"></i>
                  {formatDate(item.savedAt)}
                </span>
              </div>
            </div>
            <div className={styles.cardActions}>
              <button 
                onClick={() => router.push(`/matches/${item.opportunityId}`)}
                className={styles.viewButton}
              >
                Ver oportunidade
              </button>
              <button 
                onClick={() => handleRemove(item.opportunityId)}
                className={styles.removeButton}
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      {saved.length > 5 && (
        <div className={styles.footer}>
          <button 
            onClick={() => router.push('/saved')}
            className={styles.viewAllButton}
          >
            Ver todas ({saved.length})
          </button>
        </div>
      )}
    </div>
  );
}