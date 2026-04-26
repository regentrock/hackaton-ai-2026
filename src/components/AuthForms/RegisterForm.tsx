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
      setError(''); // Limpa erro ao adicionar skill
    }
  };

  const removeSkill = (skill: string) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter(s => s !== skill)
    });
    setError(''); // Limpa erro ao remover skill
  };

  const validateSkills = (): boolean => {
    if (formData.skills.length < 3) {
      setError(`Você precisa adicionar pelo menos 3 habilidades. Atualmente: ${formData.skills.length}/3`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validar habilidades antes de enviar
    if (!validateSkills()) {
      return;
    }
    
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

  const skillsRemaining = 3 - formData.skills.length;

  return (
    <div className={styles.authWrapper}>
      <div className={styles.splitLayout}>
        <div className={styles.formSide}>
          <form onSubmit={handleSubmit} className={styles.container}>
            <h2 className={styles.title}>Crie sua conta</h2>
            <p className={styles.subtitle}>
              Junte-se a milhares de voluntários e comece a fazer a diferença
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
              <label className={styles.label}>
                Habilidades * 
                <span style={{ 
                  fontSize: '0.7rem', 
                  color: formData.skills.length >= 3 ? '#22c55e' : '#e53e3e',
                  marginLeft: '0.5rem'
                }}>
                  ({formData.skills.length}/3 mínimo)
                </span>
              </label>
              
              {/* Contador visual de habilidades restantes */}
              {skillsRemaining > 0 && formData.skills.length > 0 && (
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: '#f59e0b', 
                  marginBottom: '0.5rem' 
                }}>
                  Faltam {skillsRemaining} habilidade{skillsRemaining !== 1 ? 's' : ''} para o mínimo
                </div>
              )}
              
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
                  className={styles.addButton}
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
              {formData.skills.length === 0 && (
                <p style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.5rem' }}>
                  ⚠️ Adicione pelo menos 3 habilidades para encontrar as melhores oportunidades
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.primaryButton}
              style={{
                opacity: formData.skills.length < 3 ? 0.6 : 1,
                cursor: formData.skills.length < 3 ? 'not-allowed' : 'pointer'
              }}
              title={formData.skills.length < 3 ? `Adicione mais ${skillsRemaining} habilidade(s)` : ''}
            >
              {loading ? 'Criando conta...' : 'Criar conta gratuitamente'}
            </button>

            <div className={styles.divider}>ou</div>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className={styles.secondaryButton}
            >
              Já tenho uma conta
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
              Comece sua jornada de voluntariado
            </div>
            <div className={styles.imageSubtitle}>
              Ao se cadastrar, você terá acesso a oportunidades exclusivas
            </div>
            
            <ul className={styles.statList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span>+15.000 voluntários ativos</span>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span>Match inteligente com IA</span>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span>Oportunidades personalizadas</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}