import { useState } from 'react';
import './App.css';

type MessageType = 'awesome' | 'weekly' | 'random' | 'animal' | 'absurd' | 'meta' | 'unexpected';

function App() {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('awesome');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

      const res = await fetch(url);
      const data = await res.json();
      setResult(data.message || data.error);
    } catch {
      setResult('Oops! Something went wrong. The API might not be running.');
    }
    setLoading(false);
  };

  const curlExample = () => {
    const endpoint = getEndpoint();
    const fromParam = from ? `?from=${encodeURIComponent(from)}` : '';
    return `curl "${window.location.origin}${endpoint}${fromParam}"`;
  };

  const jsExample = () => {
    const endpoint = getEndpoint();
    const fromParam = from ? `?from=${encodeURIComponent(from)}` : '';
    return `fetch("${endpoint}${fromParam}")
  .then(res => res.json())
  .then(data => console.log(data.message));`;
  };

  return (
    <div className="container">
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
        </div>

        {result && (
          <div className="result">
            <p>{result}</p>
          </div>
        )}
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
