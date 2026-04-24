'use client';

import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl mb-4">Bem-vindo, {user.name}!</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Localização:</strong> {user.location || 'Não informada'}</p>
        <p><strong>Disponibilidade:</strong> {user.availability || 'Não informada'}</p>
        <p><strong>Descrição:</strong> {user.description || 'Não informada'}</p>
        <p><strong>Habilidades:</strong> {user.skills.join(', ') || 'Nenhuma'}</p>
        <button
          onClick={logout}
          className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Sair
        </button>
      </div>
    </div>
  );
}