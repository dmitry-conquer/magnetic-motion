# Contributing

## Setup

```bash
pnpm install
pnpm run check
```

Use `pnpm dev` to run the documentation and interaction demo.

## Expectations

- Keep the runtime dependency-free.
- Preserve regular click, focus, and keyboard behavior.
- Add tests for behavior or lifecycle changes.
- Restore every DOM attribute and inline style changed by the runtime.
- Keep data attributes focused on practical static-site use cases.
