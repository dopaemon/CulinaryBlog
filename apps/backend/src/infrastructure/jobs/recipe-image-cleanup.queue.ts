import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const RECIPE_IMAGE_CLEANUP_QUEUE = 'recipe-image-cleanup';

export interface RecipeImageCleanupJob {
  recipeId: string;
  objectKeys: string[];
}

@Injectable()
export class RecipeImageCleanupQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<RecipeImageCleanupJob>;

  constructor(config: ConfigService) {
    this.connection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<RecipeImageCleanupJob>(
      RECIPE_IMAGE_CLEANUP_QUEUE,
      { connection: this.connection },
    );
  }

  async enqueue(job: RecipeImageCleanupJob): Promise<void> {
    if (job.objectKeys.length === 0) return;

    await this.queue.add('delete-recipe-images', job, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
