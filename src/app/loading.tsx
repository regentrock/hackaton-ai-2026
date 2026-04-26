export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '3px solid #e2e8f0',
        borderTopColor: '#b02629',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}