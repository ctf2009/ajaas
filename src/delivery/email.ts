import nodemailer from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface EmailDelivery {
  sendMessage(to: string, recipientName: string, message: string): Promise<boolean>;
}

export class NodemailerDelivery implements EmailDelivery {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(config: EmailConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  async sendMessage(to: string, recipientName: string, message: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Awesome Job, ${recipientName}!`,
        text: message,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #2563eb; margin-bottom: 24px;">🎉 Awesome Job!</h1>
            <p style="font-size: 18px; line-height: 1.6; color: #374151;">${message}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            <p style="font-size: 12px; color: #9ca3af;">Sent via AJaaS - Awesome Job As A Service</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email delivery failed:', error);
      return false;
    }
  }
}

export class ConsoleDelivery implements EmailDelivery {
  async sendMessage(to: string, recipientName: string, message: string): Promise<boolean> {
    console.log(`[EMAIL] To: ${to} (${recipientName})`);
    console.log(`[EMAIL] Message: ${message}`);
    return true;
  }
}
