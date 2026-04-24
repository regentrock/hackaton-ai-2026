'use client';

import { useEffect, useState } from 'react';

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatches() {
      try {
        // =========================
        // 1. pegar token
        // =========================
        const token = localStorage.getItem("token");

        if (!token) {
          setError("User not authenticated");
          setLoading(false);
          return;
        }

        // =========================
        // 2. chamar API com auth
        // =========================
        const res = await fetch(
          'https://hackaton-ai-2026.vercel.app/api/match',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // =========================
        // 3. tratar erro de backend
        // =========================
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch matches");
        }

        // =========================
        // 4. agora é JSON direto (sem gambiarra)
        // =========================
        const data = await res.json();

        setMatches(data);

      } catch (err: any) {
        console.error("ERROR:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, []);

  // =========================
  // UI STATES
  // =========================
  if (loading) return <p>Finding the best opportunities for you...</p>;

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Volunteer Opportunities for You</h1>

      {matches.length === 0 && (
        <p>No opportunities found.</p>
      )}

      {matches.map((match, index) => (
        <div
          key={index}
          style={{
            border: '1px solid #ccc',
            padding: 15,
            marginTop: 10,
            borderRadius: 8,
          }}
        >
          <h2>{match.title}</h2>
          <p><strong>Location:</strong> {match.location}</p>
          <p>{match.reason}</p>
        </div>
      ))}
    </div>
  );
}