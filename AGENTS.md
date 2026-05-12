# Agent notes

These instructions apply to any coding agent (Codex, Claude Code, etc.) working in this repo.

## Local dev server — start it in the background correctly

The repo runs as a static site + Node API via `scripts/local-server.mjs` on
`http://127.0.0.1:4173`.

**Do NOT** start the server like this on Windows:

```
cmd /c start /b "" node scripts\local-server.mjs > .out.log 2> .err.log
```

`cmd` keeps the redirected stdout/stderr handles open for the child, so the outer
`cmd` (and therefore the agent's tool call) **never returns** until the server
exits — it looks like the command is "hanging" for many seconds or forever.

**Use the provided scripts instead** — they spawn a fully detached child with
`detached: true` + `unref()`, so the launcher returns immediately:

- Start (idempotent — no-op if port 4173 is already listening):
  ```
  npm run dev:bg
  ```
- Stop:
  ```
  npm run stop:bg
  ```
- Foreground (only when you actually want to tail logs in the same shell):
  ```
  npm run dev
  ```

Logs go to `.local-server.out.log` / `.local-server.err.log`; pid is tracked in
`.local-server.pid`.
