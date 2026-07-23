'use client';

/**
 * Root error boundary — replaces the whole document when the root layout itself
 * throws (it sits ABOVE layout.tsx, so it must render its own <html>/<body> and
 * cannot rely on globals.css being applied). Styles are inlined to match the
 * slate/emerald theme without any external dependency.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
          color: '#e2e8f0',
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          Qipu
        </p>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 600, color: '#f1f5f9' }}>
          Une erreur est survenue
        </h1>
        <p style={{ margin: 0, maxWidth: '28rem', color: '#94a3b8' }}>
          Un problème inattendu est survenu. · Something went wrong.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '0.5rem',
            border: 0,
            borderRadius: '0.5rem',
            background: '#10b981',
            color: '#020617',
            padding: '0.65rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Réessayer · Try again
        </button>
        {error?.digest && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569' }}>Réf. {error.digest}</p>
        )}
      </body>
    </html>
  );
}
