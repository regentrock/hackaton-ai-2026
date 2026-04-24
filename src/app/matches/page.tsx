'use client';

import { useEffect, useState } from 'react';

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMatches() {
      try {
        const res = await fetch(
          'https://hackaton-ai-2026.vercel.app/api/match'
        );

        const text = await res.text();
        console.log("RAW:", text);

        const cleaned = text.replace("Valid JSON:", "").trim();
        const data = JSON.parse(cleaned);

        setMatches(data);
      } catch (error) {
        console.error("ERROR:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, []);

  if (loading) return <p>Loading matches...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Volunteer Opportunities for You</h1>

      {matches.map((match, index) => (
        <div key={index}>
          <h2>{match.title}</h2>
          <p>{match.location}</p>
          <p>{match.reason}</p>
        </div>
      ))}
    </div>
  );
}