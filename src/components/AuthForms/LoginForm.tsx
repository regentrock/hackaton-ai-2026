'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './AuthForms.module.css';

interface AuthError {
  message: string;
}

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const authError = err as AuthError;
      setError(authError.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.container}>
      <h2 className={styles.title}>Bem-vindo de volta! 👋</h2>
      <p className={styles.subtitle}>
        Faça login para continuar sua jornada de voluntariado
      </p>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <div className={styles.group}>
        <label className={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="seu@email.com"
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••"
          className={styles.input}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className={styles.primaryButton}
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      <div className={styles.footerText}>
        Não tem uma conta?{' '}
        <button
          type="button"
          onClick={() => router.push('/register')}
          className={styles.linkButton}
        >
          Crie uma conta gratuitamente
        </button>
      </div>
    </form>
  );
}