import { createHmac } from 'crypto';

export interface WebhookPayload {
  recipient: string;
  message: string;
  endpoint: string;
  messageType?: string;
  from?: string;
  timestamp: string;
}

export class WebhookDelivery {
  async sendMessage(
    url: string,
    payload: WebhookPayload,
    secret?: string
  ): Promise<boolean> {
    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AJAAS-Webhook/0.1.0',
      };

      if (secret) {
        const signature = createHmac('sha256', secret)
          .update(body)
          .digest('hex');
        headers['X-AJAAS-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        console.error(
          `Webhook delivery failed: ${response.status} ${response.statusText} for ${url}`
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('Webhook delivery failed:', error);
      return false;
    }
  }
}

export class ConsoleWebhookDelivery extends WebhookDelivery {
  async sendMessage(
    url: string,
    payload: WebhookPayload,
    secret?: string
  ): Promise<boolean> {
    console.log(`[WEBHOOK] URL: ${url}`);
    console.log(`[WEBHOOK] Payload: ${JSON.stringify(payload)}`);
    console.log(`[WEBHOOK] Signed: ${secret ? 'yes' : 'no'}`);
    return true;
  }
}
