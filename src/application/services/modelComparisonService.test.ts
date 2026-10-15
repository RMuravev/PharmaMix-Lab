import { describe, expect, it } from 'vitest';
import { compareModelsOnSameTestWindow } from './modelComparisonService';

describe('compareModelsOnSameTestWindow', () => {
  it('ranks models by WAPE on the same ordered actual values', () => {
    const result = compareModelsOnSameTestWindow([
      { modelId: 'rough', testWindowId: '2026-Q1', actual: [100, 200, 300], predicted: [130, 170, 330] },
      { modelId: 'close', testWindowId: '2026-Q1', actual: [100, 200, 300], predicted: [105, 195, 305] },
    ]);
    expect(result[0].modelId).toBe('close');
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('rejects different temporal windows', () => {
    expect(() => compareModelsOnSameTestWindow([
      { modelId: 'a', testWindowId: '2026-Q1', actual: [1, 2], predicted: [1, 2] },
      { modelId: 'b', testWindowId: '2026-Q2', actual: [1, 2], predicted: [1, 2] },
    ])).toThrow(/разных testWindowId/);
  });

  it('rejects different actual vectors even when window IDs match', () => {
    expect(() => compareModelsOnSameTestWindow([
      { modelId: 'a', testWindowId: 'holdout-1', actual: [1, 2], predicted: [1, 2] },
      { modelId: 'b', testWindowId: 'holdout-1', actual: [1, 3], predicted: [1, 3] },
    ])).toThrow(/фактические значения/);
  });

  it('handles zero actual values without relying on MAPE', () => {
    const result = compareModelsOnSameTestWindow([
      { modelId: 'a', testWindowId: 'holdout-1', actual: [0, 0], predicted: [1, 1] },
      { modelId: 'b', testWindowId: 'holdout-1', actual: [0, 0], predicted: [0.5, 0.5] },
    ]);
    expect(result[0].modelId).toBe('b');
    expect(result[0].diagnostics.mapePct).toBeNull();
    expect(result[0].diagnostics.wapePct).toBeNull();
  });

  it('rejects duplicate model identifiers', () => {
    expect(() => compareModelsOnSameTestWindow([
      { modelId: 'same', testWindowId: 'w', actual: [1], predicted: [1] },
      { modelId: 'same', testWindowId: 'w', actual: [1], predicted: [2] },
    ])).toThrow(/Повторяется modelId/);
  });
});
