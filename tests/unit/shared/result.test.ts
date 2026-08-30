import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, mapErr, mapOk, ok, unwrapOr } from '@shared/result';

/** A stand-in for the shader-compile / asset-404 style failures Result carries. */
interface AssetMissing {
  readonly kind: 'asset-missing';
  readonly url: string;
}

const assetMissing: AssetMissing = { kind: 'asset-missing', url: '/textures/mars.ktx2' };

describe('constructing results', () => {
  it('carries a value on the successful branch', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('carries an error on the failed branch', () => {
    const result = err(assetMissing);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(assetMissing);
  });
});

describe('narrowing results', () => {
  it('recognises a success', () => {
    expect(isOk(ok('ready'))).toBe(true);
    expect(isErr(ok('ready'))).toBe(false);
  });

  it('recognises a failure', () => {
    expect(isErr(err(assetMissing))).toBe(true);
    expect(isOk(err(assetMissing))).toBe(false);
  });
});

describe('unwrapOr', () => {
  it('returns the carried value when the operation succeeded', () => {
    expect(unwrapOr(ok('fetched'), 'procedural')).toBe('fetched');
  });

  it('falls back to the procedural path when the asset was missing', () => {
    expect(unwrapOr(err(assetMissing), 'procedural')).toBe('procedural');
  });
});

describe('mapOk', () => {
  it('transforms a successful value', () => {
    const doubled = mapOk(ok(21), (value) => value * 2);
    expect(doubled).toStrictEqual(ok(42));
  });

  it('leaves a failure untouched and does not run the transform', () => {
    let calls = 0;
    const result = mapOk(err(assetMissing), (value: number) => {
      calls += 1;
      return value * 2;
    });
    expect(result).toStrictEqual(err(assetMissing));
    expect(calls).toBe(0);
  });
});

describe('mapErr', () => {
  it('adds context to an error as it crosses a layer boundary', () => {
    const contextualised = mapErr(
      err(assetMissing),
      (error) => `high-resolution imagery unavailable (${error.url}); using procedural terrain`,
    );
    expect(isErr(contextualised)).toBe(true);
    expect(
      unwrapOr(
        mapOk(contextualised, () => ''),
        'unused',
      ),
    ).toBe('unused');
  });

  it('leaves a success untouched and does not run the transform', () => {
    let calls = 0;
    const result = mapErr(ok('fetched'), (error: AssetMissing) => {
      calls += 1;
      return error.kind;
    });
    expect(result).toStrictEqual(ok('fetched'));
    expect(calls).toBe(0);
  });
});
