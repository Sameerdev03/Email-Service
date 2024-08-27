const EmailService = require('./EmailService');

jest.useFakeTimers();

describe('EmailService', () => {
  let emailService;

  beforeEach(() => {
    emailService = new EmailService();
  });

  test('should send an email successfully', async () => {
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    const result = await emailService.sendEmail(email);
    expect(result.status).toBe('sent');
    expect(result.id).toBeDefined();
  });

  test('should not send duplicate emails', async () => {
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    await emailService.sendEmail(email);
    const result = await emailService.sendEmail(email);
    expect(result.status).toBe('already_sent');
    expect(result.id).toBe('1');
  });

  test('should respect rate limiting', async () => {
    jest.useRealTimers();
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    for (let i = 0; i < 10; i++) {
      await emailService.sendEmail({ ...email, id: `${i}` });
    }
    await expect(emailService.sendEmail({ ...email, id: '11' })).rejects.toThrow('Rate limit exceeded');
    jest.useFakeTimers();
  });

  test('should retry on failure', async () => {
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    const mockProvider = {
      name: 'MockProvider',
      sendEmail: jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true, id: 'mock-id' })
    };
    emailService.providers = [mockProvider];

    const result = await emailService.sendEmail(email);
    expect(result.status).toBe('sent');
    expect(mockProvider.sendEmail).toHaveBeenCalledTimes(2);
  });

  test('should switch providers on repeated failures', async () => {
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    const mockProvider1 = {
      name: 'Provider1',
      sendEmail: jest.fn().mockRejectedValue(new Error('Failed'))
    };
    const mockProvider2 = {
      name: 'Provider2',
      sendEmail: jest.fn().mockResolvedValue({ success: true, id: 'mock-id' })
    };
    emailService.providers = [mockProvider1, mockProvider2];
    emailService.maxRetries = 1;

    const result = await emailService.sendEmail(email);
    expect(result.status).toBe('sent');
    expect(mockProvider1.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockProvider2.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('should emit events', async () => {
    const email = { id: '1', to: 'test@example.com', subject: 'Test', body: 'Hello' };
    const onEmailSent = jest.fn();
    const onEmailError = jest.fn();

    emailService.on('emailSent', onEmailSent);
    emailService.on('emailError', onEmailError);

    // Mock the provider to always succeed
    const mockProvider = {
      name: 'MockProvider',
      sendEmail: jest.fn().mockResolvedValue({ success: true, id: 'mock-id' })
    };
    emailService.providers = [mockProvider];

    await emailService.sendEmail(email);

    expect(onEmailSent).toHaveBeenCalledWith(expect.objectContaining({
      id: '1',
      provider: 'MockProvider'
    }));
    expect(onEmailError).not.toHaveBeenCalled();

    // Now test for error scenario
    mockProvider.sendEmail.mockRejectedValueOnce(new Error('Failed to send email'));

    try {
      await emailService.sendEmail({ ...email, id: '2' });
    } catch (error) {
      // Expected to throw after all retries
    }

    expect(onEmailError).toHaveBeenCalledWith(expect.objectContaining({
      id: '2',
      provider: 'MockProvider',
      error: 'Failed to send email'
    }));
  });
});