// page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import { useEffect, useState } from 'react';
import styles from './page.module.css';
import FloatingChatButton from '../components/OrchestrateChat/FloatingChatButton';

interface GlobalGivingStats {
  totalProjects: number;
  totalOrganizations: number;
  countriesReached: number;
  totalDonations: number;
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<GlobalGivingStats>({
    totalProjects: 0,
    totalOrganizations: 0,
    countriesReached: 0,
    totalDonations: 0
  });

  useEffect(() => {
    setStats({
      totalProjects: 25000,
      totalOrganizations: 5246,
      countriesReached: 175,
      totalDonations: 650
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
      <div className={styles.welcomeArea} id="welcome">
        <div className={styles.headerText}>
          <div className={styles.container}>
            <div className={styles.row}>
              <div className={styles.leftText}>
                <h1>
                  Transforme vidas através <br />
                  do <span>voluntariado</span>
                </h1>
                <p>
                  Conectamos suas habilidades às melhores oportunidades de voluntariado 
                  em organizações verificadas globalmente com tecnologia de ponta.
                </p>
                <div className={styles.buttons}>
                  <button onClick={handleGetStarted} className={styles.mainButtonSlider}>
                    Começar agora
                  </button>
                  <button onClick={handleLogin} className={styles.secondaryButton}>
                    Já tenho conta
                  </button>
                </div>
                <div className={styles.heroStats}>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatNumber}>{stats.totalOrganizations.toLocaleString()}</span>
                    <span className={styles.heroStatLabel}>Organizações</span>
                  </div>
                  <div className={styles.heroStatDivider}></div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatNumber}>{stats.countriesReached}</span>
                    <span className={styles.heroStatLabel}>Países</span>
                  </div>
                  <div className={styles.heroStatDivider}></div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatNumber}>{stats.totalProjects.toLocaleString()}+</span>
                    <span className={styles.heroStatLabel}>Projetos</span>
                  </div>
                </div>
              </div>
              <div className={styles.rightImage}>
                <img 
                  src="https://media.istockphoto.com/id/941191996/photo/flood-preparation-in-the-okanagan.jpg?s=612x612&w=0&k=20&c=vFFdJwezZkyRI6Wnwg3SP9uZ22F6PLhzpQ2YaQwPpWo="
                  alt="Voluntários ajudando comunidade"
                  className={styles.heroImage}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About Section 1 */}
      <section className={styles.about} id="about">
        <div className={styles.container}>
          <div className={styles.row}>
            <div className={styles.leftImage}>
              <img src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=500&h=400&fit=crop" alt="Voluntário" className={styles.aboutImage} />
            </div>
            <div className={styles.rightText}>
              <h5>Conectando pessoas a causas que transformam vidas</h5>
              <p>
                Nossa plataforma utiliza inteligência artificial para conectar voluntários 
                às oportunidades mais alinhadas às suas habilidades e interesses. 
                Acreditamos que o voluntariado deve ser uma experiência enriquecedora 
                tanto para quem doa tempo quanto para quem recebe ajuda.
              </p>
              <div className={styles.statsGrid}>
                <div className={styles.statBox}>
                  <div className={styles.statNumber}>{stats.totalOrganizations.toLocaleString()}</div>
                  <div className={styles.statLabel}>ONGs parceiras</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNumber}>{stats.countriesReached}</div>
                  <div className={styles.statLabel}>Países atendidos</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNumber}>${stats.totalDonations}M</div>
                  <div className={styles.statLabel}>em impacto</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section 2 - Features */}
      <section className={styles.about2} id="about2">
        <div className={styles.container}>
          <div className={styles.row}>
            <div className={styles.leftText}>
              <h5>Tecnologia a favor do bem social</h5>
              <p>
                Combinamos o poder da IBM WatsonX com uma curadoria especializada 
                para oferecer as melhores oportunidades de voluntariado.
              </p>
              <ul>
                <li>
                  <i className="fas fa-brain"></i>
                  <div className={styles.text}>
                    <h6>Match Inteligente</h6>
                    <p>Algoritmos avançados que analisam perfil, habilidades e disponibilidade.</p>
                  </div>
                </li>
                <li>
                  <i className="fas fa-chart-line"></i>
                  <div className={styles.text}>
                    <h6>Score de Compatibilidade</h6>
                    <p>Avaliação precisa do alinhamento entre você e as oportunidades.</p>
                  </div>
                </li>
                <li>
                  <i className="fas fa-sync-alt"></i>
                  <div className={styles.text}>
                    <h6>Aprendizado Contínuo</h6>
                    <p>O sistema melhora constantemente suas recomendações.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className={styles.rightImage}>
              <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=500&h=400&fit=crop" alt="Tecnologia" className={styles.aboutImage} />
            </div>
          </div>
        </div>
      </section>

      {/* Services / Features Section */}
      <section className={styles.services} id="services">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <h2>Por que escolher a <span>VoluntaRe</span></h2>
            <p>Diferenciais que fazem a diferença na sua jornada de voluntariado</p>
          </div>
          <div className={styles.servicesGrid}>
            <div className={styles.serviceItem}>
              <div className={styles.icon}>
                <i className="fas fa-microchip"></i>
              </div>
              <h5 className={styles.serviceTitle}>IA WatsonX</h5>
              <p>Tecnologia de ponta da IBM para matches mais precisos e personalizados.</p>
              <div className={styles.serviceMetric}>Precisão de 94%</div>
            </div>
            <div className={styles.serviceItem}>
              <div className={styles.icon}>
                <i className="fas fa-shield-alt"></i>
              </div>
              <h5 className={styles.serviceTitle}>Organizações Verificadas</h5>
              <p>100% das organizações parceiras passam por rigoroso processo de verificação.</p>
              <div className={styles.serviceMetric}>+5.000 ONGs</div>
            </div>
            <div className={styles.serviceItem}>
              <div className={styles.icon}>
                <i className="fas fa-globe"></i>
              </div>
              <h5 className={styles.serviceTitle}>Impacto Global</h5>
              <p>Conectamos voluntários a projetos em mais de 175 países ao redor do mundo.</p>
              <div className={styles.serviceMetric}>175+ países</div>
            </div>
          </div>
        </div>
      </section>

      {/* GlobalGiving Stats Section */}
      <section className={styles.globalStats}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <h2>Dados <span>Globais</span></h2>
            <p>Rede GlobalGiving em números</p>
          </div>
          <div className={styles.globalStatsGrid}>
            <div className={styles.globalStatItem}>
              <div className={styles.globalStatNumber}>${stats.totalDonations}M+</div>
              <div className={styles.globalStatLabel}>em doações facilitadas</div>
            </div>
            <div className={styles.globalStatItem}>
              <div className={styles.globalStatNumber}>{stats.countriesReached}</div>
              <div className={styles.globalStatLabel}>países e territórios</div>
            </div>
            <div className={styles.globalStatItem}>
              <div className={styles.globalStatNumber}>{stats.totalOrganizations.toLocaleString()}</div>
              <div className={styles.globalStatLabel}>organizações verificadas</div>
            </div>
            <div className={styles.globalStatItem}>
              <div className={styles.globalStatNumber}>{stats.totalProjects.toLocaleString()}+</div>
              <div className={styles.globalStatLabel}>projetos ativos</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.container}>
          <div className={styles.ctaContent}>
            <div className={styles.ctaIcon}>
              <i className="fas fa-hand-peace"></i>
            </div>
            <h2>Pronto para transformar vidas?</h2>
            <p>
              Junte-se a milhares de voluntários que já estão fazendo a diferença 
              através da nossa plataforma.
            </p>
            <button onClick={handleGetStarted} className={styles.mainButton}>
              Criar conta gratuitamente
            </button>
            <div className={styles.ctaNote}>Cadastro gratuito • Sem compromisso • Comece agora</div>
          </div>
        </div>
      </section>

      <FloatingChatButton />
    </div>
  );
}