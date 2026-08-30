import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeBootFailure } from '@app/boot-failure';
import { startApplication } from '@app/composition-root';
import { readSeedFromHash } from '@app/session-url';
import { QualityTier } from '@domain/quality-tier';
import { probeHostCapabilities } from '@presentation/render/webgl-host-capabilities';
import {
  combineDiagnosticsSinks,
  createConsoleDiagnosticsSink,
  mountBootScreen,
} from '@presentation/ui/boot-screen';
import { installFakeWebGl } from '@tests/fixtures/fake-webgl';
import { aHost } from '@tests/fixtures/host-capabilities';

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the capability probe', () => {
  it('reads the unmasked renderer string when the browser offers it', () => {
    installFakeWebGl({ rendererDescription: 'NVIDIA GeForce RTX 4080' });
    expect(probeHostCapabilities().rendererDescription).toBe('NVIDIA GeForce RTX 4080');
  });

  it('falls back to the plain renderer string when debug info is withheld', () => {
    installFakeWebGl({ withholdsRendererInfo: true });
    expect(probeHostCapabilities().rendererDescription).toBe('WebKit WebGL');
  });

  it('releases the probe context so the real renderer can have one', () => {
    const fake = installFakeWebGl();
    probeHostCapabilities();
    expect(fake.wasReleased()).toBe(true);
  });

  it('reports WebGL2 as unavailable when no context is granted', () => {
    installFakeWebGl({ refusesContext: true });
    expect(probeHostCapabilities().supportsWebGL2).toBe(false);
  });

  it('survives a browser that throws on context creation', () => {
    installFakeWebGl({ throwsOnContext: true });
    vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    expect(probeHostCapabilities().supportsWebGL2).toBe(false);
  });

  it('always reports at least one logical core', () => {
    installFakeWebGl();
    expect(probeHostCapabilities().hardwareConcurrency).toBeGreaterThanOrEqual(1);
  });
});

describe('the boot screen', () => {
  it('renders the title and the resolved tier', () => {
    const host = document.querySelector<HTMLElement>('#app')!;
    const sink = mountBootScreen(host);
    sink.report({
      selection: { tier: QualityTier.Low, reason: 'Selected low from a test.' },
      capabilities: aHost(),
      seedPhrase: 'cobalt meridian 417',
    });

    expect(host.textContent).toContain('DEMIURGE');
    expect(host.textContent).toContain('LOW');
    expect(host.textContent).toContain('Selected low from a test.');
  });

  it('shows the budget belonging to the reported tier', () => {
    const host = document.querySelector<HTMLElement>('#app')!;
    mountBootScreen(host).report({
      selection: { tier: QualityTier.Potato, reason: 'test' },
      capabilities: aHost(),
      seedPhrase: 'first light',
    });
    expect(host.textContent).toContain('30 fps');
    expect(host.textContent).toContain('400');
  });

  it('says so plainly when the GPU withheld its name', () => {
    const host = document.querySelector<HTMLElement>('#app')!;
    mountBootScreen(host).report({
      selection: { tier: QualityTier.Low, reason: 'test' },
      capabilities: aHost({ rendererDescription: '' }),
      seedPhrase: 'first light',
    });
    expect(host.textContent).toContain('not disclosed');
  });

  it('replaces any previous content rather than appending to it', () => {
    const host = document.querySelector<HTMLElement>('#app')!;
    host.textContent = 'stale';
    mountBootScreen(host);
    expect(host.textContent).not.toContain('stale');
  });
});

describe('the diagnostics sinks', () => {
  it('mirrors the report to the console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(vi.fn());
    createConsoleDiagnosticsSink().report({
      selection: { tier: QualityTier.Medium, reason: 'Selected medium from a test.' },
      capabilities: aHost(),
      seedPhrase: 'first light',
    });
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]![0]).toContain('quality tier: medium');
  });

  it('fans one report out to every sink', () => {
    const calls: string[] = [];
    const record = (name: string) => ({
      report: (): void => {
        calls.push(name);
      },
    });
    combineDiagnosticsSinks([record('first'), record('second')]).report({
      selection: { tier: QualityTier.High, reason: 'test' },
      capabilities: aHost(),
      seedPhrase: 'first light',
    });
    expect(calls).toStrictEqual(['first', 'second']);
  });
});

describe('starting the application', () => {
  it('boots and reports a tier when the host is capable', () => {
    installFakeWebGl({ rendererDescription: 'NVIDIA GeForce RTX 3060' });
    vi.spyOn(console, 'info').mockImplementation(vi.fn());

    const started = startApplication({ mountSelector: '#app' });
    expect(started.ok).toBe(true);
    expect(started.ok && started.value.tier).toBe(QualityTier.High);
  });

  it('clears the mount point when disposed', () => {
    installFakeWebGl();
    vi.spyOn(console, 'info').mockImplementation(vi.fn());

    const started = startApplication({ mountSelector: '#app' });
    expect(started.ok).toBe(true);
    if (started.ok) {
      started.value.dispose();
    }
    expect(document.querySelector('#app')!.textContent).toBe('');
  });

  it('fails with a named reason when the mount point is missing', () => {
    const started = startApplication({ mountSelector: '#nowhere' });
    expect(started.ok).toBe(false);
    expect(started.ok ? '' : started.error.kind).toBe('missing-mount-point');
  });

  it('fails with a named reason when WebGL2 is unavailable', () => {
    installFakeWebGl({ refusesContext: true });
    const started = startApplication({ mountSelector: '#app' });
    expect(started.ok).toBe(false);
    expect(started.ok ? '' : started.error.kind).toBe('webgl2-unavailable');
  });
});

describe('explaining a boot failure', () => {
  it('names the selector that matched nothing', () => {
    expect(describeBootFailure({ kind: 'missing-mount-point', selector: '#app' })).toContain(
      '"#app"',
    );
  });

  it('tells the player what to try when WebGL2 is missing', () => {
    const message = describeBootFailure({ kind: 'webgl2-unavailable' });
    expect(message).toContain('WebGL2');
    expect(message).toContain('hardware acceleration');
  });
});

describe('reading the seed from the URL', () => {
  it('finds a seed in a hash', () => {
    expect(readSeedFromHash('#seed=cobalt%20meridian')).toBe('cobalt meridian');
  });

  it('accepts a hash without its leading marker', () => {
    expect(readSeedFromHash('seed=tidal spire')).toBe('tidal spire');
  });

  it('returns nothing when the hash carries no seed', () => {
    expect(readSeedFromHash('#tier=low')).toBeUndefined();
    expect(readSeedFromHash('')).toBeUndefined();
  });

  it('carries the seed from the URL through to the title screen', () => {
    installFakeWebGl();
    vi.spyOn(console, 'info').mockImplementation(vi.fn());

    const started = startApplication({
      mountSelector: '#app',
      requestedSeed: readSeedFromHash('#seed=Umbral%20Vault%2012'),
    });

    expect(started.ok && started.value.seedPhrase).toBe('umbral vault 12');
    expect(document.querySelector('#app')!.textContent).toContain('umbral vault 12');
  });

  it('falls back to the default universe when the URL carries no seed', () => {
    installFakeWebGl();
    vi.spyOn(console, 'info').mockImplementation(vi.fn());

    const started = startApplication({ mountSelector: '#app' });
    expect(started.ok && started.value.seedPhrase).toBe('first light');
  });
});
