# Neo-Geo Web Port — Bilingual Localization Continuation

This patch applies on top of the exact 78-source-file snapshot collected as `NeoGeo_Current_Source_20261109.zip` on 2026-11-09. It is a targeted continuation of existing Codex changes, not a complete replacement or a new runtime core.

## Confirmed existing features

- `web/languages.js` already provides English (`en`) and Arabic (`ar`) strings, a persistent UI language preference (`neogeo-ui-language-v1`), live changes, and RTL/LTR direction.
- The Settings page already has the language selector. First-time users default to English; a stored language choice is restored on later visits. An existing EmulatorJS legacy language preference is migrated only when the dedicated preference is absent.
- Dialog error handling and invalid-schema companion status recovery had already been fixed in the uploaded snapshot.
- The existing global controls map Player 1 Q=A+B, R=A+B+C, E=C+D; Player 2 Y=A+B, U=A+B+C, I=C+D. This patch does not change control code.

## Changes in this patch

1. Give explicit `data-i18n-text` and `data-i18n-attrs` keys priority over phrase matching. This also supports guide paragraphs with two translation keys separated by `|` while preserving nested `<b>` tags and unmodified ROM filenames.
2. Apply a stable explicit translation key to the Player page title.
3. Clear stale `NGCompanion.status` when a previously working local-companion request fails.
4. Add regression tests for static HTML key coverage, exact text/attribute translation, nested content, language toggling, companion connection failure, and recovery.

The patch does NOT alter ROMs, BIOS, vendor binaries, user preferences, UI design or the custom controller mapping. It is not a public release or a GitHub push.

## Verification already performed in this work environment

- Node 22: `node --test tests/*.test.cjs` — **8/8 suites PASS** on source-only snapshot after the patch.
- Python 3.13: `python3 -m unittest discover -s tests -p test_local_companion_v032.py` — **PASS**.
- Hybrid offline build/verify/public audit — **PASS, 66 files**. The hybrid was assembled using this source snapshot plus vendor files from a previously supplied v0.1.5 public source archive; it is *not* the exact vendor folder currently installed on the user's PC.
- Full `manage.py test` on the source-only ZIP — **NOT VERIFIED / unavailable** because the source collector excluded the legacy `upgrade_v0151.py` dependency. This is not evidence of a failure in the user's full project. Test on the full Windows checkout.
- Actual Brave visual verification, real game boot/inputs/audio, public HTTPS deployment and full binary redistribution compliance — **NOT VERIFIED**.

## Manual Brave acceptance

1. Use the same local-companion origin, `http://127.0.0.1:8777/Neo-Geo-Web/`, to preserve the local site data.
2. Open Settings. On a new origin/profile, the display language should start in English; switching to Arabic should immediately set RTL.
3. Navigate among Library, Settings and Player. Check the first-run guide's ROMs/PREVIEWS/BIOS paragraphs and labels, search placeholder, nav titles and dialog text.
4. Return to English; the same elements should switch to LTR without losing the currently selected setting.
5. Close and reopen the browser and confirm the chosen language returns.
6. Confirm ROMs/BIOS/PREVIEWS and saved controls remain unchanged; test KOF98 Q=A+B, R=A+B+C, E=C+D.
7. Disconnect/reconnect the companion and verify the status is refreshed.

## Release caveat

This patch is only a quality and reliability improvement. The broader release review previously identified corresponding-source/embedded-license clearance and actual public-HTTPS/browser acceptance as outstanding. Those conditions remain outstanding here.
