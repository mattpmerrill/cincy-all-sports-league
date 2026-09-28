Read [AGENTS.md](AGENTS.md) first. It is the contract for this repo.

Claude-specific notes:

- This is Next.js 16, which differs from older versions. Check `node_modules/next/dist/docs/`
  before using a Next API (for example `proxy.ts` replaces `middleware.ts`, and `params` is a
  promise).
- Run `pnpm check` after your last edit and say what you ran. If a UI change was not viewed in a
  browser, say so.
- Never print or commit `.env.local`.
- Do not disable a lint rule to make code pass; move the code to the right layer.
