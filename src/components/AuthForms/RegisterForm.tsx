'use client';

import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './AuthForms.module.css';

interface AuthError {
  message: string;
}

interface FormData {
  email: string;
  password: string;
  name: string;
  location: string;
  availability: string;
  description: string;
  skills: string[];
}

export default function RegisterForm() {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    name: '',
    location: '',
    availability: '',
    description: '',
    skills: []
  });
  const [skillInput, setSkillInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const addSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData({
        ...formData,
        skills: [...formData.skills, skillInput.trim()]
      });
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter(s => s !== skill)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(formData);
      router.push('/dashboard');
    } catch (err: unknown) {
      const authError = err as AuthError;
      setError(authError.message || 'Erro ao fazer cadastro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.container}>
      <h2 className={styles.title}>Crie sua conta 🚀</h2>
      <p className={styles.subtitle}>
        Junte-se a milhares de voluntários e comece a fazer a diferença hoje mesmo
      </p>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <div className={styles.group}>
        <label className={styles.label}>Nome completo *</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="Digite seu nome completo"
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Email *</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="seu@email.com"
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Senha * (mínimo 6 caracteres)</label>
        <input
          type="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          minLength={6}
          placeholder="Crie uma senha segura"
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Localização</label>
        <input
          type="text"
          name="location"
          value={formData.location}
          onChange={handleChange}
          placeholder="Cidade, Estado"
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Disponibilidade</label>
        <input
          type="text"
          name="availability"
          value={formData.availability}
          onChange={handleChange}
          placeholder="Ex: Finais de semana, Segunda a Sexta..."
          className={styles.input}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Sobre você</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          placeholder="Conte um pouco sobre sua experiência e motivações..."
          className={styles.textarea}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Habilidades</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
            placeholder="Ex: Comunicação, Ensino, Design..."
            className={styles.input}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={addSkill}
            className={styles.secondaryButton}
            style={{ width: 'auto', padding: '10px 16px' }}
          >
            Adicionar
          </button>
        </div>
        <div className={styles.skillsContainer}>
          {formData.skills.map((skill) => (
            <span key={skill} className={styles.skill}>
              {skill}
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                className={styles.removeSkill}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className={styles.primaryButton}
      >
        {loading ? 'Criando conta...' : 'Criar conta gratuitamente'}
      </button>

      <div className={styles.footerText}>
        Já tem uma conta?{' '}
        <button
          type="button"
          onClick={() => router.push('/login')}
          className={styles.linkButton}
        >
          Faça login aqui
        </button>
      </div>
    </form>
  );
}