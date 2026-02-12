export type MessageType = 'animal' | 'absurd' | 'meta' | 'unexpected' | 'toughLove';

interface MessageTemplate {
  type: MessageType;
  template: string;
  isToughLove: boolean;
}

const templates: MessageTemplate[] = [
  // Animal/nature similes
  {
    type: 'animal',
    template: "You've navigated this week like a bear navigates its way to honey, :name.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You attacked those tasks like a caffeinated squirrel at a bird feeder, :name.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You've been as dependable as a salmon swimming upstream, :name. But with less flopping.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You herded those deadlines like a border collie at a sheep convention, :name.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You carried this week like a mother duck crossing a highway, :name. Fearlessly.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You worked with the quiet determination of an ant carrying a crumb ten times its size, :name.",
    isToughLove: false,
  },
  {
    type: 'animal',
    template: "You were busier than a one-legged cat in a sandbox, :name. And somehow you made it look elegant.",
    isToughLove: false,
  },

  // Absurdist humor
  {
    type: 'absurd',
    template: "If productivity were an Olympic sport, you'd be disqualified for being suspiciously good, :name.",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "You crushed it so hard this week, :name, geologists want to study the impact site.",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "Scientists are baffled by your output, :name. They're calling it 'unreasonably effective.'",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "Your work ethic this week was so intense, :name, CERN wants to know if you've discovered a new energy source.",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "NASA called, :name. They want to study your trajectory because it only goes up.",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "Your output this week broke the simulation, :name. The devs are still patching it.",
    isToughLove: false,
  },
  {
    type: 'absurd',
    template: "The dictionary just called, :name. They're replacing the word 'impressive' with your photo.",
    isToughLove: false,
  },

  // Self-aware / meta humor
  {
    type: 'meta',
    template: "This automated message thinks you're great, :name. It's never wrong.",
    isToughLove: false,
  },
  {
    type: 'meta',
    template: "A computer is telling you you're awesome, :name. The machines are on your side.",
    isToughLove: false,
  },
  {
    type: 'meta',
    template: "I'm just an API, :name, but even I can see you're crushing it.",
    isToughLove: false,
  },
  {
    type: 'meta',
    template: "This compliment was generated at 200 OK, :name. No errors detected in your performance.",
    isToughLove: false,
  },
  {
    type: 'meta',
    template: "According to my algorithms, :name, you are statistically awesome. Sample size: this week.",
    isToughLove: false,
  },

  // Unexpected compliments
  {
    type: 'unexpected',
    template: "You didn't just meet expectations, :name. You took expectations out for dinner and showed them a lovely time.",
    isToughLove: false,
  },
  {
    type: 'unexpected',
    template: "You handled this week like a diplomat handles a buffet, :name - with grace and efficiency.",
    isToughLove: false,
  },
  {
    type: 'unexpected',
    template: "Your work this week had the same energy as finding money in your coat pocket, :name. A delightful surprise.",
    isToughLove: false,
  },
  {
    type: 'unexpected',
    template: "You brought the same energy to Monday that most people save for Friday, :name.",
    isToughLove: false,
  },
  {
    type: 'unexpected',
    template: "Somewhere out there, a motivational poster is quoting you, :name.",
    isToughLove: false,
  },

  // Tough love
  {
    type: 'toughLove',
    template: "Solid work, :name. Not legendary, but solid. Take 2 days off and come back hungry.",
    isToughLove: true,
  },
  {
    type: 'toughLove',
    template: "You survived, :name. That's the bar, and you cleared it. Barely. Rest up.",
    isToughLove: true,
  },
  {
    type: 'toughLove',
    template: "Adequate, :name. The word you're looking for is adequate. Now go away for 2 days.",
    isToughLove: true,
  },
  {
    type: 'toughLove',
    template: "I've seen better, :name. But I've also seen worse. Take 2 days to recalibrate.",
    isToughLove: true,
  },
  {
    type: 'toughLove',
    template: "You did the thing, :name. Not with flair, but you did it. Go rest.",
    isToughLove: true,
  },
  {
    type: 'toughLove',
    template: "Look, :name, nobody's writing songs about this week. But nobody's filing complaints either. Take 2 days.",
    isToughLove: true,
  },
];

export class MessageService {
  private includeToughLove: boolean;

  constructor(includeToughLove: boolean = true) {
    this.includeToughLove = includeToughLove;
  }

  private getAvailableTemplates(): MessageTemplate[] {
    if (this.includeToughLove) {
      return templates;
    }
    return templates.filter(t => !t.isToughLove);
  }

  private formatMessage(template: string, name: string, from?: string): string {
    let message = template.replace(/:name/g, name);
    if (from) {
      message += ` - ${from}`;
    }
    return message;
  }

  getSimpleMessage(name: string, from?: string): string {
    return this.formatMessage(`Awesome job, :name!`, name, from);
  }

  getWeeklyMessage(name: string, from?: string, tz?: string): string {
    const daysOff = this.calculateDaysOff(tz);
    return this.formatMessage(
      `Awesome job this week, :name. Take the next ${daysOff} days off.`,
      name,
      from
    );
  }

  getRandomMessage(name: string, from?: string): string {
    const available = this.getAvailableTemplates();
    const template = available[Math.floor(Math.random() * available.length)];
    return this.formatMessage(template.template, name, from);
  }

  getMessageByType(type: MessageType, name: string, from?: string): string | null {
    if (type === 'toughLove' && !this.includeToughLove) {
      return null;
    }

    const typeTemplates = this.getAvailableTemplates().filter(t => t.type === type);
    if (typeTemplates.length === 0) {
      return null;
    }

    const template = typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
    return this.formatMessage(template.template, name, from);
  }

  getAvailableTypes(): MessageType[] {
    const types = new Set(this.getAvailableTemplates().map(t => t.type));
    return Array.from(types);
  }

  private getDayOfWeek(tz?: string): number {
    const now = new Date();
    if (!tz) return now.getDay();

    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).format(now);

    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return dayMap[weekday] ?? now.getDay();
  }

  private calculateDaysOff(tz?: string): number {
    const dayOfWeek = this.getDayOfWeek(tz);

    // Basic logic: Friday = 2 days (weekend)
    // This can be enhanced later with public holiday API
    if (dayOfWeek === 5) {
      return 2; // Friday -> weekend
    } else if (dayOfWeek === 4) {
      return 3; // Thursday -> long weekend vibes
    } else if (dayOfWeek === 0) {
      return 1; // Sunday
    } else if (dayOfWeek === 6) {
      return 1; // Saturday
    }

    // Default for other days
    return 2;
  }
}
