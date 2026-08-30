/**
 * Why start-up can fail, and how to say so to a person.
 *
 * A blank page with a stack trace in the console is the worst possible outcome
 * on a static host: nobody opens the console, and the report that eventually
 * arrives says only "it didn't work". Every expected failure therefore gets a
 * sentence that names what happened and what to try.
 *
 * @module
 */

/** Why start-up could not proceed. Expected failures, not programmer errors. */
export type BootFailure =
  | { readonly kind: 'missing-mount-point'; readonly selector: string }
  | { readonly kind: 'webgl2-unavailable' };

/**
 * Renders a start-up failure as something a person can act on.
 *
 * @param failure - The reason start-up stopped.
 * @returns A sentence explaining what happened and what to try.
 */
export function describeBootFailure(failure: BootFailure): string {
  switch (failure.kind) {
    case 'missing-mount-point': {
      return `Demiurge could not start: no element matched "${failure.selector}".`;
    }
    case 'webgl2-unavailable': {
      return 'Demiurge needs WebGL2, which this browser did not provide. Try a current Chrome, Edge, Firefox or Safari, and check that hardware acceleration is enabled.';
    }
  }
}
