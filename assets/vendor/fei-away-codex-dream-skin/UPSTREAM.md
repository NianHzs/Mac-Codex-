# Codex Dream Skin Windows renderer

- Upstream: https://github.com/Fei-Away/Codex-Dream-Skin
- Source folder: `C:\Users\19128\Desktop\codexSkin\windows\assets`
- Pinned on: 2026-07-19
- License: MIT; see `LICENSE` and `NOTICE.md` in this directory.

The upstream Windows assets were copied from the source folder on 2026-07-19.
`renderer-inject.js` then received a Codework compatibility adaptation on 2026-07-27
for the local wallpaper/runtime bridge; its adapted digest is recorded separately so
that a later change cannot silently replace the reviewed runtime.

| Asset | SHA-256 |
| --- | --- |
| `dream-skin.css` | `926ada0a750a0ec3be68b4b8f1e5dcef5d58a85f3619b2b033856d4df216ef7b` |
| upstream `renderer-inject.js` | `0bfb5f66a0323bf1392b42033e66904de3ec4bfc8a5ba297f2bb92a4a6740a34` |
| adapted `renderer-inject.js` | `23dfd87fa65b9c33243b464bb453902728a047d10d3d7ab4c4e0c0d34d5f97c8` |

No third-party character or person image is vendored with this renderer. Theme art
is fetched only after member authorization and integrity verification.
