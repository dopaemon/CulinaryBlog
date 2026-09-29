import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node thuần: các test hiện tại chỉ chạm lớp dữ liệu, `window`/`localStorage` được
    // stub ngay trong file test nên không cần thêm jsdom/happy-dom.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
