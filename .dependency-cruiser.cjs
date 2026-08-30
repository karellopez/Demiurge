/**
 * Architecture boundaries, machine-enforced.
 *
 * Five layers, dependencies point inward only:
 *
 *   app  ->  presentation  ->  features  ->  domain  ->  shared
 *
 * Every rule below is an error, not a warning: `npm run depcruise` is part of
 * `npm run qa` and CI fails on any violation. See docs/architecture.md.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- cycles
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means the two modules are really one module with an unclear seam. Extract the ' +
        'shared concept into its own file, or invert the dependency with a port.',
      from: {},
      to: { circular: true },
    },

    // ------------------------------------------------- inward-only layering
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment: 'shared/ is the innermost layer: it may import nothing but itself (brief 4.1).',
      from: { path: '^src/shared/' },
      to: { path: '^src/(app|presentation|features|domain)/' },
    },
    {
      name: 'domain-imports-only-shared',
      severity: 'error',
      comment: 'domain/ may reach inward to shared/ and nowhere else (brief 4.1).',
      from: { path: '^src/domain/' },
      to: { path: '^src/(app|presentation|features)/' },
    },
    {
      name: 'features-do-not-reach-outward',
      severity: 'error',
      comment:
        'features/ orchestrate domain logic and talk to the outside world only through ports ' +
        'they declare. presentation/ supplies the adapters (brief 4.1).',
      from: { path: '^src/features/' },
      to: { path: '^src/(app|presentation)/' },
    },
    {
      name: 'presentation-does-not-reach-app',
      severity: 'error',
      comment: 'app/ is the composition root; nothing may import it (brief 4.1).',
      from: { path: '^src/presentation/' },
      to: { path: '^src/app/' },
    },

    // -------------------------------------------- features are independent
    {
      name: 'features-never-import-each-other',
      severity: 'error',
      comment:
        'Cross-feature communication goes through the typed event bus, never a direct import ' +
        '(brief 4.1). Shared logic belongs in domain/.',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/([^/]+)/',
        pathNot: '^src/features/$1/',
      },
    },

    // ---------------------------------------- domain and shared stay pure
    {
      name: 'domain-and-shared-are-platform-free',
      severity: 'error',
      comment:
        'domain/ and shared/ are pure, synchronous and deterministic: no three.js, no DOM, no ' +
        'node builtins. They must be unit-testable in Node with no environment (brief 4.1).',
      from: { path: '^src/(domain|shared)/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'core'],
      },
    },

    // -------------------------------------------------------- hygiene rules
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'An unreachable module is dead code. Delete it or wire it up (knip agrees).',
      from: {
        orphan: true,
        pathNot: [
          String.raw`(^|/)\.[^/]+\.(js|cjs|mjs|ts|json)$`,
          String.raw`\.d\.ts$`,
          String.raw`(^|/)tsconfig\.json$`,
          String.raw`(^|/)(babel|webpack)\.config\.(js|cjs|mjs|ts|json)$`,
        ],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Deprecated node core modules will be removed; use the modern equivalent.',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: '^(punycode|domain|constants|sys|_linklist|_stream_wrap)$',
      },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Shipped code must not import a devDependency; it will not exist in the bundle.',
      from: { path: '^src/', pathNot: String.raw`\.(spec|test)\.ts$` },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'An import that is not declared in package.json breaks a clean clone.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'unknown'] },
    },
    {
      name: 'not-resolvable',
      severity: 'error',
      comment:
        'This import does not resolve to anything. A package that is neither installed nor listed ' +
        'in package.json is typed `unknown` rather than `npm-no-pkg`, so without this rule it ' +
        'passes the cruise silently and only fails on a clean clone.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-duplicate-dep-types',
      severity: 'error',
      comment: 'A package listed in two dependency sections resolves unpredictably.',
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'src-does-not-import-tests',
      severity: 'error',
      comment: 'Production code must never depend on test fixtures.',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: String.raw`\.d\.ts$` },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.ts', '.mjs', '.cjs'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^src/(app|presentation|features|domain|shared)(/[^/]+)?',
        theme: {
          graph: { rankdir: 'TD', splines: 'ortho', bgcolor: 'transparent' },
          modules: [
            { criteria: { source: '^src/app' }, attributes: { fillcolor: '#e8d5b7' } },
            { criteria: { source: '^src/presentation' }, attributes: { fillcolor: '#b7d5e8' } },
            { criteria: { source: '^src/features' }, attributes: { fillcolor: '#c7e8b7' } },
            { criteria: { source: '^src/domain' }, attributes: { fillcolor: '#e8b7c7' } },
            { criteria: { source: '^src/shared' }, attributes: { fillcolor: '#d5c7e8' } },
          ],
        },
      },
      archi: {
        collapsePattern: '^src/(app|presentation|features|domain|shared)(/[^/]+)?',
      },
    },
  },
};
