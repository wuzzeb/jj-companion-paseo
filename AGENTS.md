# Coding Guidelines

- Fight entropy. Leave the codebase better than you found it. Remove dead-code, unused parameters,
  etc.
- Every shortcut becomes someone else's burden. Every hack compounds into technical debt.
- Maintain clean architecture and consistent style. Push back on hacks.
- Functional programming preferred: avoid side effects and OOP
- No new dependencies without first some discussion
- Strict types: never use TypeScript `any`; use `readonly` properties and
  `ReadonlyArray`/`ReadonlyMap`. Complex dependent-style types are fine if needed.

## Version control with jj

- Use Jujutsu (`jj`) for version control queries and change management instead of Git.
- Before each chunk of work, inspect `jj status` and the current change. Start a new change with
  `jj new -m "scope: description"`, unless the current change is empty and has no description; in
  that case, use `jj desc -m "scope: description"` to name it.
- During the work, update the message with `jj desc -m "scope: description"` as the scope becomes
  clear. Use a concise, meaningful summary, with an optional body explaining what changed and why
  for the next session.
- Before finishing, review `jj diff` and ensure the description reflects the completed work. The
  user handles review and pushing.
