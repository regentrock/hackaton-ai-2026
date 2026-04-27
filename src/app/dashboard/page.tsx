'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './page.module.css';
import FloatingChatButton from '@/src/components/OrchestrateChat/FloatingChatButton';
import SavedOpportunities from '@/src/components/SavedOpportunities/SavedOpportunities';

export default function DashboardPage() {
  const { user, loading, logout, updateUser } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    availability: '',
    description: '',
    skills: [] as string[]
  });
  const [skillInput, setSkillInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user) {
      setFormData({
        name: user.name || '',
        location: user.location || '',
        availability: user.availability || '',
        description: user.description || '',
        skills: user.skills || []
      });
    }
  }, [user, loading, router]);

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

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      await updateUser({
        name: formData.name,
        location: formData.location,
        availability: formData.availability,
        description: formData.description,
        skills: formData.skills
      });
      
      setSuccess('Perfil atualizado com sucesso');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const getInitials = (name: string) => {
    return name ? name.charAt(0).toUpperCase() : 'U';
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const initials = getInitials(user.name);

  return (
    <>
      <div className={styles.page}>

        {/* Notificações */}
        {error && (
          <div className={styles.errorNotification}>
            <i className="fas fa-exclamation-circle"></i>
            <p>{error}</p>
            <button onClick={() => setError('')} className={styles.closeNotification}>×</button>
          </div>
        )}
        {success && (
          <div className={styles.successNotification}>
            <i className="fas fa-check-circle"></i>
            <p>{success}</p>
            <button onClick={() => setSuccess('')} className={styles.closeNotification}>×</button>
          </div>
        )}

        {/* Profile Header */}
        <div className={styles.profileHeader}>
          <div className={styles.headerContent}>
            <div className={styles.headerLeft}>
              <div className={styles.avatar}>{initials}</div>
              <div className={styles.userInfo}>
                <h1>{user.name}</h1>
                <p>
                  {user.skills && user.skills.length > 0 
                    ? user.skills.slice(0, 2).join(' • ')
                    : 'Adicione habilidades ao seu perfil'}
                </p>
              </div>
            </div>
            <button 
              className={styles.editButton}
              onClick={() => {
                setIsEditing(!isEditing);
                setError('');
                setSuccess('');
              }}
            >
              <i className="fas fa-pen" style={{ marginRight: '0.5rem' }}></i>
              {isEditing ? 'Cancelar' : 'Editar perfil'}
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className={styles.mainGrid}>
          {/* Main Content */}
          <div className={styles.profileCard}>
            {!isEditing ? (
              <>
                {/* Informações Pessoais */}
                <div className={styles.cardSection}>
                  <h3 className={styles.sectionTitle}>INFORMAÇÕES</h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <div className={styles.infoIcon}>
                        <i className="fas fa-envelope"></i>
                      </div>
                      <div className={styles.infoContent}>
                        <div className={styles.infoLabel}>Email</div>
                        <div className={styles.infoValue}>{user.email}</div>
                      </div>
                    </div>
                    <div className={styles.infoItem}>
                      <div className={styles.infoIcon}>
                        <i className="fas fa-map-marker-alt"></i>
                      </div>
                      <div className={styles.infoContent}>
                        <div className={styles.infoLabel}>Localização</div>
                        <div className={styles.infoValue}>{user.location || 'Não informada'}</div>
                      </div>
                    </div>
                    <div className={styles.infoItem}>
                      <div className={styles.infoIcon}>
                        <i className="fas fa-clock"></i>
                      </div>
                      <div className={styles.infoContent}>
                        <div className={styles.infoLabel}>Disponibilidade</div>
                        <div className={styles.infoValue}>{user.availability || 'Não informada'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sobre */}
                <div className={styles.cardSection}>
                  <h3 className={styles.sectionTitle}>SOBRE</h3>
                  {user.description ? (
                    <p className={styles.descriptionText}>{user.description}</p>
                  ) : (
                    <p className={styles.descriptionEmpty}>Nenhuma descrição adicionada</p>
                  )}
                </div>

                {/* Habilidades */}
                <div className={styles.cardSection}>
                  <h3 className={styles.sectionTitle}>HABILIDADES</h3>
                  {user.skills && user.skills.length > 0 ? (
                    <div className={styles.skillsContainer}>
                      {user.skills.map((skill: string, i: number) => (
                        <span key={i} className={styles.skillBadge}>{skill}</span>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptySkills}>Nenhuma habilidade adicionada</p>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.editForm}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nome completo</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Localização</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="Cidade, Estado"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Disponibilidade</label>
                  <input
                    type="text"
                    name="availability"
                    value={formData.availability}
                    onChange={handleChange}
                    placeholder="Ex: Finais de semana"
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Sobre você</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Conte sua experiência e motivações..."
                    className={styles.formTextarea}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Habilidades</label>
                  <div className={styles.skillInputWrapper}>
                    <input
                      type="text"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                      placeholder="Digite uma habilidade"
                      className={styles.formInput}
                    />
                    <button type="button" onClick={addSkill} className={styles.addSkillBtn}>
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>
                  <div className={styles.editSkillsList}>
                    {formData.skills.map((skill, i) => (
                      <span key={i} className={styles.editSkillItem}>
                        {skill}
                        <button type="button" onClick={() => removeSkill(skill)} className={styles.removeSkillIcon}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button onClick={handleSave} disabled={isSaving} className={styles.saveBtn}>
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => setIsEditing(false)} className={styles.cancelBtn}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={styles.sidebar}>
            {/* Ações */}
            <div className={styles.actionsCard}>
              <h3 className={styles.actionsTitle}>AÇÕES RÁPIDAS</h3>
              <div className={styles.actionsList}>
                <button 
                  className={`${styles.actionBtn} ${styles.primaryAction}`}
                  onClick={() => router.push('/matches')}
                >
                  <i className="fas fa-search"></i>
                  Encontrar oportunidades
                </button>
                <button 
                  className={styles.actionBtn}
                  onClick={logout}
                >
                  <i className="fas fa-sign-out-alt"></i>
                  Sair da conta
                </button>
              </div>
            </div>

            {/* Membro desde */}
            <div className={styles.memberCard}>
              <div className={styles.memberIcon}>
                <i className="fas fa-calendar-alt"></i>
              </div>
              <div className={styles.memberLabel}>MEMBRO DESDE</div>
              <div className={styles.memberDate}>{formatDate(user.createdAt)}</div>
            </div>
          </div>

          <SavedOpportunities/>
        </div>
      </div>
      <FloatingChatButton/>
    </>
  );
}