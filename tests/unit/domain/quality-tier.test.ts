import { describe, expect, it } from 'vitest';

import {
  QUALITY_TIER_ORDER,
  QualityTier,
  TIER_BUDGETS,
  budgetFor,
  isWithinFrameBudget,
  strongerTier,
  weakerTier,
} from '@domain/quality-tier';

describe('the tier ladder', () => {
  it('runs weakest to strongest', () => {
    expect([...QUALITY_TIER_ORDER]).toStrictEqual([
      QualityTier.Potato,
      QualityTier.Low,
      QualityTier.Medium,
      QualityTier.High,
    ]);
  });

  it('covers every tier exactly once', () => {
    expect(new Set(QUALITY_TIER_ORDER).size).toBe(Object.keys(TIER_BUDGETS).length);
  });
});

describe('budgets', () => {
  it('holds the Potato target of 30 fps with no frame over 50 ms', () => {
    const budget = budgetFor(QualityTier.Potato);
    expect(budget.targetFramesPerSecond).toBe(30);
    expect(budget.worstFrameMs).toBe(50);
  });

  it('tightens the frame-time budget monotonically as tiers get stronger', () => {
    const p95 = QUALITY_TIER_ORDER.map((tier) => budgetFor(tier).frameTimeP95Ms);
    for (let index = 1; index < p95.length; index += 1) {
      expect(p95[index]!).toBeLessThanOrEqual(p95[index - 1]!);
    }
  });

  it('raises the draw-call budget monotonically as tiers get stronger', () => {
    const drawCalls = QUALITY_TIER_ORDER.map((tier) => budgetFor(tier).maxDrawCalls);
    for (let index = 1; index < drawCalls.length; index += 1) {
      expect(drawCalls[index]!).toBeGreaterThan(drawCalls[index - 1]!);
    }
  });

  it('raises the texture budget monotonically as tiers get stronger', () => {
    const texture = QUALITY_TIER_ORDER.map((tier) => budgetFor(tier).textureBudgetMiB);
    for (let index = 1; index < texture.length; index += 1) {
      expect(texture[index]!).toBeGreaterThan(texture[index - 1]!);
    }
  });

  it('relaxes terrain vertex spacing on Potato as the brief allows', () => {
    expect(budgetFor(QualityTier.Potato).terrainVertexSpacing).toBe(2);
    expect(budgetFor(QualityTier.Low).terrainVertexSpacing).toBe(1);
  });
});

describe('stepping the ladder', () => {
  it('steps down one tier at a time', () => {
    expect(weakerTier(QualityTier.High)).toBe(QualityTier.Medium);
    expect(weakerTier(QualityTier.Medium)).toBe(QualityTier.Low);
    expect(weakerTier(QualityTier.Low)).toBe(QualityTier.Potato);
  });

  it('stops at the floor rather than falling off the ladder', () => {
    expect(weakerTier(QualityTier.Potato)).toBe(QualityTier.Potato);
  });

  it('steps up one tier at a time', () => {
    expect(strongerTier(QualityTier.Potato)).toBe(QualityTier.Low);
    expect(strongerTier(QualityTier.Low)).toBe(QualityTier.Medium);
    expect(strongerTier(QualityTier.Medium)).toBe(QualityTier.High);
  });

  it('stops at the ceiling rather than running past it', () => {
    expect(strongerTier(QualityTier.High)).toBe(QualityTier.High);
  });
});

describe('isWithinFrameBudget', () => {
  it('accepts a frame time exactly on budget', () => {
    expect(isWithinFrameBudget(QualityTier.Medium, 14)).toBe(true);
  });

  it('accepts a frame time under budget', () => {
    expect(isWithinFrameBudget(QualityTier.Low, 12)).toBe(true);
  });

  it('rejects a frame time over budget', () => {
    expect(isWithinFrameBudget(QualityTier.High, 12.1)).toBe(false);
  });
});

describe('the neighbour tables agree with the ladder', () => {
  it('steps down to the ladder position before each tier', () => {
    for (const [index, tier] of QUALITY_TIER_ORDER.entries()) {
      expect(weakerTier(tier)).toBe(QUALITY_TIER_ORDER[Math.max(0, index - 1)]);
    }
  });

  it('steps up to the ladder position after each tier', () => {
    const last = QUALITY_TIER_ORDER.length - 1;
    for (const [index, tier] of QUALITY_TIER_ORDER.entries()) {
      expect(strongerTier(tier)).toBe(QUALITY_TIER_ORDER[Math.min(last, index + 1)]);
    }
  });
});
