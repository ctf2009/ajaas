import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookDelivery, WebhookPayload } from './webhook.js';

describe('WebhookDelivery', () => {
  let delivery: WebhookDelivery;
  const testPayload: WebhookPayload = {
    recipient: 'Rachel',
    message: 'Awesome job, Rachel!',
    endpoint: 'awesome',
    timestamp: '2026-02-04T17:00:00.000Z',
  };

  beforeEach(() => {
    delivery = new WebhookDelivery();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST JSON payload to the webhook URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await delivery.sendMessage(
      'https://example.com/webhook',
      testPayload
    );

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['User-Agent']).toBe('AJaaS-Webhook/0.1.0');
    expect(JSON.parse(options.body)).toEqual(testPayload);
  });

  it('should include HMAC signature when secret is provided', async () => {
    const secret = 'my-webhook-secret';
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await delivery.sendMessage(
      'https://example.com/webhook',
      testPayload,
      secret
    );

    const [, options] = mockFetch.mock.calls[0];
    const signature = options.headers['X-AJaaS-Signature'];
    expect(signature).toBeDefined();
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);

    // Verify the signature is correct
    const expectedSignature = 'sha256=' + createHmac('sha256', secret)
      .update(options.body)
      .digest('hex');
    expect(signature).toBe(expectedSignature);
  });

  it('should not include signature header when no secret is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await delivery.sendMessage(
      'https://example.com/webhook',
      testPayload
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-AJaaS-Signature']).toBeUndefined();
  });

  it('should return false on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await delivery.sendMessage(
      'https://example.com/webhook',
      testPayload
    );

    expect(result).toBe(false);
  });

  it('should return false on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await delivery.sendMessage(
      'https://example.com/webhook',
      testPayload
    );

    expect(result).toBe(false);
  });

  it('should include optional fields in payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const fullPayload: WebhookPayload = {
      ...testPayload,
      messageType: 'animal',
      from: 'Boss',
    };

    await delivery.sendMessage(
      'https://example.com/webhook',
      fullPayload
    );

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messageType).toBe('animal');
    expect(body.from).toBe('Boss');
  });
});
