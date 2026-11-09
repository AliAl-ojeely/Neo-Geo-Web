# Third-party notices — Neo-Geo Web Emu 0.1.5

Project frontend additions: GPL-3.0-or-later; see LICENSE. This does not relicense FBNeo or third-party components.

EmulatorJS 4.2.3: GPL v3, unmodified installed loader/runtime. Source: https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3 . Full license: vendor/emulatorjs/LICENSE. Local adapter changes are readable JavaScript under assets/library; no vendor binary edits.

FBNeo: noncommercial license, verbatim vendor/fbneo-selected-bios/LICENSE.txt. Do not sell, monetize, request donations, or distribute unauthorized ROMs with this core. Modified source changes must be public when distributed. Source commit https://github.com/EmulatorJS/FBNeo/tree/7ffe043d410f6021f7cfca77589b42bf2e094c3c . All applied patches accompany the static build under vendor/fbneo-selected-bios/patches. Manifest identifies exact build inputs.

RetroArch: GPL v3; pinned source https://github.com/libretro/RetroArch/tree/6dd4353937ef48b6ec0bfbdbb15d1c5992d86927 . Build source https://github.com/EmulatorJS/build/tree/677b1334ab1721a1e31b918f211b68f4e54f67a8 . Keep corresponding source and patches available when publishing binaries. No repository/publication was performed by this task.

Other EmulatorJS embedded dependencies retain their original notices. The installed distribution has no separate data/cores/licenses directory; the top-level EmulatorJS GPL license, readable wrapper sources, and full FBNeo license accompany this build. FBNeo's full license enumerates CPU/library contributors and their separate terms. Review the corresponding sources before public/commercial redistribution; this project is noncommercial.

Private local ROM, BIOS and PREVIEWS packages are NOT licensed for public redistribution by this project. They are created outside the repository and never included in the static build. No ownership or distribution rights for these assets are claimed.

The static build excludes unused original FBNeo packages (their exact source revision is not established) and the optional unrar JS/WASM (separate upstream terms not fully audited in this task). ZIP/7z extractor software is distributed by EmulatorJS v4.2.3 under its top-level GPL license; original distribution and readable EmulatorJS compression wrapper source accompany this build. RAR import is intentionally unsupported. Only the pinned modified FBNeo package is served.
