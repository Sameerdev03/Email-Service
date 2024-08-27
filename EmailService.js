const EventEmitter = require('events');

class EmailProvider {
  constructor(name) {
    this.name = name;
  }

  async sendEmail(email) {
    // Simulate API call without delay
    const success = Math.random() < 0.7; // 70% success rate
    if (success) {
      return { success: true, id: Math.random().toString(36).substr(2, 9) };
    } else {
      throw new Error('Failed to send email');
    }
  }
}

class EmailService extends EventEmitter {
  constructor() {
    super();
    this.providers = [
      new EmailProvider('Provider1'),
      new EmailProvider('Provider2')
    ];
    this.currentProviderIndex = 0;
    this.maxRetries = 2;
    this.sentEmails = new Set();
    this.rateLimit = 10; // Max emails per minute
    this.sentCount = 0;
    this.lastResetTime = Date.now();
  }

  async sendEmail(email) {
    if (this.sentEmails.has(email.id)) {
      return { status: 'already_sent', id: email.id };
    }

    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    let attempts = 0;
    while (attempts < this.maxRetries * this.providers.length) {
      try {
        const result = await this.getCurrentProvider().sendEmail(email);
        this.sentEmails.add(email.id);
        this.incrementSentCount();
        this.emit('emailSent', { id: email.id, provider: this.getCurrentProvider().name });
        return { status: 'sent', id: result.id };
      } catch (error) {
        attempts++;
        this.emit('emailError', { id: email.id, provider: this.getCurrentProvider().name, error: error.message });
        this.switchProvider();
      }
    }

    throw new Error('Failed to send email after all retries');
  }

  getCurrentProvider() {
    return this.providers[this.currentProviderIndex];
  }

  switchProvider() {
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
  }

  checkRateLimit() {
    const now = Date.now();
    if (now - this.lastResetTime > 60000) {
      this.sentCount = 0;
      this.lastResetTime = now;
    }
    return this.sentCount < this.rateLimit;
  }

  incrementSentCount() {
    this.sentCount++;
  }
}

module.exports = EmailService;