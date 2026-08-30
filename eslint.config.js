// Flat config. Rule choices implement docs/contributing/coding-standards.md and
// the gates in docs/quality.md. Anything that cannot be expressed as a lint rule
// (class length, TSDoc coverage, maintainability index) is checked by
// scripts/qa-report.ts instead.
import js from '@eslint/js';
import { recommended as commentsRecommended } from '@eslint-community/eslint-plugin-eslint-comments/configs';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Files that are tooling, not shipped code, and so carry relaxed budgets. */
const TOOLING_GLOBS = ['scripts/**/*.ts', '*.config.ts', '*.config.js', 'tests/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'reports/**',
      '.stryker-tmp/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  commentsRecommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  sonarjs.configs.recommended,
  unicorn.configs.recommended,
  jsdoc.configs['flat/recommended-typescript-error'],

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: {
          // The app and the tooling are separate TypeScript projects on purpose
          // (different libs, different globals); the warning is not actionable.
          defaultProject: 'tsconfig.app.json',
          allowDefaultProject: ['*.js', '*.cjs'],
          // Two projects is the intended shape here, not a misconfiguration.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 8,
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.worker },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.e2e.json'],
          // The app and the tooling are deliberately separate projects with
          // different libs and globals, so the resolver's nudge does not apply.
          noWarnOnMultipleProjects: true,
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // -- Size and complexity budgets (brief 4.2) --------------------------
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-params': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],

      // -- Type safety (brief 1.4) -------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/prefer-readonly': 'error',

      // -- Error handling (brief 4.2): never swallow -------------------------
      '@typescript-eslint/only-throw-error': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],

      // -- Cleanliness (brief 3, commit rules) -------------------------------
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'no-param-reassign': ['error', { props: true }],
      // A deferred-work marker must carry an issue link (brief 3); a bare one
      // fails the build rather than ageing quietly in the source.
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],

      // -- Disable directives must be justified (brief 5.2) ------------------
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',

      // -- Imports -----------------------------------------------------------
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // -- Naming (brief 4.2) -------------------------------------------------
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'objectLiteralProperty', format: null },
      ],

      // -- unicorn adjustments ------------------------------------------------
      // Abbreviations are domain vocabulary here (RA/Dec, LOD, RCS, AGL, GM).
      'unicorn/prevent-abbreviations': 'off',
      // `null` is meaningful at the three.js and DOM boundary.
      'unicorn/no-null': 'off',
      'unicorn/number-literal-case': 'off',
      // `Ok` / `Err` is the established vocabulary for a Result type. Renaming
      // `Err` to `Error_` would read as a mistake, not as a clarification.
      'unicorn/name-replacements': 'off',
      // `x | 0` here is deliberate 32-bit wrap-around, which is what the RNG and
      // the noise hash are defined in terms of. `Math.trunc` does not wrap, so
      // this rule's fix would silently change every generated world.
      'unicorn/prefer-math-trunc': 'off',
      // The seed hash is defined over UTF-16 code units; `codePointAt` would
      // change the result for any seed containing a surrogate pair.
      'unicorn/prefer-code-point': 'off',
      // One-line TSDoc (`/** Metres per second. */`) is the house style, and
      // this rule's autofix rewrites it into a block that drops the leading `*`.
      'unicorn/single-line-block-comment-style': 'off',

      // -- TSDoc on the public API (brief 4.2) --------------------------------
      // Presence is measured by scripts/qa-report.ts; this enforces the shape.
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/tag-lines': 'off',
    },
  },

  // `domain/` and `shared/` are pure: no ambient platform globals at all.
  {
    files: ['src/domain/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ and shared/ must stay platform-free (brief 4.1).' },
        { name: 'document', message: 'domain/ and shared/ must stay platform-free (brief 4.1).' },
        { name: 'performance', message: 'Inject a Clock port instead (brief 4.3).' },
        { name: 'navigator', message: 'domain/ and shared/ must stay platform-free (brief 4.1).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'Time comes from an injected Clock port, never from Date (brief 4.3).',
        },
        {
          selector: 'MemberExpression[object.name="Math"][property.name="random"]',
          message: 'Use the seeded Rng from shared/rng.ts; the universe is deterministic (1.6).',
        },
      ],
    },
  },

  // Tooling and tests: relaxed budgets, Node globals, console allowed.
  {
    files: TOOLING_GLOBS,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      'max-lines-per-function': 'off',
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'sonarjs/no-nested-functions': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/no-anonymous-default-export': 'off',
      // The TypeScript compiler API and the ESLint plugins are used through
      // their default export, which is how both document themselves.
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // Tests describe behaviour; a few strictness rules get in the way there.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'max-nested-callbacks': ['error', 5],
      // Conversion round-trips read best as one nested expression:
      // `toRawMeters(kilometersToMeters(kilometers(6371)))`.
      'unicorn/max-nested-calls': 'off',
      // `fc.assert` / `fc.property` is fast-check's documented calling style.
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // ESLint plugins conventionally export both a default object and named members
  // of it, and their documented usage is the default import. The two rules that
  // warn about that shape are noise in a flat config and nowhere else.
  {
    files: ['eslint.config.js', '*.config.js', '*.config.ts'],
    rules: {
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // CommonJS tool configs sit outside every tsconfig, so they are linted
  // without type information rather than being excluded from linting entirely.
  {
    files: ['**/*.js', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.node },
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      // Keep the type-aware rules switched off; adding a `rules` key would
      // otherwise replace the set `disableTypeChecked` turns off.
      ...tseslint.configs.disableTypeChecked.rules,
      // These files are plain JavaScript, so `@type` is the only way to get the
      // editor to check them; the rule's "redundant" applies to TypeScript only.
      'jsdoc/check-tag-names': ['error', { typed: false }],
    },
  },
);
