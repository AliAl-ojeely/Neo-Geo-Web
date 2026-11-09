# Neo-Geo Web Port — GitHub Pages publication checklist

**Status: preparation only. This file does not authorize or perform publication.**

## Publication model

- Recommended **repository name:** `Neo-Geo-Web`, with the GitHub Pages URL `https://YOUR_USERNAME.github.io/Neo-Geo-Web/`.
- The local Windows checkout may remain `D:\dev\Neo-Geo-Web-Port`; the folder and repository names do not have to match.
- GitHub Pages hosts **static HTML/CSS/JavaScript/WebAssembly files only**. It cannot execute `tools/local_companion_v032.py`, access your Windows drives, or import browser storage from `http://127.0.0.1:8777`.
- Visitors must supply their own authorized ROM and BIOS files through the browser's supported local selection flow. Browser-persisted handles vary by browser; in Brave, fallback selections may only last for a session.
- The generated public site is **`dist/github-pages/`**, not the entire source checkout. Only the generated site is uploaded as the Pages artifact.

## One-time prerequisites

1. Confirm that the exact bundled EmulatorJS, FBNeo/WebAssembly, compression, CPU/audio dependencies and source patches may be redistributed under their applicable licenses. Provide the corresponding source, build scripts and modified source where required. FBNeo has noncommercial restrictions and requires publication of source changes. **This has not yet been fully verified.**
2. Do not place ROMs, `neogeo.zip`, private PREVIEWS, save states, user paths, or any private configs in a public commit or Pages release.
3. Ensure that all files required for the static build are present in the repository checkout, including the pinned vendor assets **only after the redistribution review**.
4. Run all local checks in PowerShell from the project root:

```powershell
node --test tests/*.test.cjs
py -3 manage.py test
py -3 manage.py web build
py -3 manage.py web verify
py -3 manage.py github audit
py -3 tools/github_pages_preflight.py --project 'D:\dev\Neo-Geo-Web-Port'
```

### Publishing with GitHub Actions (recommended)

1. Create an **empty** GitHub repository named `Neo-Geo-Web`; avoid using your existing profile Pages repository for this project.
2. Inspect Git staging for local/private data before the first commit. Do not force-add excluded files or blindly push the full `D:\dev` tree.
3. After Git is initialized, stage the intended project source, review `git status --short`, and check the tracked-file audit again.
4. Push the reviewed source to the repository's `main` branch. `.github/workflows/validate.yml` runs tests and the build but **does not publish**.
5. In GitHub repository settings: **Settings > Pages > Build and deployment > Source > GitHub Actions**.
6. Only after completing item 1 (license and source review), open **Actions > Deploy Neo-Geo Web Port to GitHub Pages (manual) > Run workflow** and confirm the redistribution-review checkbox.
7. The workflow rebuilds the static site on GitHub, runs tests and artifact checks, and uploads **only** `dist/github-pages/` using the official Pages actions.
8. Open `https://YOUR_USERNAME.github.io/Neo-Geo-Web/` and test the library UI, both languages, directions, settings, file chooser, keyboard controls, and game start with legally held user files.

**Important:** GitHub Pages can be publicly reachable even when its source repository is private. Do not use a private repository as a way to hide sensitive Pages content.

## Source-control setup (only after a local inspection)

Run the following from the local project directory after creating the empty repository on GitHub:

```powershell
Set-Location 'D:\dev\Neo-Geo-Web-Port'
git init -b main
git add -A
git status --short
py -3 manage.py github audit
py -3 tools/github_pages_preflight.py --project "." --skip-tests
```

**STOP and inspect the staged file list.** Never stage `SOURCE_COLLECTION_MANIFEST.json` (it records an absolute local folder path) or any ZIP produced solely for sharing project source. Do not continue if any unexpected private file, ROM, BIOS, save state, backup, cache, log, or credential is included. When everything is reviewed, finish using your own URL:

```powershell
git commit -m 'Prepare Neo-Geo Web Port for GitHub Pages'
git remote add origin 'https://github.com/YOUR_USERNAME/Neo-Geo-Web.git'
git push -u origin main
```

The commands above do **not** create a GitHub repository or sign in to GitHub. Do not paste passwords or tokens in chat. Your existing source checkout is not a Git repository yet according to the prior audit.

## Post-deployment acceptance

- [ ] `/Neo-Geo-Web/` opens through HTTPS with no missing CSS/JS assets.
- [ ] English loads as the default for a new browser profile.
- [ ] Arabic switches to RTL, and the language persists in the same browser origin.
- [ ] EmulatorJS interface language selector is visually consistent and saves correctly.
- [ ] Browse local ROM/PREVIEWS/BIOS through the file-selection interface (no server-side local companion expected on Pages).
- [ ] A verified test game reaches the Start UI and actually runs; check sound, pause and mapped keys.
- [ ] No private ROM, BIOS, save, or user path appears in public artifacts or repository history.
- [ ] License and corresponding-source distribution obligations are documented and met.

## Known limitations

The historic catalog, automated tests, and successful local boot attempts do not prove that all 191 cataloged titles work. Real-browser public HTTPS acceptance has not been performed by the packaging kit. The local companion is bound to loopback and purposely rejects requests from different origins; **never** expose it publicly or bypass those origin protections to make GitHub Pages talk to it.

## When an action fails

Use the **Actions** log to find the first failing step. A missing `upgrade_v0151.py` file (referenced by the existing Python regression suite) or missing vendor file in Actions generally means the required public-safe source/build dependency is not in the repository (or has been excluded by `.gitignore`), rather than a website UI bug. Do not work around a failed license, privacy, or artifact check by disabling it.

Official guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
