import { AuthProvider } from '@/src/contexts/AuthContext';
import type { Metadata, Viewport } from 'next';
import Navbar from '@/src/components/Navbar/Navbar';
import Footer from '@/src/components/Footer/Footer';
import './globals.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

export const metadata: Metadata = {
  title: 'VoluntaRe - Conectando pessoas a causas que reconstroem vidas',
  description: 'Plataforma de voluntariado com inteligência artificial para conectar você às melhores oportunidades de fazer a diferença.',
  icons: {
    icon: [
      { url: '/logo-icon.png', sizes: 'any' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: '/logo-icon.png',
    apple: '/logo-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'VoluntaRe - Plataforma de Voluntariado com IA',
    description: 'Conectamos voluntários a causas que transformam vidas usando inteligência artificial.',
    url: 'https://hackaton-ai-2026.vercel.app',
    siteName: 'VoluntaRe',
    images: [
      {
        url: '/logo-icon.png',
        width: 512,
        height: 512,
        alt: 'VoluntaRe Logo',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VoluntaRe - Plataforma de Voluntariado com IA',
    description: 'Conectamos voluntários a causas que transformam vidas usando inteligência artificial.',
    images: ['/logo-icon.png'],
  },
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
      <head>
        <link rel="icon" href="/logo-icon.png" type="image/png" />
        <link rel="shortcut icon" href="/logo-icon.png" />
        <link rel="apple-touch-icon" href="/logo-icon.png" />
      </head>
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