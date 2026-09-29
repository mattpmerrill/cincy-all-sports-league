import { defineConfig, globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer direction (see docs/architecture.md):
 *
 *   app -> features -> data -> domain
 *      \       \-> integrations -> domain
 *       \-> ui                    lib: imported by anyone above, imports only lib
 *
 * domain is pure: it imports only other domain modules.
 */
const ALLOWED = {
  app: ["features", "ui", "domain", "lib"],
  features: ["data", "integrations", "ui", "domain", "lib"],
  data: ["domain", "lib"],
  integrations: ["domain", "lib"],
  ui: ["domain", "lib"],
  domain: [],
  lib: [],
};

const layerPolicies = Object.entries(ALLOWED).map(([from, to]) => ({
  from: { element: { type: from } },
  allow: {
    to: { element: { types: { anyOf: [from, ...to] } } },
  },
}));

const boundaryRules = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "boundaries/elements": ["app", "features", "data", "domain", "integrations", "lib", "ui"].map(
      (type) => ({ type, pattern: `src/${type}/**`, partialMatch: false }),
    ),
  },
  rules: {
    "boundaries/dependencies": ["error", { default: "disallow", policies: layerPolicies }],
  },
};

/** Colors, radii, shadows and z-indexes come from the tokens in globals.css, never literals. */
const HEX = "#[0-9a-fA-F]{3,8}\\b";
const COLOR_FN = "\\b(?:rgb|rgba|hsl|hsla|oklch)\\(";
const ARBITRARY = "\\b(?:z|rounded|shadow)-\\[";
const PALETTE =
  "\\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:red|green|blue|yellow|orange|amber|lime|teal|cyan|sky|indigo|violet|purple|pink|rose|fuchsia|slate|gray|zinc|neutral|stone|black|white)(?:-\\d{2,3})?\\b";
const banned = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  boundaryRules,
  {
    // One feature never imports another; app/ composes them.
    files: ["src/features/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "../../*"],
              message:
                "Features don't import each other. Compose them in app/ or move shared code down a layer.",
            },
          ],
        },
      ],
    },
  },
  {
    // Pure domain code must not touch frameworks or the database.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*", "@supabase/*", "server-only"],
              message: "domain is pure TypeScript: no framework or database imports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    // Files rendered outside the CSS pipeline (OS manifest, generated images) can't use tokens.
    ignores: [
      "**/*.test.ts",
      "src/app/layout.tsx",
      "src/app/manifest.ts",
      "src/app/icon.tsx",
      "src/app/apple-icon.tsx",
      "src/app/opengraph-image.tsx",
      // Email clients can't read CSS variables; the palette mirrors the tokens with literals.
      "src/ui/email/palette.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...banned(HEX, "No hex color: use a token from globals.css."),
        ...banned(COLOR_FN, "No literal color function: use a token from globals.css."),
        ...banned(
          ARBITRARY,
          "No literal radius, shadow or z-index: add it to the scale in globals.css.",
        ),
        ...banned(
          PALETTE,
          "No raw palette class: use the design tokens (bg-surface, text-brand, ...).",
        ),
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Environment is parsed once, centrally, in lib/env*.ts.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts", "src/lib/env.server.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration through publicEnv() / serverEnv() in @/lib.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    // Supabase CLI scratch space (edge runtime bundles, secrets); git-ignored, never our code.
    "supabase/.temp/**",
  ]),
]);
