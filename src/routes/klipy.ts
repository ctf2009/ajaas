import { Hono } from 'hono';

interface KlipyFileFormat {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface KlipyItem {
  id: number;
  slug: string;
  title: string;
  file: {
    sm: { gif: KlipyFileFormat };
    md: { gif: KlipyFileFormat };
  };
}

interface KlipySearchResponse {
  result: boolean;
  data: {
    data: KlipyItem[];
    has_next: boolean;
  };
}

const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export function klipyRoutes(
  apiKey: string,
  externalFetch: typeof fetch = nativeFetch,
): Hono {
  const app = new Hono();

  app.get('/klipy/search', async (c) => {
    if (!apiKey) {
      return c.json({ error: 'GIF search is not configured' }, 503);
    }

    const q = c.req.query('q') || '';
    if (!q.trim()) {
      return c.json({ results: [] });
    }

    const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '9', 10) || 9, 20));
    const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);

    const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('per_page', String(limit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('content_filter', 'high');
    url.searchParams.set('customer_id', 'anonymous');

    try {
      const res = await externalFetch(url.toString());
      if (!res.ok) {
        console.error(`Klipy fetch failed: ${res.status} ${res.statusText}`);
        return c.json({ error: 'Failed to fetch GIFs' }, 502);
      }

      const body = (await res.json()) as KlipySearchResponse;
      const results = body.data.data.map((item) => ({
        id: item.id,
        title: item.title,
        previewUrl: item.file.sm.gif.url,
        fullUrl: item.file.md.gif.url,
      }));

      return c.json({ results, hasMore: body.data.has_next });
    } catch (error) {
      console.error('Klipy fetch failed:', error);
      return c.json({ error: 'Failed to fetch GIFs' }, 502);
    }
  });

  app.get('/klipy/item/:id', async (c) => {
    if (!apiKey) {
      return c.json({ error: 'GIF search is not configured' }, 503);
    }

    const id = c.req.param('id');
    if (!/^\d+$/.test(id)) {
      return c.json({ error: 'Invalid GIF ID' }, 400);
    }

    const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/items`);
    url.searchParams.set('ids', id);

    try {
      const res = await externalFetch(url.toString());
      if (!res.ok) {
        console.error(`Klipy item fetch failed: ${res.status} ${res.statusText}`);
        return c.json({ error: 'Failed to fetch GIF' }, 502);
      }

      const body = (await res.json()) as KlipySearchResponse;
      const items = body.data.data;
      if (!items.length) {
        return c.json({ error: 'GIF not found' }, 404);
      }

      const item = items[0];
      return c.json({
        id: item.id,
        title: item.title,
        previewUrl: item.file.sm.gif.url,
        fullUrl: item.file.md.gif.url,
      });
    } catch (error) {
      console.error('Klipy item fetch failed:', error);
      return c.json({ error: 'Failed to fetch GIF' }, 502);
    }
  });

  return app;
}
