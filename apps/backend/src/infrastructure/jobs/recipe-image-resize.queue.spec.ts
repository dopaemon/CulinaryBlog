import { RecipeImageResizeQueue } from './recipe-image-resize.queue';

describe('recipe image resize retry policy', () => {
  it('cho phép một lần xử lý đầu và ba lần thử lại', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = Object.create(RecipeImageResizeQueue.prototype) as RecipeImageResizeQueue;
    Object.defineProperty(queue, 'queue', { value: { add } });
    const job = {
      imageId: '38cd0ac5-58f8-4b9f-9161-c311958c4eed',
      recipeId: '717a72bb-a9a5-46f3-9b6a-9438f23bb997',
      sourceObjectKey: 'recipes/image.jpg',
    };

    await queue.enqueue(job);

    expect(add).toHaveBeenCalledWith(
      'resize-recipe-image',
      job,
      expect.objectContaining({
        jobId: job.imageId,
        attempts: 4,
        backoff: { type: 'exponential', delay: 1_000 },
      }),
    );
  });
});
