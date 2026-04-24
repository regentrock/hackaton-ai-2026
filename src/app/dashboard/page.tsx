'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    fontSize: '2rem',
    fontWeight: 'bold' as const,
    marginBottom: '1rem',
    color: '#333',
  },
  card: {
    background: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  info: {
    marginBottom: '0.5rem',
  },
  label: {
    fontWeight: 'bold' as const,
    marginRight: '0.5rem',
  },
  button: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '1.2rem',
  },
};

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div style={styles.loading}>Carregando...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Dashboard</h1>
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>Bem-vindo, {user.name}!</h2>
        <p style={styles.info}><span style={styles.label}>Email:</span> {user.email}</p>
        <p style={styles.info}><span style={styles.label}>Localização:</span> {user.location || 'Não informada'}</p>
        <p style={styles.info}><span style={styles.label}>Disponibilidade:</span> {user.availability || 'Não informada'}</p>
        <p style={styles.info}><span style={styles.label}>Descrição:</span> {user.description || 'Não informada'}</p>
        <p style={styles.info}><span style={styles.label}>Habilidades:</span> {user.skills.join(', ') || 'Nenhuma'}</p>
        <button onClick={logout} style={styles.button}>
          Sair
        </button>
      </div>
    </div>
  );
}