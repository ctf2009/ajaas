import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodemailerDelivery, ConsoleDelivery } from './email.js';

const mockSendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

const CONFIG = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  from: 'noreply@example.com',
};

describe('NodemailerDelivery', () => {
  let delivery: NodemailerDelivery;

  beforeEach(() => {
    mockSendMail.mockReset();
    delivery = new NodemailerDelivery(CONFIG);
  });

  it('returns true on successful send', async () => {
    mockSendMail.mockResolvedValueOnce({});
    const result = await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    expect(result).toBe(true);
  });

  it('calls sendMail once per message', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it('sends to the correct recipient address', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('rachel@example.com');
  });

  it('sends from the configured from address', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toBe('noreply@example.com');
  });

  it('sets the subject with recipient name', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toBe('Awesome Job, Rachel!');
  });

  it('includes raw message as plain text body', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.text).toBe('Great work!');
  });

  it('escapes < and > in recipient name in HTML', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('r@e.com', '<script>xss</script>', 'msg');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('&lt;script&gt;');
    expect(call.html).not.toContain('<script>');
  });

  it('escapes & in message body in HTML', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('r@e.com', 'Rachel', 'bread & butter');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('bread &amp; butter');
    expect(call.html).not.toMatch(/bread & butter/);
  });

  it('escapes double quotes in HTML', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('r@e.com', 'Test "User"', 'msg');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('&quot;User&quot;');
  });

  it('escapes > in message body in HTML', async () => {
    mockSendMail.mockResolvedValueOnce({});
    await delivery.sendMessage('r@e.com', 'Rachel', '5 > 3');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('5 &gt; 3');
  });

  it('returns false and logs error when sendMail throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));
    const result = await delivery.sendMessage('r@e.com', 'Rachel', 'msg');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('passes auth credentials to transporter when provided', async () => {
    const nodemailer = await import('nodemailer');
    const createTransportSpy = vi.spyOn(nodemailer.default, 'createTransport');

    new NodemailerDelivery({
      ...CONFIG,
      auth: { user: 'smtp-user', pass: 'smtp-pass' },
    });

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { user: 'smtp-user', pass: 'smtp-pass' },
      }),
    );
    createTransportSpy.mockRestore();
  });
});

describe('ConsoleDelivery', () => {
  it('returns true', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const delivery = new ConsoleDelivery();
    const result = await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    expect(result).toBe(true);
    consoleSpy.mockRestore();
  });

  it('logs the recipient address', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const delivery = new ConsoleDelivery();
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rachel@example.com'));
    consoleSpy.mockRestore();
  });

  it('logs the message', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const delivery = new ConsoleDelivery();
    await delivery.sendMessage('rachel@example.com', 'Rachel', 'Great work!');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Great work!'));
    consoleSpy.mockRestore();
  });
});
