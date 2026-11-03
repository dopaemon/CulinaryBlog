import {
  getWelcomeEmailRetryDelay,
  WelcomeEmailQueue,
  WELCOME_EMAIL_RETRY_DELAYS,
} from './welcome-email.queue';

describe('welcome email retry policy', () => {
  it('dùng backoff 1, 5 và 30 phút sau ba lần lỗi đầu', () => {
    expect(getWelcomeEmailRetryDelay(1)).toBe(WELCOME_EMAIL_RETRY_DELAYS[0]);
    expect(getWelcomeEmailRetryDelay(2)).toBe(WELCOME_EMAIL_RETRY_DELAYS[1]);
    expect(getWelcomeEmailRetryDelay(3)).toBe(WELCOME_EMAIL_RETRY_DELAYS[2]);
  });

  it('giữ delay cuối cho attempts vượt quá số lần retry', () => {
    expect(getWelcomeEmailRetryDelay(99)).toBe(1_800_000);
  });

  it('cho phép một lần gửi đầu và ba lần thử lại', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = Object.create(WelcomeEmailQueue.prototype) as WelcomeEmailQueue;
    Object.defineProperty(queue, 'queue', { value: { add } });
    const job = {
      email: 'user@example.test',
      displayName: 'Người dùng A',
      appUrl: 'https://example.test',
    };

    await queue.enqueue(job);

    expect(add).toHaveBeenCalledWith(
      'send-welcome-email',
      job,
      expect.objectContaining({
        attempts: 4,
        backoff: { type: 'custom' },
      }),
    );
  });
});
