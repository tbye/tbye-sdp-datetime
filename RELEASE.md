# Building & releasing DateTime Composer

This guide covers packaging a `.streamDeckPlugin` on **Linux** (or any machine with Node), publishing a **GitHub release**, and submitting to **Elgato Marketplace**.

Last GitHub release on this repo was **1.0.2** (early 2024). Current `manifest.json` is **1.0.2.1**. After the recent feature work you’ll likely want **1.1.0** (or **1.0.3** if you prefer a patch-only bump).

---

## What changed since the old days

| Then (≈2024) | Now |
|--------------|-----|
| Elgato **DistributionTool** (Windows/Mac only), lived under `src/DistributionTool` (gitignored) | Official **Stream Deck CLI**: `npm i -g @elgato/cli` → `streamdeck pack` (**works on Linux**) |
| Manual zip / tool quirks | `./scripts/build-release.sh` validates, tests, and packs into `dist/` |
| Marketplace via Maker Console | Still [Maker Console](https://maker.elgato.com) — upload the same package |

The `.streamDeckPlugin` file is a **zip** whose top-level folder is `com.tbye.datetime.sdPlugin/`.

---

## One-time setup (Linux)

### 1. Node.js

Need Node **20+** (Elgato recommends **24+**):

```bash
node -v
```

### 2. Stream Deck CLI

```bash
npm install -g @elgato/cli@latest
streamdeck -v          # e.g. 1.7.x
```

### 3. Submodule (Elgato JS SDK)

The plugin loads `libs/` from the [streamdeck-javascript-sdk](https://github.com/elgatosf/streamdeck-javascript-sdk) submodule:

```bash
git submodule update --init --recursive
# must exist:
ls src/com.tbye.datetime.sdPlugin/libs/js/stream-deck.js
```

The build script will try to init this for you if missing.

### 4. Optional: `gh` for GitHub releases

```bash
gh auth status
```

---

## Build a release package

From the repo root:

```bash
# Use Version currently in manifest.json
./scripts/build-release.sh

# Or pack with a new version (does not rewrite the file on disk unless you use set-version.sh)
./scripts/build-release.sh 1.1.0

# Validate only
./scripts/build-release.sh --validate-only
```

What the script does:

1. Ensures `libs/` submodule is present  
2. Runs `node test.js`  
3. Runs `streamdeck validate`  
4. Runs `streamdeck pack` → **`dist/com.tbye.datetime.streamDeckPlugin`**

Ignore list for the package lives in:

`src/com.tbye.datetime.sdPlugin/.sdignore`  
(excludes `test.js`, `.sketch` sources, SDK repo metadata)

### Bump version in git

Stream Deck versions are typically **four** parts: `major.minor.patch.build`.

```bash
./scripts/set-version.sh 1.1.0      # writes 1.1.0.0 into manifest.json
# edit README release notes if you want
git add src/com.tbye.datetime.sdPlugin/manifest.json README.md
git commit -m "chore: bump version to 1.1.0.0"
./scripts/build-release.sh          # pack the committed version
```

---

## Smoke-test before publishing

This plugin targets the **Elgato Stream Deck app** on **Windows / macOS**. Linux can **build** the package; install/runtime still needs a machine with Stream Deck software (or a colleague’s box).

1. Copy `dist/com.tbye.datetime.streamDeckPlugin` to a Mac or Windows PC with Stream Deck installed.  
2. Double-click the file (or open it with Stream Deck).  
3. Confirm actions load, titles update, language/date formats, copy-on-press, multi-tile clock sync.  
4. Remove any old linked/dev copy of the plugin first if versions fight each other.

Dev link (only on a machine with Stream Deck app + CLI):

```bash
streamdeck link src/com.tbye.datetime.sdPlugin
streamdeck restart com.tbye.datetime
```

---

## GitHub release

```bash
VERSION=1.1.0
./scripts/set-version.sh "$VERSION"
# commit manifest bump, then:
./scripts/build-release.sh

gh release create "$VERSION" \
  dist/com.tbye.datetime.streamDeckPlugin \
  --title "DateTime Composer Plugin - $VERSION" \
  --notes "$(cat <<'EOF'
### Changes
- …
EOF
)"
```

Update README “Releases” section to point at the new asset URL.

---

## Elgato Marketplace / Maker Console

1. Log in to **[Maker Console](https://maker.elgato.com)** (same Maker account as last time).  
2. Open the existing **DateTime Composer** product (or create one if needed).  
3. Upload **`com.tbye.datetime.streamDeckPlugin`** as a new version.  
4. Fill version notes, gallery/screenshots if anything user-facing changed.  
5. Submit for review (or upload without auto-publish for a private DRM test build).  
6. After approval, Marketplace users get the update.

Returning makers: if products are missing after login, email **maker@elgato.com**.

### Guidelines checklist (high level)

- [ ] Manifest validates (`streamdeck validate`)  
- [ ] Icons/previews present (plugin icon, category, key, preview assets)  
- [ ] Version number increased from last Marketplace submission  
- [ ] Description / support URL still accurate  
- [ ] No test-only junk in the package (handled by `.sdignore`)  

Official docs:

- [Distribution](https://docs.elgato.com/streamdeck/sdk/introduction/distribution)  
- [`streamdeck pack`](https://docs.elgato.com/streamdeck/cli/commands/pack)  
- [Plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins)  
- [Become a Maker](https://docs.elgato.com/marketplace/become-a-maker)

### DRM note

Marketplace packages may be **DRM-processed** after upload. Your HTML/JS plugin does not use the modern Node `@elgato/streamdeck` v2 runtime, so **do not** flip `SDKVersion` to 3 / DRM-only settings unless you intentionally migrate the whole plugin. Keep packaging as you do today (`SDKVersion: 2`) unless Elgato’s review asks otherwise.

---

## Quick reference

```bash
# Install tooling once
npm install -g @elgato/cli@latest
git submodule update --init --recursive

# Everyday release cut
./scripts/set-version.sh 1.1.0
git add -u && git commit -m "chore: bump version to 1.1.0.0"
./scripts/build-release.sh
# → dist/com.tbye.datetime.streamDeckPlugin

# Ship
gh release create 1.1.0 dist/com.tbye.datetime.streamDeckPlugin --title "DateTime Composer Plugin - 1.1.0" --notes "…"
# then upload the same file at https://maker.elgato.com
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `streamdeck: command not found` | `npm install -g @elgato/cli@latest` and ensure npm global bin is on `PATH` |
| Validation fails on missing libs | `git submodule update --init --recursive` |
| Package missing PI styles | Confirm `libs/css/sdpi.css` is in the pack listing |
| Old plugin still running | Uninstall old version in Stream Deck, or `streamdeck stop com.tbye.datetime` / remove plugin folder |
| Want to inspect the package | `unzip -l dist/com.tbye.datetime.streamDeckPlugin` |
