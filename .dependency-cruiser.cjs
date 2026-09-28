/**
 * Import-graph rules that per-file ESLint can't see. Layer direction is enforced by
 * eslint-plugin-boundaries; this catches cycles, framework leaks into pure code, and
 * production code importing tests.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "No circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      comment: "Domain rules import no framework, database client or Node built-in.",
      severity: "error",
      from: { path: "^src/domain/", pathNot: "\\.test\\.ts$" },
      to: {
        path: "^node_modules/(next|react|react-dom|@supabase|server-only)/",
        dependencyTypes: ["npm"],
      },
    },
    {
      name: "domain-no-node-builtins",
      severity: "error",
      from: { path: "^src/domain/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "not-to-test-files",
      comment: "Production code does not import tests.",
      severity: "error",
      from: { pathNot: "\\.test\\.[mc]?[jt]sx?$" },
      to: { path: "\\.test\\.[mc]?[jt]sx?$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
