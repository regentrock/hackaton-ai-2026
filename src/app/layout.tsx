import { AuthProvider } from '@/src/contexts/AuthContext';
import type { Metadata } from 'next';
import Navbar from '@/src/components/Navbar/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoluntaRe - Conectando pessoas a causas que reconstroem vidas',
  description: 'Plataforma de voluntariado com inteligência artificial para conectar você às melhores oportunidades de fazer a diferença.',
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
          <main style={{ paddingTop: '70px' }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}