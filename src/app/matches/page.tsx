'use client';

import { useEffect, useState } from 'react';

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatches() {
      try {
        const res = await fetch(
          'https://hackaton-ai-2026.vercel.app/api/match',
          {
            credentials: 'include', // 🔥 ESSENCIAL
          }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch matches");
        }

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