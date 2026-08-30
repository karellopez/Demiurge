import { describe, expect, it } from 'vitest';

import { QualityTier } from '@domain/quality-tier';
import { detectQualityTier } from '@features/diagnostics/detect-quality-tier';
import { aHost } from '@tests/fixtures/host-capabilities';

describe('when WebGL2 is unavailable', () => {
  it('falls to the lowest tier', () => {
    expect(detectQualityTier(aHost({ supportsWebGL2: false })).tier).toBe(QualityTier.Potato);
  });

  it('says so in plain language', () => {
    expect(detectQualityTier(aHost({ supportsWebGL2: false })).reason).toContain(
      'WebGL2 is unavailable',
    );
  });

  it('ignores an otherwise capable machine', () => {
    const selection = detectQualityTier(
      aHost({ supportsWebGL2: false, hardwareConcurrency: 32, deviceMemoryGiB: 64 }),
    );
    expect(selection.tier).toBe(QualityTier.Potato);
  });
});

describe('reading the renderer string', () => {
  it('recognises an Intel UHD 620 as the Potato reference machine', () => {
    const selection = detectQualityTier(
      aHost({
        rendererDescription:
          'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        hardwareConcurrency: 4,
        deviceMemoryGiB: 8,
      }),
    );
    expect(selection.tier).toBe(QualityTier.Potato);
  });

  it('recognises a software rasteriser as Potato', () => {
    expect(detectQualityTier(aHost({ rendererDescription: 'SwiftShader Device' })).tier).toBe(
      QualityTier.Potato,
    );
  });

  it('recognises an Iris Xe as the Low reference machine', () => {
    const selection = detectQualityTier(
      aHost({ rendererDescription: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, D3D11)' }),
    );
    expect(selection.tier).toBe(QualityTier.Low);
  });

  it('recognises an RTX card as High', () => {
    expect(detectQualityTier(aHost()).tier).toBe(QualityTier.High);
  });

  it('treats an unrecognised GPU as modest rather than fast', () => {
    expect(detectQualityTier(aHost({ rendererDescription: 'Mesa Bifrost G610' })).tier).toBe(
      QualityTier.Low,
    );
  });

  it('treats a withheld renderer string as modest rather than fast', () => {
    expect(detectQualityTier(aHost({ rendererDescription: '' })).tier).toBe(QualityTier.Low);
  });
});

describe('system limits clamp the GPU verdict', () => {
  it('drops a fast GPU to Potato when there are too few cores to stream terrain', () => {
    expect(detectQualityTier(aHost({ hardwareConcurrency: 2 })).tier).toBe(QualityTier.Potato);
  });

  it('drops a fast GPU to Low when reported memory is small', () => {
    expect(detectQualityTier(aHost({ deviceMemoryGiB: 4 })).tier).toBe(QualityTier.Low);
  });

  it('does not clamp when memory is undisclosed', () => {
    expect(detectQualityTier(aHost({ deviceMemoryGiB: undefined })).tier).toBe(QualityTier.High);
  });

  it('leaves an already-low tier alone when memory is small', () => {
    const selection = detectQualityTier(
      aHost({ rendererDescription: 'AMD Radeon Vega 8 Graphics', deviceMemoryGiB: 4 }),
    );
    expect(selection.tier).toBe(QualityTier.Low);
  });
});

describe('the GPU micro-benchmark outranks the renderer name', () => {
  it('demotes a well-named GPU that measures slowly', () => {
    expect(detectQualityTier(aHost({ microBenchmarkScore: 0.1 })).tier).toBe(QualityTier.Potato);
  });

  it('promotes a modest-looking GPU that measures quickly', () => {
    const selection = detectQualityTier(
      aHost({ rendererDescription: 'Mesa Bifrost G610', microBenchmarkScore: 4 }),
    );
    expect(selection.tier).toBe(QualityTier.High);
  });

  it('will not promote a machine the renderer string called Potato', () => {
    const selection = detectQualityTier(
      aHost({ rendererDescription: 'llvmpipe (LLVM 15.0.7)', microBenchmarkScore: 4 }),
    );
    expect(selection.tier).toBe(QualityTier.Potato);
  });

  it('leaves the verdict alone for a mid-range score', () => {
    expect(detectQualityTier(aHost({ microBenchmarkScore: 1.5 })).tier).toBe(QualityTier.High);
  });
});

describe('the reason string', () => {
  it('names the GPU, the cores, the memory and the benchmark', () => {
    const reason = detectQualityTier(aHost({ microBenchmarkScore: 2.25 })).reason;
    expect(reason).toContain('RTX 3060');
    expect(reason).toContain('12 logical cores');
    expect(reason).toContain('16 GiB reported memory');
    expect(reason).toContain('GPU benchmark 2.25');
  });

  it('admits when the GPU did not identify itself', () => {
    expect(detectQualityTier(aHost({ rendererDescription: '' })).reason).toContain(
      'an unnamed GPU',
    );
  });

  it('admits when memory was undisclosed', () => {
    expect(detectQualityTier(aHost({ deviceMemoryGiB: undefined })).reason).toContain(
      'undisclosed memory',
    );
  });

  it('admits when no benchmark has run yet', () => {
    expect(detectQualityTier(aHost()).reason).toContain('no GPU benchmark');
  });
});
