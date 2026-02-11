import { Hono } from 'hono';
import type { Context } from 'hono';
import { MessageService, MessageType } from '../services/messages.js';

function wantsText(accept: string | undefined): boolean {
  if (!accept) return false;
  // Check if text/plain is explicitly requested and preferred over JSON
  const types = accept.split(',').map((t) => t.trim().split(';')[0].trim());
  const textIndex = types.indexOf('text/plain');
  const jsonIndex = types.indexOf('application/json');
  if (textIndex === -1) return false;
  if (jsonIndex === -1) return true;
  return textIndex < jsonIndex;
}

function sendMessage(c: Context, message: string) {
  if (wantsText(c.req.header('accept'))) {
    return c.text(message);
  }
  return c.json({ message });
}

export function messageRoutes(messageService: MessageService): Hono {
  const app = new Hono();

  // GET /awesome/:name - Simple compliment
  app.get('/awesome/:name', (c) => {
    const name = c.req.param('name');
    const from = c.req.query('from');
    return sendMessage(c, messageService.getSimpleMessage(name, from));
  });

  // GET /weekly/:name - Weekly message with days off
  app.get('/weekly/:name', (c) => {
    const name = c.req.param('name');
    const from = c.req.query('from');
    return sendMessage(c, messageService.getWeeklyMessage(name, from));
  });

  // GET /random/:name - Random message type
  app.get('/random/:name', (c) => {
    const name = c.req.param('name');
    const from = c.req.query('from');
    return sendMessage(c, messageService.getRandomMessage(name, from));
  });

  // GET /message/:type/:name - Specific message type
  app.get('/message/:type/:name', (c) => {
    const type = c.req.param('type');
    const name = c.req.param('name');
    const from = c.req.query('from');

    const availableTypes = messageService.getAvailableTypes();
    if (!availableTypes.includes(type as MessageType)) {
      return c.json(
        { error: `Invalid message type. Available types: ${availableTypes.join(', ')}` },
        400,
      );
    }

    const message = messageService.getMessageByType(type as MessageType, name, from);
    if (!message) {
      return c.json({ error: `Message type '${type}' is not available` }, 404);
    }

    return sendMessage(c, message);
  });

  // GET /types - List available message types
  app.get('/types', (c) => {
    return c.json({ types: messageService.getAvailableTypes() });
  });

  return app;
}
