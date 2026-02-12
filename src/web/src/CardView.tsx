import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import './CardView.css';

const CONFETTI_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];
const PARTICLE_COUNT = 80;
const DURATION_MS = 3500;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  isCircle: boolean;
  born: number;
}

function launchConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const start = performance.now();

  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 4 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      isCircle: Math.random() > 0.5,
      born: start,
    };
  });

  let frameId: number;

  function draw(now: number) {
    const elapsed = now - start;
    if (elapsed > DURATION_MS) {
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      const age = (now - p.born) / DURATION_MS;
      const opacity = Math.max(0, 1 - age * 1.2);
      if (opacity <= 0) continue;

      p.vy += 0.15; // gravity
      p.vx *= 0.99; // air resistance
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.globalAlpha = opacity;
      ctx!.fillStyle = p.color;

      if (p.isCircle) {
        ctx!.beginPath();
        ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }

      ctx!.restore();
    }

    frameId = requestAnimationFrame(draw);
  }

  frameId = requestAnimationFrame(draw);

  return () => cancelAnimationFrame(frameId);
}

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
