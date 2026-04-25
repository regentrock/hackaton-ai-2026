'use client';

import Link from 'next/link';
import Image from 'next/image';
import styles from './Footer.module.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.mainFooter}>
          {/* Logo e descrição */}
          <div className={styles.brandSection}>
            <div className={styles.logo}>
              <Image 
                src="/logo.png" 
                alt="VoluntaRe" 
                width={140} 
                height={48}
                className={styles.logoImage}
              />
            </div>
            <p className={styles.description}>
              Conectando pessoas a causas que reconstroem vidas. 
              Nossa IA transforma suas habilidades em ajuda real para quem mais precisa.
            </p>
            <div className={styles.socialLinks}>
              <a href="#" className={styles.socialLink} aria-label="Instagram">
                <i className="fab fa-instagram"></i>
              </a>
              <a href="#" className={styles.socialLink} aria-label="Facebook">
                <i className="fab fa-facebook-f"></i>
              </a>
              <a href="#" className={styles.socialLink} aria-label="LinkedIn">
                <i className="fab fa-linkedin-in"></i>
              </a>
              <a href="#" className={styles.socialLink} aria-label="Twitter">
                <i className="fab fa-twitter"></i>
              </a>
            </div>
          </div>

          {/* Links rápidos */}
          <div className={styles.linksSection}>
            <h3 className={styles.sectionTitle}>Navegação</h3>
            <ul className={styles.linksList}>
              <li><Link href="/">Início</Link></li>
              <li><Link href="/matches">Oportunidades</Link></li>
              <li><Link href="/dashboard">Perfil</Link></li>
            </ul>
          </div>

          {/* Para organizações */}
          <div className={styles.linksSection}>
            <h3 className={styles.sectionTitle}>Para organizações</h3>
            <ul className={styles.linksList}>
              <li><Link href="/login">Anunciar vagas</Link></li>
              <li><Link href="/login">Encontrar voluntários</Link></li>
              <li><Link href="/login">Recursos para ONGs</Link></li>
            </ul>
          </div>

          {/* Contato */}
          <div className={styles.contactSection}>
            <h3 className={styles.sectionTitle}>Contato</h3>
            <ul className={styles.contactList}>
              <li>
                <i className="fas fa-envelope"></i>
                <span>contato@voluntare.com</span>
              </li>
              <li>
                <i className="fas fa-phone"></i>
                <span>(11) 99999-9999</span>
              </li>
              <li>
                <i className="fas fa-map-marker-alt"></i>
                <span>São Paulo, SP - Brasil</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter */}
        <div className={styles.newsletter}>
          <div className={styles.newsletterContent}>
            <div className={styles.newsletterText}>
              <i className="fas fa-envelope-open-text"></i>
              <div>
                <h4>Receba novidades</h4>
                <p>Fique por dentro das novas oportunidades e recursos</p>
              </div>
            </div>
            <form className={styles.newsletterForm}>
              <input 
                type="email" 
                placeholder="Seu melhor e-mail"
                className={styles.newsletterInput}
              />
              <button type="submit" className={styles.newsletterButton}>
                Inscrever-se
                <i className="fas fa-arrow-right"></i>
              </button>
            </form>
          </div>
        </div>

        {/* Footer bottom */}
        <div className={styles.bottomBar}>
          <p className={styles.copyright}>
            © {currentYear} VoluntaRe. Todos os direitos reservados.
          </p>
          <div className={styles.bottomLinks}>
            <Link href="#">Política de Privacidade</Link>
            <span className={styles.separator}>|</span>
            <Link href="#">Termos de Uso</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}