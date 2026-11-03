import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const RECIPE_IMAGE_RESIZE_QUEUE = 'recipe-image-resize';

export interface RecipeImageResizeJob {
  imageId: string;
  recipeId: string;
  sourceObjectKey: string;
}

@Injectable()
export class RecipeImageResizeQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<RecipeImageResizeJob>;

  constructor(config: ConfigService) {
    this.connection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<RecipeImageResizeJob>(RECIPE_IMAGE_RESIZE_QUEUE, {
      connection: this.connection,
    });
  }

  async enqueue(job: RecipeImageResizeJob): Promise<void> {
    await this.queue.add('resize-recipe-image', job, {
      jobId: job.imageId,
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
