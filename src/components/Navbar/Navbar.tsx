// components/Navbar/Navbar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/src/contexts/AuthContext';
import { openChat } from '@/src/lib/chatUtils';
import styles from './Navbar.module.css';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
    setIsMenuOpen(false);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleOpenAssistant = (e: React.MouseEvent) => {
    e.preventDefault();
    openChat();
    closeMenu();
  };

  // Links para usuário logado
  const loggedInLinks = [
    { href: '/', label: 'Início', external: false },
    { href: '/matches', label: 'Oportunidades', external: false },
    { href: '#', label: 'Assistente IA', external: true, onClick: handleOpenAssistant },
    { href: '/dashboard', label: 'Perfil', external: false },
  ];

  // Links para usuário não logado
  const loggedOutLinks = [
    { href: '/', label: 'Início', external: false },
    { href: '/login', label: 'Entrar', external: false },
    { href: '/register', label: 'Cadastrar', external: false },
  ];

  const links = user ? loggedInLinks : loggedOutLinks;

  const renderLink = (link: any) => {
    if (link.external) {
      return (
        <a
          key={link.label}
          href={link.href}
          onClick={link.onClick}
          className={styles.navLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      );
    }
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`${styles.navLink} ${pathname === link.href ? styles.active : ''}`}
        onClick={closeMenu}
      >
        {link.label}
      </Link>
    );
  };

  const renderMobileLink = (link: any) => {
    if (link.external) {
      return (
        <a
          key={link.label}
          href={link.href}
          onClick={(e) => {
            link.onClick(e);
            closeMenu();
          }}
          className={styles.mobileNavLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      );
    }
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`${styles.mobileNavLink} ${pathname === link.href ? styles.active : ''}`}
        onClick={closeMenu}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.navbarContainer}>
        {/* Logo */}
        <Link href="/" className={styles.logo} onClick={closeMenu}>
          <Image 
            src="/logo.png" 
            alt="VoluntaRe" 
            width={140} 
            height={48}
            className={styles.logoImage}
            priority
          />
        </Link>

        {/* Desktop Menu */}
        <div className={styles.desktopMenu}>
          {links.map((link) => renderLink(link))}
          
          {user && (
            <button onClick={handleLogout} className={styles.logoutButton}>
              <i className="fas fa-sign-out-alt" style={{ marginRight: '0.5rem' }}></i>
              Sair
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button 
          className={`${styles.menuButton} ${isMenuOpen ? styles.open : ''}`} 
          onClick={toggleMenu}
          aria-label="Menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Mobile Menu Overlay */}
        <div 
          className={`${styles.mobileOverlay} ${isMenuOpen ? styles.show : ''}`} 
          onClick={closeMenu}
        />

        {/* Mobile Menu */}
        <div className={`${styles.mobileMenu} ${isMenuOpen ? styles.show : ''}`}>
          <div className={styles.mobileMenuHeader}>
            <div className={styles.mobileLogo}>
              <Image 
                src="/logo.png" 
                alt="VoluntaRe" 
                width={110} 
                height={40}
                className={styles.mobileLogoImage}
              />
            </div>
            <button className={styles.closeButton} onClick={closeMenu}>✕</button>
          </div>
          
          <div className={styles.mobileMenuLinks}>
            {links.map((link) => renderMobileLink(link))}
            
            {user && (
              <button onClick={handleLogout} className={styles.mobileLogoutButton}>
                <i className="fas fa-sign-out-alt" style={{ marginRight: '0.5rem' }}></i>
                Sair
              </button>
            )}
          </div>
          
          {user && (
            <div className={styles.mobileUserInfo}>
              <div className={styles.userAvatar}>
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}