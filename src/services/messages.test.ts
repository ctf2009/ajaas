import { describe, it, expect, beforeEach } from 'vitest';
import { MessageService, MessageType } from './messages.js';

describe('MessageService', () => {
  describe('with tough love enabled', () => {
    let service: MessageService;

    beforeEach(() => {
      service = new MessageService(true);
    });

    describe('getSimpleMessage', () => {
      it('should return a simple message with the name', () => {
        const message = service.getSimpleMessage('Sarah');
        expect(message).toBe('Awesome job, Sarah!');
      });

      it('should include attribution when from is provided', () => {
        const message = service.getSimpleMessage('Sarah', 'Mike');
        expect(message).toBe('Awesome job, Sarah! - Mike');
      });
    });

    describe('getWeeklyMessage', () => {
      it('should return a weekly message with days off', () => {
        const message = service.getWeeklyMessage('Sarah');
        expect(message).toMatch(/Awesome job this week, Sarah\. Take the next \d+ days off\./);
      });

      it('should include attribution when from is provided', () => {
        const message = service.getWeeklyMessage('Sarah', 'Boss');
        expect(message).toMatch(/Awesome job this week, Sarah\. Take the next \d+ days off\. - Boss/);
      });
    });

    describe('getRandomMessage', () => {
      it('should return a message containing the name', () => {
        const message = service.getRandomMessage('Alex');
        expect(message).toContain('Alex');
      });

      it('should include attribution when from is provided', () => {
        const message = service.getRandomMessage('Alex', 'Team');
        expect(message).toContain('- Team');
      });

      it('should return different messages on multiple calls (probabilistic)', () => {
        const messages = new Set<string>();
        for (let i = 0; i < 50; i++) {
          messages.add(service.getRandomMessage('Test'));
        }
        // With 13 templates, we should get variety
        expect(messages.size).toBeGreaterThan(1);
      });
    });

    describe('getMessageByType', () => {
      it('should return an animal message for animal type', () => {
        const message = service.getMessageByType('animal', 'Sarah');
        expect(message).not.toBeNull();
        expect(message).toContain('Sarah');
      });

      it('should return an absurd message for absurd type', () => {
        const message = service.getMessageByType('absurd', 'Sarah');
        expect(message).not.toBeNull();
        expect(message).toContain('Sarah');
      });

      it('should return a meta message for meta type', () => {
        const message = service.getMessageByType('meta', 'Sarah');
        expect(message).not.toBeNull();
        expect(message).toContain('Sarah');
      });

      it('should return an unexpected message for unexpected type', () => {
        const message = service.getMessageByType('unexpected', 'Sarah');
        expect(message).not.toBeNull();
        expect(message).toContain('Sarah');
      });

      it('should return a toughLove message for toughLove type', () => {
        const message = service.getMessageByType('toughLove', 'Sarah');
        expect(message).not.toBeNull();
        expect(message).toContain('Sarah');
      });

      it('should include attribution when from is provided', () => {
        const message = service.getMessageByType('animal', 'Sarah', 'Boss');
        expect(message).toContain('- Boss');
      });
    });

    describe('getAvailableTypes', () => {
      it('should include all types when tough love is enabled', () => {
        const types = service.getAvailableTypes();
        expect(types).toContain('animal');
        expect(types).toContain('absurd');
        expect(types).toContain('meta');
        expect(types).toContain('unexpected');
        expect(types).toContain('toughLove');
      });
    });
  });

  describe('with tough love disabled', () => {
    let service: MessageService;

    beforeEach(() => {
      service = new MessageService(false);
    });

    describe('getMessageByType', () => {
      it('should return null for toughLove type', () => {
        const message = service.getMessageByType('toughLove', 'Sarah');
        expect(message).toBeNull();
      });

      it('should still return messages for other types', () => {
        expect(service.getMessageByType('animal', 'Sarah')).not.toBeNull();
        expect(service.getMessageByType('absurd', 'Sarah')).not.toBeNull();
        expect(service.getMessageByType('meta', 'Sarah')).not.toBeNull();
        expect(service.getMessageByType('unexpected', 'Sarah')).not.toBeNull();
      });
    });

    describe('getAvailableTypes', () => {
      it('should not include toughLove', () => {
        const types = service.getAvailableTypes();
        expect(types).not.toContain('toughLove');
      });

      it('should include other types', () => {
        const types = service.getAvailableTypes();
        expect(types).toContain('animal');
        expect(types).toContain('absurd');
        expect(types).toContain('meta');
        expect(types).toContain('unexpected');
      });
    });

    describe('getRandomMessage', () => {
      it('should never return a tough love message', () => {
        const toughLovePhrases = ['Not legendary', 'survived', 'Adequate'];
        for (let i = 0; i < 100; i++) {
          const message = service.getRandomMessage('Test');
          for (const phrase of toughLovePhrases) {
            expect(message).not.toContain(phrase);
          }
        }
      });
    });
  });
});
