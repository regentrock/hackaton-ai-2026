'use client';

import { useEffect, useState } from 'react';

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMatches() {
      const res = await fetch('/api/match');
      const data = await res.json();

      // ⚠️ depende do formato que o Orchestrate retorna
      setMatches(data.matches || []);
      setLoading(false);
    }

    fetchMatches();
  }, []);

  if (loading) return <p>Loading matches...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Best Volunteer Opportunities</h1>

      {matches.map((match, index) => (
        <div
          key={index}
          style={{
            border: '1px solid #ccc',
            padding: 16,
            marginBottom: 12,
            borderRadius: 8,
          }}
        >
          <h2>{match.title}</h2>
          <p><strong>Location:</strong> {match.location}</p>
          <p><strong>Why:</strong> {match.reason}</p>
        </div>
      ))}
    </div>
  );
}