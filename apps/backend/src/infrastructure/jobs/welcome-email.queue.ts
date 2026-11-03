import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';
export const WELCOME_EMAIL_RETRY_DELAYS = [60_000, 300_000, 1_800_000] as const;

export function getWelcomeEmailRetryDelay(attemptsMade: number): number {
  return WELCOME_EMAIL_RETRY_DELAYS[
    Math.min(Math.max(attemptsMade - 1, 0), WELCOME_EMAIL_RETRY_DELAYS.length - 1)
  ];
}

export interface WelcomeEmailJob {
  email: string;
  displayName: string;
  appUrl: string;
}

@Injectable()
export class WelcomeEmailQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<WelcomeEmailJob>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.connection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<WelcomeEmailJob>(WELCOME_EMAIL_QUEUE, {
      connection: this.connection,
    });
  }

  async enqueue(job: WelcomeEmailJob): Promise<void> {
    await this.queue.add('send-welcome-email', job, {
      attempts: 4,
      backoff: { type: 'custom' },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
