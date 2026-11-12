# JayJay DiffPane

Source:
https://github.com/hewigovens/jayjay/tree/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review

Copyright JayJay contributors. Apache-2.0; see LICENSE.

This is the standalone DiffPane, its diff model, theme metadata, and diff stylesheet. No app/shell
code, fonts, worker, WASM, review storage, or React runtime is included.

Local adaptations: explicit .js import extensions, readonly property/array types, the isolated
ReviewState type, and CSS exported as a string for Paseo's single bundle. Rendering behavior is
upstream's. The host supplies aligned rows and theme variables.

Regenerate from a source checkout with:

```sh
node tools/vendor-jayjay.mjs /path/to/jayjay
pnpm exec oxfmt client/vendor/jayjay
pnpm typecheck
pnpm test
```
