import { Cron } from 'croner';
import { Storage, Schedule } from '../storage/interface.js';
import { MessageService } from '../services/messages.js';
import { EmailDelivery } from '../delivery/email.js';
import { WebhookDelivery } from '../delivery/webhook.js';

export class Scheduler {
  private storage: Storage;
  private messageService: MessageService;
  private emailDelivery: EmailDelivery;
  private webhookDelivery: WebhookDelivery;
  private pollInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    storage: Storage,
    messageService: MessageService,
    emailDelivery: EmailDelivery,
    webhookDelivery?: WebhookDelivery,
    pollIntervalMs: number = 60000 // Default: check every minute
  ) {
    this.storage = storage;
    this.messageService = messageService;
    this.emailDelivery = emailDelivery;
    this.webhookDelivery = webhookDelivery || new WebhookDelivery();
    this.pollInterval = pollIntervalMs;
  }

  start(): void {
    console.log(`Scheduler started, polling every ${this.pollInterval / 1000}s`);
    this.poll(); // Run immediately
    this.timer = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Scheduler stopped');
    }
  }

  private async poll(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const dueSchedules = await this.storage.getSchedulesDue(now);

    for (const schedule of dueSchedules) {
      await this.executeSchedule(schedule);
    }
  }

  private async executeSchedule(schedule: Schedule): Promise<void> {
    try {
      // Generate the message
      const message = this.generateMessage(schedule);

      // Send via appropriate delivery method
      if (schedule.deliveryMethod === 'webhook' && schedule.webhookUrl) {
        await this.webhookDelivery.sendMessage(
          schedule.webhookUrl,
          {
            recipient: schedule.recipient,
            message,
            endpoint: schedule.endpoint,
            messageType: schedule.messageType,
            from: schedule.from,
            timestamp: new Date().toISOString(),
          },
          schedule.webhookSecret
        );
      } else {
        await this.emailDelivery.sendMessage(
          schedule.recipientEmail,
          schedule.recipient,
          message
        );
      }

      console.log(`Executed schedule ${schedule.id} for ${schedule.recipient}`);

      // Calculate and update next run
      const nextRun = this.calculateNextRun(schedule.cron);
      if (nextRun) {
        await this.storage.updateScheduleNextRun(schedule.id, nextRun);
        console.log(`Next run for ${schedule.id}: ${new Date(nextRun * 1000).toISOString()}`);
      }
    } catch (error) {
      console.error(`Failed to execute schedule ${schedule.id}:`, error);
    }
  }

  private generateMessage(schedule: Schedule): string {
    const { endpoint, messageType, recipient, from } = schedule;

    switch (endpoint) {
      case 'awesome':
        return this.messageService.getSimpleMessage(recipient, from);
      case 'weekly':
        return this.messageService.getWeeklyMessage(recipient, from);
      case 'random':
        return this.messageService.getRandomMessage(recipient, from);
      case 'message':
        if (messageType) {
          const msg = this.messageService.getMessageByType(
            messageType as any,
            recipient,
            from
          );
          return msg || this.messageService.getRandomMessage(recipient, from);
        }
        return this.messageService.getRandomMessage(recipient, from);
      default:
        return this.messageService.getSimpleMessage(recipient, from);
    }
  }

  calculateNextRun(cronExpression: string): number | null {
    try {
      const cron = new Cron(cronExpression);
      const next = cron.nextRun();
      return next ? Math.floor(next.getTime() / 1000) : null;
    } catch (error) {
      console.error(`Invalid cron expression: ${cronExpression}`, error);
      return null;
    }
  }
}
