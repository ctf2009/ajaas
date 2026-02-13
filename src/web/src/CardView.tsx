import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { launchConfetti } from './confetti';
import './CardView.css';

type CardType = 'awesome' | 'weekly' | 'random' | 'animal' | 'absurd' | 'meta' | 'unexpected';

function getApiEndpoint(type: string, name: string): string {
  const encoded = encodeURIComponent(name);
  switch (type) {
    case 'awesome':
    case 'weekly':
    case 'random':
      return `/api/${type}/${encoded}`;
    default:
      return `/api/message/${type}/${encoded}`;
  }
}

const typeLabels: Record<CardType, string> = {
  awesome: 'Simple',
  weekly: 'Weekly',
  random: 'Random',
  animal: 'Animal',
  absurd: 'Absurd',
  meta: 'Meta',
  unexpected: 'Unexpected',
};

function CardView() {
  const { type, name } = useParams<{ type: string; name: string }>();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const showConfetti = searchParams.get('confetti') === 'true';

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiFired = useRef(false);

  const validTypes: CardType[] = ['awesome', 'weekly', 'random', 'animal', 'absurd', 'meta', 'unexpected'];
  const isValidType = validTypes.includes(type as CardType);

  const fetchMessage = useCallback(async () => {
    if (!type || !name || !isValidType) return;

    setLoading(true);
    setError(false);
    try {
      const url = new URL(getApiEndpoint(type, name), window.location.origin);
      if (from) url.searchParams.set('from', from);
      if (type === 'weekly') {
        url.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
      }

      const res = await fetch(url);
      const data = await res.json();
      setMessage(data.message || null);
      if (!data.message) setError(true);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [type, name, from, isValidType]);

  useEffect(() => {
    fetchMessage();
  }, [fetchMessage]);

  useEffect(() => {
    if (!showConfetti || !message || confettiFired.current || !canvasRef.current) return;
    confettiFired.current = true;
    const cleanup = launchConfetti(canvasRef.current);
    return cleanup;
  }, [showConfetti, message]);

  if (!type || !name || !isValidType) {
    return (
      <div className="card-page">
        <div className="card-container">
          <div className="card">
            <p className="card-error">
              {!isValidType && type
                ? `Unknown message type: "${type}"`
                : 'Invalid card link.'}
            </p>
            <p className="card-error-hint">
              Try: /card/awesome/YourName
            </p>
          </div>
          <div className="card-actions">
            <Link to="/">Create your own</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-page">
      {showConfetti && <canvas ref={canvasRef} className="confetti-canvas" />}
      <div className="card-container">
        <div className={`card ${!loading && !error ? 'card-visible' : ''}`}>
          {loading && <p className="card-loading">Generating your message...</p>}

          {error && !loading && (
            <>
              <p className="card-error">Could not generate a message right now.</p>
              <button className="card-retry" onClick={fetchMessage}>
                Try again
              </button>
            </>
          )}

          {message && !loading && (
            <>
              <p className="card-greeting">Hey {decodeURIComponent(name)},</p>
              <p className="card-message">{message}</p>
              {from && <p className="card-from">&mdash; from {from}</p>}
            </>
          )}
        </div>

        {!loading && (
          <div className="card-meta">
            <span className="card-type">{typeLabels[type as CardType]}</span>
          </div>
        )}

        <div className="card-actions">
          <button className="card-action-link" onClick={fetchMessage} disabled={loading}>
            Get another message
          </button>
          <Link to="/">Send your own</Link>
        </div>

        <p className="card-branding">
          Powered by <Link to="/">AJaaS</Link>
        </p>
      </div>
    </div>
  );
}

export default CardView;
