import { AuthProvider } from '@/src/contexts/AuthContext';
import type { Metadata, Viewport } from 'next';
import Navbar from '@/src/components/Navbar/Navbar';
import Footer from '@/src/components/Footer/Footer';
import './globals.css';

import '@fortawesome/fontawesome-free/css/all.min.css';

export const metadata: Metadata = {
  title: 'VoluntaRe - Conectando pessoas a causas que reconstroem vidas',
  description: 'Plataforma de voluntariado com inteligência artificial para conectar você às melhores oportunidades de fazer a diferença.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <Navbar />
          <main style={{ marginTop: '4rem' }}>
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}