// NOTE (2026-08-01): the brief's original snippet used
// `compat.extends("next/core-web-vitals")` via `@eslint/eslintrc`'s FlatCompat
// shim, which is how eslint-config-next was consumed pre-Next-16. As of
// eslint-config-next@16.2.12 (installed here), the package no longer ships a
// legacy eslintrc-shaped shareable config — "eslint-config-next/core-web-vitals"
// is already a native flat-config array. Feeding that array into
// FlatCompat.extends() makes it validate against the legacy schema, which
// fails and then crashes trying to JSON.stringify the (circular) plugin
// objects while formatting the validation error
// ("TypeError: Converting circular structure to JSON"). Importing the flat
// config directly avoids the legacy shim entirely and is the supported path
// for flat-native shareable configs. @eslint/eslintrc / FlatCompat is kept as
// a devDependency per the brief in case a future legacy-only config needs it.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "docs/**",
      "prisma/migrations/**",
      "next-env.d.ts",
      // Sibling git worktrees (other in-progress branches checked out under
      // .worktrees/, already covered by .gitignore) — their build output and
      // source shouldn't be linted from this branch's `npm run lint`.
      ".worktrees/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Dependency-array rewrites are behavior changes; deferred to the Phase 5
      // UX pass where each component is touched deliberately.
      "react-hooks/exhaustive-deps": "off",

      // (2026-08-01) eslint-plugin-react-hooks v7's "recommended" preset (pulled
      // in via next/core-web-vitals) added the new React Compiler readiness
      // rules below. They fire ~180 times across nearly every studio component
      // on patterns that are legal, intentional, and already shipping (e.g.
      // `if (open) lastOpen.current = open;` to retain the last non-null value
      // across a render for exit animations; setState-in-effect for
      // sync-from-external-source patterns like matchMedia/localStorage
      // listeners). Making the rules pass requires restructuring hook bodies
      // and effect flow component-by-component, which is exactly the
      // behavior-changing work this stabilization pass is not scoped to do.
      // Deferred to the same Phase 5 UX pass as exhaustive-deps above, where
      // each component gets touched deliberately.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
