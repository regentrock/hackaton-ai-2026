'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEffect, useState } from 'react';
import styles from './page.module.css';
import FloatingChatButton from '../components/OrchestrateChat/FloatingChatButton';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    volunteers: 0,
    organizations: 0,
    matches: 0,
    hours: 0
  });

  useEffect(() => {
    setStats({
      volunteers: 15234,
      organizations: 1250,
      matches: 8750,
      hours: 42500
    });
  }, []);

  const handleGetStarted = () => {
    if (user) {
      router.push('/matches');
    } else {
      router.push('/register');
    }
  };

  const handleLogin = () => {
    router.push('/login');
  };

  return (
    <div className={styles.homepage}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContainer}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <i className="fas fa-microchip"></i>
              <span>Inteligência Artificial</span>
            </div>
            <h1 className={styles.heroTitle}>
              O voluntariado que<br />
              <span className={styles.heroHighlight}>combina com você</span>
            </h1>
            <p className={styles.heroDescription}>
              Conectamos suas habilidades e interesses às oportunidades de voluntariado 
              mais alinhadas ao seu perfil, potencializando seu impacto social.
            </p>
            <div className={styles.heroButtons}>
              <button onClick={handleGetStarted} className={styles.btnPrimary}>
                Começar agora
                <i className="fas fa-arrow-right"></i>
              </button>
              <button onClick={handleLogin} className={styles.btnSecondary}>
                Já tenho conta
              </button>
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <span className={styles.heroStatNumber}>+{stats.volunteers.toLocaleString()}</span>
                <span className={styles.heroStatLabel}>voluntários</span>
              </div>
              <div className={styles.heroStatDivider}></div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatNumber}>+{stats.organizations.toLocaleString()}</span>
                <span className={styles.heroStatLabel}>organizações</span>
              </div>
              <div className={styles.heroStatDivider}></div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatNumber}>{stats.matches.toLocaleString()}</span>
                <span className={styles.heroStatLabel}>matches</span>
              </div>
            </div>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.heroImageWrapper}>
              <img 
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=500&fit=crop"
                alt="Voluntários"
                className={styles.heroImage}
              />
              <div className={styles.floatingCard}>
                <i className="fas fa-check-circle"></i>
                <div>
                  <strong>Match encontrado</strong>
                  <span>Compatibilidade: 92%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Highlight */}
      <section className={styles.statsHighlight}>
        <div className={styles.container}>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <i className="fas fa-clock"></i>
              <div>
                <h3>{stats.hours.toLocaleString()}</h3>
                <p>horas de voluntariado</p>
              </div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.statItem}>
              <i className="fas fa-handshake"></i>
              <div>
                <h3>+{stats.organizations.toLocaleString()}</h3>
                <p>ONGs parceiras</p>
              </div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.statItem}>
              <i className="fas fa-brain"></i>
              <div>
                <h3>IA exclusiva</h3>
                <p>match inteligente</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Como funciona</span>
            <h2 className={styles.sectionTitle}>
              Tecnologia a favor do <span className={styles.titleHighlight}>bem</span>
            </h2>
            <p className={styles.sectionDescription}>
              Um processo simples e eficiente para conectar você às melhores oportunidades
            </p>
          </div>
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>01</div>
              <div className={styles.stepIcon}>
                <i className="fas fa-user-edit"></i>
              </div>
              <h3 className={styles.stepTitle}>Perfil completo</h3>
              <p className={styles.stepDescription}>
                Cadastre suas habilidades, experiências e disponibilidade de horário
              </p>
            </div>
            <div className={styles.stepArrow}>
              <i className="fas fa-arrow-right"></i>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>02</div>
              <div className={styles.stepIcon}>
                <i className="fas fa-chart-line"></i>
              </div>
              <h3 className={styles.stepTitle}>Análise inteligente</h3>
              <p className={styles.stepDescription}>
                Nossa IA processa seu perfil e encontra as melhores correspondências
              </p>
            </div>
            <div className={styles.stepArrow}>
              <i className="fas fa-arrow-right"></i>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>03</div>
              <div className={styles.stepIcon}>
                <i className="fas fa-heart"></i>
              </div>
              <h3 className={styles.stepTitle}>Impacto real</h3>
              <p className={styles.stepDescription}>
                Escolha a oportunidade e comece a transformar vidas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className={styles.features}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>Diferenciais</span>
            <h2 className={styles.sectionTitle}>
              Por que escolher a <span className={styles.titleHighlight}>VoluntaRe</span>
            </h2>
          </div>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <i className="fas fa-robot"></i>
              </div>
              <h3 className={styles.featureTitle}>Match por IA</h3>
              <p className={styles.featureDescription}>
                Algoritmos avançados que analisam seu perfil e encontram as oportunidades 
                mais alinhadas com suas habilidades
              </p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <i className="fas fa-chart-simple"></i>
              </div>
              <h3 className={styles.featureTitle}>Métricas de impacto</h3>
              <p className={styles.featureDescription}>
                Acompanhe o impacto real das suas contribuições e visualize sua jornada 
                de voluntariado
              </p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <i className="fas fa-certificate"></i>
              </div>
              <h3 className={styles.featureTitle}>Certificações</h3>
              <p className={styles.featureDescription}>
                Receba certificados de participação e valorize seu currículo com 
                experiências significativas
              </p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <i className="fas fa-shield-alt"></i>
              </div>
              <h3 className={styles.featureTitle}>Segurança e confiança</h3>
              <p className={styles.featureDescription}>
                Organizações verificadas e ambiente seguro para sua jornada de voluntariado
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Numbers */}
      <section className={styles.impact}>
        <div className={styles.impactContainer}>
          <div className={styles.impactLeft}>
            <div className={styles.impactBadge}>
              <i className="fas fa-chart-line"></i>
              <span>Impacto real</span>
            </div>
            <h2 className={styles.impactTitle}>
              Números que mostram a <span className={styles.titleHighlight}>diferença que fazemos</span>
            </h2>
            <p className={styles.impactDescription}>
              Cada conexão representa uma história de transformação. Veja o impacto 
              que nossa comunidade já alcançou.
            </p>
          </div>
          <div className={styles.impactRight}>
            <div className={styles.impactCard}>
              <div className={styles.impactNumber}>+{stats.volunteers.toLocaleString()}</div>
              <div className={styles.impactLabel}>voluntários ativos</div>
              <div className={styles.impactTrend}>
                <i className="fas fa-arrow-up"></i>
                <span>+23% este ano</span>
              </div>
            </div>
            <div className={styles.impactCard}>
              <div className={styles.impactNumber}>{stats.hours.toLocaleString()}</div>
              <div className={styles.impactLabel}>horas doadas</div>
              <div className={styles.impactTrend}>
                <i className="fas fa-arrow-up"></i>
                <span>+15% este mês</span>
              </div>
            </div>
            <div className={styles.impactCard}>
              <div className={styles.impactNumber}>{stats.matches.toLocaleString()}</div>
              <div className={styles.impactLabel}>conexões realizadas</div>
              <div className={styles.impactTrend}>
                <i className="fas fa-arrow-up"></i>
                <span>+42% este ano</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContainer}>
          <div className={styles.ctaIcon}>
            <i className="fas fa-hand-peace"></i>
          </div>
          <h2 className={styles.ctaTitle}>Junte-se a essa corrente do bem</h2>
          <p className={styles.ctaDescription}>
            Milhares de pessoas já estão transformando vidas através do voluntariado. 
            Sua jornada começa agora.
          </p>
          <button onClick={handleGetStarted} className={styles.btnPrimary}>
            Criar conta gratuitamente
            <i className="fas fa-arrow-right"></i>
          </button>
          <p className={styles.ctaNote}>✓ Sem compromisso • ✓ 100% gratuito • ✓ Cancelamento a qualquer momento</p>
        </div>
      </section>
      <FloatingChatButton/>
    </div>
  );
}