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
        const message = service.getSimpleMessage('Rachel');
        expect(message).toBe('Awesome job, Rachel!');
      });

      it('should include attribution when from is provided', () => {
        const message = service.getSimpleMessage('Rachel', 'Mike');
        expect(message).toBe('Awesome job, Rachel! - Mike');
      });
    });

    describe('getWeeklyMessage', () => {
      it('should return a weekly message with days off', () => {
        const message = service.getWeeklyMessage('Rachel');
        expect(message).toMatch(/Awesome job this week, Rachel\. Take the next \d+ days off\./);
      });

      it('should include attribution when from is provided', () => {
        const message = service.getWeeklyMessage('Rachel', 'Boss');
        expect(message).toMatch(/Awesome job this week, Rachel\. Take the next \d+ days off\. - Boss/);
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
        const message = service.getMessageByType('animal', 'Rachel');
        expect(message).not.toBeNull();
        expect(message).toContain('Rachel');
      });

      it('should return an absurd message for absurd type', () => {
        const message = service.getMessageByType('absurd', 'Rachel');
        expect(message).not.toBeNull();
        expect(message).toContain('Rachel');
      });

      it('should return a meta message for meta type', () => {
        const message = service.getMessageByType('meta', 'Rachel');
        expect(message).not.toBeNull();
        expect(message).toContain('Rachel');
      });

      it('should return an unexpected message for unexpected type', () => {
        const message = service.getMessageByType('unexpected', 'Rachel');
        expect(message).not.toBeNull();
        expect(message).toContain('Rachel');
      });

      it('should return a toughLove message for toughLove type', () => {
        const message = service.getMessageByType('toughLove', 'Rachel');
        expect(message).not.toBeNull();
        expect(message).toContain('Rachel');
      });

      it('should include attribution when from is provided', () => {
        const message = service.getMessageByType('animal', 'Rachel', 'Boss');
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
        const message = service.getMessageByType('toughLove', 'Rachel');
        expect(message).toBeNull();
      });

      it('should still return messages for other types', () => {
        expect(service.getMessageByType('animal', 'Rachel')).not.toBeNull();
        expect(service.getMessageByType('absurd', 'Rachel')).not.toBeNull();
        expect(service.getMessageByType('meta', 'Rachel')).not.toBeNull();
        expect(service.getMessageByType('unexpected', 'Rachel')).not.toBeNull();
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
