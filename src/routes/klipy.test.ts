import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { klipyRoutes } from './klipy.js';

type KlipyResultsBody = {
  results: Array<{
    id: number;
    title: string;
    previewUrl: string;
    fullUrl: string;
  }>;
  hasMore: boolean;
};

type ErrorBody = { error: string };

function createApp(apiKey: string, externalFetch?: typeof fetch): Hono {
  const app = new Hono();
  app.route('/api', klipyRoutes(apiKey, externalFetch));
  return app;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('Klipy Routes', () => {
  it('returns 503 when GIF search is not configured', async () => {
    const response = await createApp('').request('http://localhost/api/klipy/search?q=celebrate');

    expect(response.status).toBe(503);
    expect((await readJson<ErrorBody>(response)).error).toBe('GIF search is not configured');
  });

  it('returns empty results when query is blank', async () => {
    const response = await createApp('test-key').request('http://localhost/api/klipy/search?q=   ');

    expect(response.status).toBe(200);
    expect(await readJson<KlipyResultsBody>(response)).toEqual({ results: [] });
  });

  it('searches Klipy and returns transformed results', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: true,
        data: {
          data: [
            {
              id: 123,
              slug: 'celebration-abc',
              title: 'Celebration',
              file: {
                sm: {
                  gif: {
                    url: 'https://cdn.klipy.com/sm/celebration.gif',
                    width: 200,
                    height: 150,
                    size: 50000,
                  },
                },
                md: {
                  gif: {
                    url: 'https://cdn.klipy.com/md/celebration.gif',
                    width: 400,
                    height: 300,
                    size: 150000,
                  },
                },
              },
            },
          ],
          has_next: true,
        },
      }),
    });
    const response = await createApp(
      'test-key',
      mockFetch as typeof fetch,
    ).request('http://localhost/api/klipy/search?q=celebrate&limit=9&page=2');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [requestUrl] = mockFetch.mock.calls[0];
    const url = new URL(requestUrl);
    expect(url.origin + url.pathname).toBe('https://api.klipy.com/api/v1/test-key/gifs/search');
    expect(url.searchParams.get('q')).toBe('celebrate');
    expect(url.searchParams.get('per_page')).toBe('9');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('content_filter')).toBe('high');
    expect(url.searchParams.get('customer_id')).toBe('anonymous');

    expect(await readJson<KlipyResultsBody>(response)).toEqual({
      results: [
        {
          id: 123,
          title: 'Celebration',
          previewUrl: 'https://cdn.klipy.com/sm/celebration.gif',
          fullUrl: 'https://cdn.klipy.com/md/celebration.gif',
        },
      ],
      hasMore: true,
    });
  });

  it('resolves a GIF item by ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: true,
        data: {
          data: [
            {
              id: 456,
              slug: 'thumbs-up-xyz',
              title: 'Thumbs Up',
              file: {
                sm: {
                  gif: {
                    url: 'https://cdn.klipy.com/sm/thumbs-up.gif',
                    width: 200,
                    height: 150,
                    size: 40000,
                  },
                },
                md: {
                  gif: {
                    url: 'https://cdn.klipy.com/md/thumbs-up.gif',
                    width: 400,
                    height: 300,
                    size: 120000,
                  },
                },
              },
            },
          ],
          has_next: false,
        },
      }),
    });
    const response = await createApp(
      'test-key',
      mockFetch as typeof fetch,
    ).request('http://localhost/api/klipy/item/456');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [requestUrl] = mockFetch.mock.calls[0];
    const url = new URL(requestUrl);
    expect(url.origin + url.pathname).toBe('https://api.klipy.com/api/v1/test-key/gifs/items');
    expect(url.searchParams.get('ids')).toBe('456');

    expect(await readJson(response)).toEqual({
      id: 456,
      title: 'Thumbs Up',
      previewUrl: 'https://cdn.klipy.com/sm/thumbs-up.gif',
      fullUrl: 'https://cdn.klipy.com/md/thumbs-up.gif',
    });
  });

  it('returns 400 for non-numeric GIF ID', async () => {
    const response = await createApp('test-key').request('http://localhost/api/klipy/item/abc');
    expect(response.status).toBe(400);
    expect((await readJson<ErrorBody>(response)).error).toBe('Invalid GIF ID');
  });

  it('returns 404 when GIF item is not found', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: true, data: { data: [], has_next: false } }),
    });
    const response = await createApp(
      'test-key',
      mockFetch as typeof fetch,
    ).request('http://localhost/api/klipy/item/999');

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error).toBe('GIF not found');
  });

  it('returns 503 for item endpoint when not configured', async () => {
    const response = await createApp('').request('http://localhost/api/klipy/item/123');
    expect(response.status).toBe(503);
  });

  it('returns 502 when Klipy fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    const response = await createApp(
      'test-key',
      mockFetch as typeof fetch,
    ).request('http://localhost/api/klipy/search?q=celebrate');

    expect(response.status).toBe(502);
    expect((await readJson<ErrorBody>(response)).error).toBe('Failed to fetch GIFs');
  });
});
