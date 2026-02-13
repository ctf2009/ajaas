import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { launchConfetti } from './confetti';
import './App.css';

type MessageType = 'awesome' | 'weekly' | 'random' | 'animal' | 'absurd' | 'meta' | 'unexpected';

function App() {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('awesome');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const apiBase = '/api';

  const getEndpoint = () => {
    switch (messageType) {
      case 'awesome':
      case 'weekly':
      case 'random':
        return `${apiBase}/${messageType}/${encodeURIComponent(name || 'Rachel')}`;
      default:
        return `${apiBase}/message/${messageType}/${encodeURIComponent(name || 'Rachel')}`;
    }
  };

  const tryIt = async () => {
    setLoading(true);
    try {
      const url = new URL(getEndpoint(), window.location.origin);
      if (from) url.searchParams.set('from', from);
      if (messageType === 'weekly') {
        url.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
      }

      const res = await fetch(url);
      const data = await res.json();
      setResult(data.message || data.error);
      if (confetti && canvasRef.current && data.message) {
        launchConfetti(canvasRef.current);
      }
    } catch {
      setResult('Oops! Something went wrong. The API might not be running.');
    }
    setLoading(false);
  };

  const getCardPath = () => {
    const cardName = encodeURIComponent(name || 'Rachel');
    const base = `/card/${messageType}/${cardName}`;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (confetti) params.set('confetti', 'true');
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const getCardUrl = () => `${window.location.origin}${getCardPath()}`;

  const copyCardLink = async () => {
    try {
      await navigator.clipboard.writeText(getCardUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (messageType === 'weekly') params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const curlExample = () => {
    return `curl "${window.location.origin}${getEndpoint()}${getQueryString()}"`;
  };

  const jsExample = () => {
    return `fetch("${getEndpoint()}${getQueryString()}")
  .then(res => res.json())
  .then(data => console.log(data.message));`;
  };

  return (
    <div className="container">
      <canvas ref={canvasRef} className="confetti-canvas" />
      <header>
        <h1>AJaaS</h1>
        <p className="tagline">Awesome Job as a Service</p>
        <p className="subtitle">
          A wholesome API for telling people they're doing great.<br />
          Because everyone deserves to hear it.
        </p>
      </header>

      <section className="about">
        <h2>The Story</h2>
        <p>
          Every Friday, as I leave the office, I have a little ritual. I walk past my colleagues
          and tell them: <em>"Awesome job this week. Take the next 2 days off."</em>
        </p>
        <p>
          It's a bit of fun. People look forward to it. Sometimes I personalize it,
          sometimes I get creative. It lifts morale and ends the week on a high note.
        </p>
        <p>
          AJaaS is that ritual, as an API. Because everyone deserves to hear they're doing awesome.
        </p>
      </section>

      <section className="demo">
        <h2>Try It</h2>
        <div className="form">
          <div className="form-row">
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rachel"
              />
            </label>
            <label>
              From (optional)
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Your name"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Message Type
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as MessageType)}
              >
                <option value="awesome">Simple</option>
                <option value="weekly">Weekly</option>
                <option value="random">Random</option>
                <option value="animal">Animal</option>
                <option value="absurd">Absurd</option>
                <option value="meta">Meta</option>
                <option value="unexpected">Unexpected</option>
              </select>
            </label>
            <button onClick={tryIt} disabled={loading}>
              {loading ? 'Loading...' : 'Get Message'}
            </button>
          </div>
          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confetti}
                onChange={(e) => setConfetti(e.target.checked)}
              />
              Add some Confetti!
            </label>
          </div>
        </div>

        {result && (
          <div className="result">
            <p>{result}</p>
            <div className="result-actions">
              <Link to={getCardPath()} className="share-link">
                View as card
              </Link>
              <button className="copy-link" onClick={copyCardLink}>
                {copied ? 'Copied!' : 'Copy share link'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="features">
        <h2>Features</h2>
        <div className="feature-grid">
          <div className="feature">
            <h3>Multiple Message Modes</h3>
            <p>Simple, weekly, random, animal, absurd, meta, and unexpected compliments.</p>
          </div>
          <div className="feature">
            <h3>Shareable Card Links</h3>
            <p>Create personalized card URLs you can send anywhere.</p>
          </div>
          <div className="feature">
            <h3>API + Plain Text</h3>
            <p>Use JSON by default or request plain text via `Accept: text/plain`.</p>
          </div>
          <div className="feature">
            <h3>Scheduled Delivery</h3>
            <p>Automate recurring messages with cron expressions.</p>
          </div>
          <div className="feature">
            <h3>Email + Webhook</h3>
            <p>Deliver through SMTP email or signed webhooks.</p>
          </div>
          <div className="feature">
            <h3>Encrypted Auth Tokens</h3>
            <p>Tokens are AES-256-GCM encrypted with role-based permissions.</p>
          </div>
          <div className="feature">
            <h3>OpenAPI Docs</h3>
            <p>Swagger UI available at `/api/docs` for quick integration.</p>
          </div>
          <div className="feature">
            <h3>Deploy Anywhere</h3>
            <p>Run on Node/Docker or Cloudflare Workers from the same codebase.</p>
          </div>
        </div>
      </section>

      <section className="endpoints">
        <h2>Endpoints</h2>
        <div className="endpoint-grid">
          <div className="endpoint">
            <code>GET /api/awesome/:name</code>
            <p>Simple compliment</p>
          </div>
          <div className="endpoint">
            <code>GET /api/weekly/:name</code>
            <p>Weekly message with days off</p>
          </div>
          <div className="endpoint">
            <code>GET /api/random/:name</code>
            <p>Random message type</p>
          </div>
          <div className="endpoint">
            <code>GET /api/message/:type/:name</code>
            <p>Specific type: animal, absurd, meta, unexpected, toughLove</p>
          </div>
          <div className="endpoint">
            <code>GET /api/types</code>
            <p>List available message types</p>
          </div>
          <div className="endpoint">
            <code>GET /api/docs</code>
            <p>Swagger UI documentation</p>
          </div>
        </div>
        <p className="note">
          All message endpoints accept an optional <code>?from=Name</code> parameter for attribution.
        </p>
      </section>

      <section className="code-examples">
        <h2>Code Examples</h2>
        <div className="code-tabs">
          <div className="code-block">
            <h3>curl</h3>
            <pre><code>{curlExample()}</code></pre>
          </div>
          <div className="code-block">
            <h3>JavaScript</h3>
            <pre><code>{jsExample()}</code></pre>
          </div>
        </div>
      </section>

      <footer>
        <div className="links">
          <a href="https://github.com/ctf2009/ajaas" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="/api/docs">API Docs</a>
        </div>
        <p className="footer-message">
          You've scrolled this far. Awesome job. Take the rest of the day off.
        </p>
      </footer>
    </div>
  );
}

export default App;
