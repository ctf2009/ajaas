import { Hono } from 'hono';

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height_small: GiphyImage;
  };
}

interface GiphySearchResponse {
  data: GiphyGif[];
}

export function giphyRoutes(apiKey: string): Hono {
  const app = new Hono();

  app.get('/giphy/search', async (c) => {
    if (!apiKey) {
      return c.json({ error: 'GIF search is not configured' }, 503);
    }

    const q = c.req.query('q') || '';
    if (!q.trim()) {
      return c.json({ results: [] });
    }

    const limit = Math.min(parseInt(c.req.query('limit') || '9', 10), 20);

    const url = new URL('https://api.giphy.com/v1/gifs/search');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('rating', 'g');
    url.searchParams.set('lang', 'en');

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        return c.json({ error: 'Failed to fetch GIFs' }, 502);
      }

      const data = (await res.json()) as GiphySearchResponse;
      const results = data.data.map((gif) => ({
        id: gif.id,
        title: gif.title,
        previewUrl: gif.images.fixed_height_small.url,
      }));

      return c.json({ results });
    } catch {
      return c.json({ error: 'Failed to fetch GIFs' }, 502);
    }
  });

  return app;
}
