import { describe, expect, it } from 'vitest';

import { classifyGpu } from '@features/diagnostics/gpu-markers';

describe('classifying a GPU from its renderer string', () => {
  it('recognises integrated Intel parts as weak', () => {
    expect(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)')).toBe('weak');
    expect(classifyGpu('Intel(R) HD Graphics 4000')).toBe('weak');
  });

  it('recognises software rasterisers as weak', () => {
    expect(classifyGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('weak');
    expect(classifyGpu('SwiftShader Device')).toBe('weak');
    expect(classifyGpu('Microsoft Basic Render Driver')).toBe('weak');
  });

  it('recognises modern integrated and older discrete parts as midrange', () => {
    expect(classifyGpu('Intel(R) Iris(R) Xe Graphics')).toBe('midrange');
    expect(classifyGpu('AMD Radeon Vega 8 Graphics')).toBe('midrange');
    expect(classifyGpu('NVIDIA GeForce GTX 1650')).toBe('midrange');
    expect(classifyGpu('Apple M1')).toBe('midrange');
  });

  it('recognises current discrete parts as strong', () => {
    expect(classifyGpu('NVIDIA GeForce RTX 3060')).toBe('strong');
    expect(classifyGpu('AMD Radeon RX 7900 XT')).toBe('strong');
    expect(classifyGpu('Apple M3 Pro')).toBe('strong');
  });

  it('is case insensitive', () => {
    expect(classifyGpu('NVIDIA GEFORCE RTX 4090')).toBe('strong');
  });

  it('prefers the weaker reading when a string matches more than one list', () => {
    // "Radeon RX Vega 64" carries both a strong and a midrange marker; a wrong
    // guess upward is the expensive one, so weak and midrange win over strong.
    expect(classifyGpu('AMD Radeon RX Vega 64')).toBe('midrange');
  });

  it('has no opinion about an empty or unrecognised string', () => {
    expect(classifyGpu('')).toBeUndefined();
    expect(classifyGpu('Mesa Bifrost G610')).toBeUndefined();
  });
});
