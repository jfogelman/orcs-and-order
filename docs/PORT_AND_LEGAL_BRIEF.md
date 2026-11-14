# Orcs & Order: Port, Migration and Asset-Rights Brief

As of 2026-11-14. Written for Claude Code to work from. Repo: `jfogelman/orcs-and-order`, `main` at commit `2d4fd45` (PR #185, Nov 10 2026).
Not legal advice. Items are marked **VERIFIED** (read in a source), **FROM REPO** (observed in code), or **UNVERIFIED** (my recollection or inference).

---

## 1. Decisions and recommendations

1. **Branch, not fork.** Do the port on `feature/desktop-tauri` in this repo. `src-tauri/` is additive, and `.github/workflows/pages.yml` only deploys on `main`. A fork would have to track a fast-moving sim (PRs #182–185 are all balance work).
2. **Windows desktop build first.** Target a locally installed, offline Windows app with persistent saves. Steam is then mostly packaging and publishing.
3. **Tauri vs Electron is an open decision.** See section 4. Windows-only: Tauri is fine. Multi-OS Steam with achievements and cloud: prototype Electron too.
4. **Mobile is a UI project, not a port.** Do tablets before phones. See section 5.
5. **Model choice.** Routine packaging, CI and config work doesn't need a bigger model. Use the strongest available model for the touch-UI refactor of `main.ts` and any Steamworks Rust glue.

---

## 2. Repo facts (FROM REPO)

- TypeScript, Vite 8, Vitest 4. `package.json` is version `0.10.0`. Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `test`.
- `vite.config.ts`: `base: './'`, `outDir: 'dist'`, `assetsDir: 'bundle'`, dev port 5188 with `strictPort: false`.
- Source is about 54k lines. `src/sim`, `ai`, `model` and `engine` have no DOM access; the only `window`/`document` matches are in comments. Rendering is in `src/render`, UI in `src/ui`, and `src/main.ts` is a 3.8k-line controller.
- **Build state:** `npm ci`, `tsc --noEmit` and `vite build` all pass. The bundle is 689 kB JS and `dist/` is 32 MB. `README.md` still says "88 KB of JS" and is stale.
- **Tests:** 123 test files. A full `vitest run` did not finish within 400 s in my session, so test health is **UNVERIFIED**. Establish the baseline before changing anything.
- **Saves** (`src/persist/save.ts`):
  - Slots are in `localStorage` under `SLOT_PREFIX`.
  - File export is a blob `<a download>` with extension `w2c`; import is an `<input type="file">`.
  - `deserialize` already bounds run-length decoding and map dimensions (the largest map is 88×60).
  - `deserialize` rejects any save where `file.version !== SAVE_VERSION`. There is no migration, so every bump orphans existing saves.
- **Input** (`src/main.ts`): pointer events (`pointerdown`/`move`/`up`), drag-pan, wheel zoom, `contextmenu` suppressed.
  - Right-click is the move/attack-at-distance gesture.
  - Route preview depends on hover.
  - Many keyboard shortcuts (`B`, `P`, `F`, `S`, `T`, `Enter`, and others).
  - Audio unlock listens on `pointerdown`, `mousedown`, `touchstart` and `keydown`.
- **Assets:** `public/` is 32 MB (units 16 MB, advisors 3.6 MB, music 3 MB). Art was generated with Google Gemini. Sound effects and music are from Pixabay (`CREDITS.md`).

---

## 3. Desktop (Tauri) implementation plan

The first PR is **"Add optional Tauri desktop build"** and nothing else. Out of scope: Steamworks, achievements, cloud saves, mobile, gameplay changes.

Steps:
1. `git checkout -b feature/desktop-tauri`
2. `npm install --save-dev @tauri-apps/cli@^2`, then `npx tauri init`:
   - App name `Orcs & Order`
   - Web assets `../dist`
   - Dev URL `http://localhost:5188`
   - Dev command `npm run dev`
   - Build command `npm run build`
3. `src-tauri/tauri.conf.json` starting point:
   - `productName`: `Orcs & Order`
   - `version`: `0.10.0`
   - `identifier`: a placeholder; **choose a permanent reverse-DNS id before distribution**, since it affects app-data paths
   - `beforeDevCommand`: `npm run dev -- --host 127.0.0.1 --strictPort`
   - `frontendDist`: `../dist`
   - Window: 1280×800, min 960×640 (provisional, test the UI at these sizes)
   - Bundle target: `nsis`, category `StrategyGame`
   - WebView2 install mode: `downloadBootstrapper` (investigate the offline installer later)
   - CSP: `null` initially. **Set a restrictive CSP before release.**
4. Add scripts `tauri`, `tauri:dev` and `tauri:build` to `package.json`. Leave the existing scripts alone.
5. Keep the Rust side as a thin shell. No game logic in Rust.
6. Build on Windows or a Windows CI runner.

Test matrix before merging:

| Test | Expected |
|---|---|
| New game, several turns | Same behaviour as browser |
| Save, quit, relaunch, load | Slot survives restart |
| Export `.w2c` | Valid file written (see blob-download risk below) |
| Import `.w2c` | Restores the game |
| Resize, fullscreen | UI usable, no broken layout |
| Network disconnected | Fully playable |
| `npm test`, `npm run build` | Unchanged |

Effort estimate (from the attached plan, not measured): roughly 9–22 hours for the first prototype.

**Known risks**
- **Separate storage profile.** The desktop app's WebView has its own `localStorage`. Browser saves won't appear there, and clearing app data deletes saves.
- **Blob download (UNVERIFIED).** `downloadSave` uses a blob `<a download>`. I believe this works in WebView2 on Windows but is unreliable in Tauri on macOS and Linux. Plan to switch to Tauri's dialog and fs plugins for save export/import.
- **Steam overlay (UNVERIFIED).** Overlay behaviour with WebView2, and with Electron's Chromium, is something I recall being fiddly. Test it early.

---

## 4. Tauri vs Electron

| | Tauri | Electron |
|---|---|---|
| Rendering | OS webview (WebView2, WKWebView, WebKitGTK), differs per OS | Bundled Chromium, consistent |
| Size | Smaller | Larger |
| Steamworks | Needs a Rust-side binding (contradicts "thin shell") | More mature JS bindings (UNVERIFIED) |
| Fit | Windows-only first release | Multi-OS Steam with achievements and cloud |

Recommendation: Tauri for the Windows-only prototype. If the goal is Linux and macOS Steam builds with achievements and cloud saves, prototype Electron before committing.

---

## 5. Pre-port hardening

Do these before multiple distribution targets:
1. **Save migration.** Replace the strict `SAVE_VERSION` equality check with versioned migrations, and add tests that load old-version fixtures (`fixtures/` exists).
2. **Platform-independent save format.** Keep one format and let each platform decide only where files live.
3. **Browser-assumption audit:** `localStorage` quota, absolute URLs, fixed window-size assumptions, any network dependence, assets all present in `dist/`.
4. **Fix stale docs:** `README.md` size claim, and add build and release instructions.
5. **Input action layer.** Mouse, keyboard and touch currently call into `main.ts` directly. Introduce shared actions (`selectUnit`, `moveUnit`, `openCity`, `endTurn`, ability arm/target) that every input method invokes.

### Mobile and tablet (later)
- Right-click move/attack has no touch equivalent. Hover route preview needs a replacement (tap to preview, tap again to commit).
- Needs pinch-zoom, larger targets, contextual menus instead of tooltips, and a separate compact city and tech UI.
- Sequence: Web → Windows/Steam → tablet → phone. Package mobile with Capacitor (iOS needs macOS and Xcode).

---

## 6. Asset provenance and rights

### 6.1 Sound (Pixabay) — VERIFIED from https://pixabay.com/service/terms/
- The license covers commercial and non-commercial use. Credit is optional.
- Prohibited: selling or distributing the content on a **standalone** basis. Unaltered use, or only a filter, resize or crop, still counts as standalone. Combining content into a new creative work is not standalone.
- The terms don't mention games. Using the sounds inside a game fits the "new creative work" reading, but shipping raw `.mp3` files in the install folder is a **gray area**.
- Trademarked or branded content can't be used commercially, and recognizable people may need consent. Neither is likely to matter for creature and combat sounds.
- Section 7B (AI-labelling rules) applies to people uploading to Pixabay, not to you.
- **Not read:** the separate Pixabay content license page. Check it before release.

### 6.2 Art (Google Gemini) — partly VERIFIED
- https://policies.google.com/terms: Google says it won't claim ownership of your content. It does **not** say who owns AI output. Conduct rules include no using AI-generated content from Google services to develop ML models, and no "misleading others into thinking that generative AI content was created by a human".
- https://policies.google.com/terms/generative-ai/use-policy: bans violating others' rights (including IP), and "misrepresenting the provenance of generated content by claiming it was created solely by a human, in order to deceive". It has no labelling requirement.
- **Not verified:** the Gemini community thread (the page rendered with no answer) and the Gemini-specific additional terms. Read the terms for the exact Gemini product used before release.
- Keep prompts free of existing characters, brands and lookalikes. `ART_PROMPTS.md` already describes original characters.

### 6.3 Copyrightability of the generated sprites
Sources: CRS Legal Sidebar LSB10922 (updated July 18, 2025); Copyright Office *Copyright and AI, Part 2: Copyrightability* (Jan 2025); Office decision letter on *Zarya of the Dawn* (Feb 21, 2023); Harvard JSEL note on *A Single Piece of American Cheese* (Mar 2025); USC Libraries blog and The Fried Firm blog (commentary).

**VERIFIED**
- Human authorship is required. *Thaler v. Perlmutter* was affirmed by the D.C. Circuit in March 2025 and rehearing was denied in May 2025.
- Prompts alone don't give authorship, because prompts act like instructions to an unpredictable system. Time and effort ("sweat of the brow") are irrelevant.
- Copyright covers human expression perceptible in an AI-assisted work. It also covers creative selection, coordination and arrangement, and creative modifications, but **not** the AI-generated material standing alone.
- Including AI material in a larger human-authored work doesn't affect copyrightability of the whole (the report's example is a film with AI effects).
- *Zarya of the Dawn:* the text and the selection and arrangement were protected, and the Midjourney images were not. The author's Photoshop lip edit was "too minor and imperceptible"; "substantial edits" to an intermediate image could count, but the Office couldn't separate her edits from the generated content. The registration was cancelled and reissued because the application didn't disclose the AI content.
- *Rose Enigma:* registered because the author's hand-drawn input stayed clearly perceptible in the output. *SURYAST* (a photo plus a style prompt) was refused.
- A compilation of only two or three elements is generally too thin to register.
- Applicants must identify and disclaim AI-generated material, and claim only human contributions.
- Copyrightability is case by case. Courts aren't bound by Office guidance.
- *A Single Piece of American Cheese* was registered for selection, arrangement and coordination after an initial denial. The Office reviewed a screen recording of the process. The Harvard note calls the bar "not especially high", which is the author's commentary, and the applicant is the CEO of the tool's maker. No court has tested the registration.

**UNVERIFIED / my inference**
- `tools/prepare_art.py` (cut out, trim, scale) is likely too minor to give an individual sprite its own copyright, by analogy to the *Zarya* lip edit.
- A packed sprite-sheet layout may count as dictated by packing and therefore be a weak arrangement claim.
- A trademark on the name or key mascots is a separate route. It was suggested in the pasted text but is in none of the sources I read.
- Newer developments after July 2025 (for example the pending *Théâtre D'opéra Spatial* suit) should be checked before relying on this.

### 6.4 What this means for the project
- The game as a whole (code, rules, text, tech tree, faction design, arrangement) is human-authored and protectable. The raw sprites are probably not protectable individually.
- `CREDITS.md` says assets are not under the MIT licence. That restriction may be hard to enforce over unprotectable images.
- **Steam requires an AI-content disclosure (UNVERIFIED, from memory; confirm in Steamworks).**

### 6.5 Recommended actions
1. Add `PROVENANCE.md` (or extend `CREDITS.md`) listing per-asset-class origin: Gemini-generated, Pixabay, hand-made. Record the Gemini product and date.
2. Keep `art_src/` raw outputs and the prompt history. Going forward, screen-record generation and hand-polish sessions.
3. For brand-critical assets (logo, title art, key units), hand-draw or heavily repaint, or start generation from your own sketch and keep it visible in the output.
4. If registering, register the game (software and text) and disclaim the AI-generated sprites. Do not describe the art as human-made.
5. Check the Pixabay content-license page and the Gemini-specific terms. Consider an IP attorney review before the Steam launch.
6. Consider renaming the `.w2c` save extension (looks like a Warcraft II holdover) and doing a trademark conflict search on "Orcs & Order".

---

## 7. Suggested task order for Claude Code

- [ ] Run the full test suite and record the baseline (`npx vitest run`, allow more than 10 minutes).
- [ ] Add save-version migration with old-version fixtures.
- [ ] Audit browser assumptions (section 5, item 3).
- [ ] Refresh `README.md` and add build and release docs.
- [ ] Add `PROVENANCE.md` and finish the section 6.5 documentation items.
- [ ] Create `feature/desktop-tauri`, add `src-tauri/`, and produce the NSIS installer. Run the test matrix.
- [ ] Replace blob download and file-input with Tauri dialog and fs plugins, behind a platform check.
- [ ] Prototype Electron if Linux, macOS or Steam features are in scope.
- [ ] Introduce the input action layer in `main.ts`; start the tablet UI pass.

## 8. Open questions

- Which platforms does the first Steam release need: Windows only, or Linux and macOS too?
- Is Steam Cloud, or Steam achievements, required for launch?
- Which Gemini product and terms version generated the art?
- Does "models" in the original ask mean Claude model choice (assumed) or the engine choice?

## 9. Sources

- Attached plan: `Orcs_and_Order_Game_Design.docx`
- https://github.com/jfogelman/orcs-and-order
- https://pixabay.com/service/terms/
- https://policies.google.com/terms
- https://policies.google.com/terms/generative-ai/use-policy
- https://newsroom.loc.gov/news/copyright-office-releases-part-2-of-artificial-intelligence-report/s/f3959c36-d616-498d-b8f9-67641fd18bab
- CRS Legal Sidebar LSB10922 and Copyright Office Part 2 report (PDFs you supplied)
- Copyright Office *Zarya of the Dawn* decision letter (PDF you supplied)
- Harvard JSEL, "U.S. Copyright Office Grants Registration to AI-Generated Artwork" (saved HTML you supplied)
- https://libguides.usc.edu/blogs/USC-AI-Beat/human-authorship-and-creative-control (commentary)
- https://thefriedfirm.com/law-blog/can-you-copyright-ai-images/ (law-firm blog, commentary)
