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
    <div className={styles.authWrapper}>
      <div className={styles.splitLayout}>
        <div className={styles.formSide}>
          <form onSubmit={handleSubmit} className={styles.container}>
            <h2 className={styles.title}>Bem-vindo de volta!</h2>
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
                placeholder="••••••••"
                className={styles.input}
              />
            </div>

            <div className={styles.footerText} style={{ textAlign: 'right', marginTop: -10, marginBottom: 20 }}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => alert('Recuperação de senha em breve')}
              >
                Esqueceu sua senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.primaryButton}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <div className={styles.divider}>ou</div>

            <button
              type="button"
              onClick={() => router.push('/register')}
              className={styles.secondaryButton}
            >
              Criar nova conta
            </button>
          </form>
        </div>
        
        <div className={styles.imageSide}>
          <div className={styles.imageContent}>
            <div className={styles.logo}>
              <span className={styles.logoHeart}>❤️</span>
              <span className={styles.logoText}>Volunta<span>Re</span></span>
            </div>
            
            <div className={styles.imageTitle}>
              Faça a diferença no mundo
            </div>
            <div className={styles.imageSubtitle}>
              Conecte-se com oportunidades de voluntariado que transformam vidas
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}