# Folio — personal audiobooks

A free local-first React/TypeScript PWA for your own books. There are no paid APIs, accounts, subscriptions, ads, analytics, or cloud book storage. The initial library is empty; all statistics come from your own playback.

## Run locally

Prerequisites: Node.js 22.13+ (Node 24 tested), npm, Python 3.10+ (3.12 tested), and a modern browser. Piper wheels are platform dependent; this environment validates Linux x86_64. Reserve about 500 MB for dependencies, plus your books, generated WAV audio, and any optional voices. Audio WAV files can be much larger than source text.

```sh
npm ci
npm run dev
```

Open the address printed by Vite on your computer. For an installable, offline-capable build:

```sh
npm run build
npm run preview
```

The service worker runs in the **production build**, on localhost or HTTPS. Open it once online and let it cache before disconnecting. All scripts, icons, PDF worker, and fonts are local. No external CDN is needed. Browser app installation support varies. Vite preview is a local convenience server; it is not public hosting.

For offline exportable text-to-speech, run in a second terminal:

```sh
python3 -m venv .venv
.venv/bin/pip install -r companion/requirements.lock
.venv/bin/uvicorn companion.app:app --host 127.0.0.1 --port 8765
```

Windows: use `.venv\Scripts\python.exe -m pip ...` and `.venv\Scripts\python.exe -m uvicorn ...`. The bundled eSpeak export fallback currently loads Piper's Linux `.so`; it has been tested on Linux only. On Windows/macOS use an installed Piper voice for export. Never expose this unauthenticated companion to the public internet. Use one Uvicorn worker. On Linux/macOS you can instead run `bash scripts/setup.sh` once, then `bash scripts/start.sh` for the production PWA or `bash scripts/start.sh --dev` for development. Keep both terminals running while using the app; files and dependencies persist, running processes do not.

## Speech engines and licenses

**Piper** is the selected neural engine: GPL-3.0, free local CPU inference, no API or account. ONNX Runtime telemetry is explicitly disabled before model sessions. A medium voice is approximately 64 MB on disk; reserve roughly 500 MB working RAM. Performance varies by CPU. Text is split into bounded chunks; WAV chunks and job state are retained on disk for pause/resume/retry. Chapter audio is assembled with streaming PCM writes. Successful chapters are exportable; completed jobs are copied to IndexedDB for browser playback.

**eSpeak NG** is a working, clearly labeled robotic export fallback using the GPL engine bundled by Piper on Linux. English male-style and female-style variants need no extra download. It is not a neural voice or a substitute for natural Piper quality. This is the engine used in the actual audio-generation tests in this cloud instance.

**Browser speech synthesis** is live reading only: it uses installed device voices, with sentence-level highlighting. Some voices are remote and offline availability differs by device. It cannot reliably export an audiobook. The UI never claims it can.

Neural voice models have **separate licenses**. Voice Studio fetches and displays the upstream MODEL_CARD before asking to install. It explains storage size, verifies model SHA256 against upstream LFS metadata over verified HTTPS, and retains the model card. No neural voice downloads automatically. Catalog candidates are LJ Speech (female; public-domain dataset) and HiFi Captain (male; dataset CC BY-SA 4.0). Dataset terms alone are not proof of model licensing; review the exact model card before installation. In this cloud instance the model host is blocked, so the cards and neural inference have **not been validated**. Installation refuses to continue when model/license/checksum retrieval fails.

Advanced voices: place matching `name.onnx`, `name.onnx.json`, and `name.license.txt` under `.local/voices`. Verify the source, integrity, license, language, and compatibility yourself; model files are trusted local executable inputs. Restart the companion; installed voices appear by ID. Available languages follow installed models, not an online service. No language or gender support is fabricated.

Optional scanned-PDF OCR: install free OCRmyPDF and Tesseract using your OS package manager, then run:

```sh
ocrmypdf input.pdf searchable.pdf
```

Import the searchable result. OCR is a separate local preprocessing command, not an in-app OCR implementation. Install additional Tesseract language packs when needed.

## Using your library

- Import multiple PDFs, EPUBs, MP3, M4B, WAV, FLAC, M4A, or OGG files using the picker or drag/drop. Exact file duplicates are detected with chunked SHA256 hashing. Audio decoding depends on browser codecs.
- Metadata and covers are extracted when present. Chapter titles/text, ordering, removal, and audio splitting can be edited in details; bookmarks follow stable chapter IDs. Split points are real audio offsets, not word timing guesses. Exporting a shared source chapter downloads the full original file; generated chapters export their actual individual WAV files. PDF chapters currently map to pages; EPUB chapters follow spine order. Embedded MP4/M4B chapter timestamps are parsed when present; files without them remain one track.
- Edit book metadata, replace original files, upload a cover, favorite, complete, or assign a collection from details. Replacing a file resets chapter progress and notes to avoid invalid timestamps.
- Press Listen to open the player. Play/pause, seek, speed, volume, configured skips, smart rewind, bookmarks, timestamped notes, sleep timer, chapter navigation, queue, opt-in measured silence skipping, and saved listening positions are local.
- Keyboard: Space plays/pauses, Left/Right skip. Typing controls are excluded. Browser/OS support determines background audio and lock-screen controls.
- Read extracted PDF/EPUB text with chapter navigation, search, typography, spacing, backgrounds, remembered scroll position, selection highlights, and optional browser live speech. The reader does not render original PDF page layout or EPUB HTML styling.
- Voice Studio requires the local companion. Choose a text book and installed voice, preview, generate, pause/resume/retry, and export actual WAV chapters. Progress counts successfully processed text chunks. Pausing takes effect after the current chunk.
- Settings persist. Reset buttons restore each category. Collections are created on their own page and assigned in book details.
- Insights count elapsed time while audio is actually playing, rather than audio-position jumps. Streaks are listening streaks; manual completion status is labeled as such. Reading time and live-speech listening time are not counted.

## Storage and privacy

Browser data: IndexedDB `folio` contains book metadata/text/covers, original audio/source files, generated audio, preferences, collections, and daily listening time. Companion data: `.local/jobs.sqlite3`, `.local/audio/`, and `.local/voices/`. Override its location with `FOLIO_DATA` (non-secret local path). Back up that folder separately; browser JSON backups do not include companion job records or voice models.

Storage Manager exports a full browser JSON backup (including Blob data), restores it by ID, exports lightweight metadata, clears generated browser audio, deletes books, requests persistent storage, and clears the app cache. **Browser storage can be evicted.** Private browsing may discard it. Keep originals and external backups. JSON backups use memory proportional to the library; they are unsuitable for multi-gigabyte libraries. Retain companion WAV files on disk for large conversions. EPUB expansion is capped at 512 MB to limit accidental memory exhaustion. PDF parsing and EPUB extraction still require in-memory text; there is no filesystem-backed streaming library import yet.

EPUB markup is never inserted as HTML; only extracted text is rendered. PDF.js is pinned to a patched release. The companion restricts Host and Origin headers, validates paths/voice IDs, and binds to loopback in documented commands. Arbitrary websites cannot call its mutation endpoints. The user’s device/browser can access their own stored data; the app does not encrypt it.

A phone's `localhost` is the phone itself. To use a desktop companion from mobile, you need trusted LAN HTTPS serving and explicit `FOLIO_ORIGINS` plus a corresponding trusted Host configuration in `companion/app.py`. This LAN configuration is **not tested or enabled by default**. Mobile browsers can use the local library and live-reading fallback without the companion. Large browser files, background playback, Media Session actions, and speech availability vary by browser.

## Architecture and free dependencies

- `src/App.tsx`: navigation and shared application state.
- `src/components/`: library, upload, details, player controls, reader, voice studio, bookmarks, insights, collections, settings, storage, shared UI.
- `src/model.ts`: typed records and library calculations.
- `src/db.ts`: IndexedDB persistence and backup codecs via **idb** (ISC).
- `src/import.ts`: **PDF.js** (Apache-2.0), **fflate** (MIT) EPUB ZIP/text extraction, **music-metadata** (MIT) audio metadata, **hash-wasm** (MIT) incremental file hashing.
- `src/player.ts`: HTML Audio and Media Session integration; no paid audio SDK.
- **React**, **Vite**, **TypeScript**, **Tailwind CSS**, **Lucide**: free open-source UI/tooling. Icons are bundled; fonts are system fonts.
- **vite-plugin-pwa / Workbox**: local service-worker assets. IndexedDB stores books independently of the app cache.
- `companion/app.py`: **FastAPI** (MIT), **Uvicorn** (BSD), Python **SQLite**, Piper (GPL-3.0), ONNX Runtime (MIT), persisted chunk jobs and WAV files. **Tesseract** (Apache-2.0) and **OCRmyPDF** (MPL-2.0) are optional external OCR tools.
- **Vitest**, **Playwright**, **pytest**, **HTTPX**: free testing tools. See installed packages for exact license notices and `package-lock.json` / `companion/requirements.lock` for versions. No dependency requires payment for local operation. Distribution of GPL components carries license obligations.

## Validation

```sh
npm run build
npm test
.venv/bin/pip install -r companion/requirements-dev.txt
.venv/bin/python -m pytest tests/test_companion.py -q
npm run test:e2e
```

Stop the app before browser tests: tests require ports 4173 and 8765 to be free, launch their own services, and isolate companion data under `/tmp/folio-e2e-data`. Playwright uses `/usr/bin/chromium` in this cloud machine. On another machine set `FOLIO_CHROMIUM` to your Chromium executable, or install Playwright Chromium and adjust the executable in `playwright.config.ts`. Browser tests use synthetic, locally authored WAV/PDF/EPUB fixtures, never downloaded copyrighted books. They launch the production preview and local companion. Tests cover import, duplicates, playback, persistent position, reading, eSpeak conversion, backup/restore, offline reload, mobile settings, M4B chapters, end-chapter sleep, notes, collections, actual listening time, and measured silence skipping. Companion tests generate real audio and intentionally interrupt synthesis to check retry reuse. Neural Piper inference, original PDF layout, optional OCR, platform-specific codecs, and mobile companion networking are not claimed as validated.

See [FEATURES.md](FEATURES.md) for the complete implementation checklist and remaining work.

## Web publishing

The GitHub Pages workflow builds, tests, and publishes the frontend on pushes to `main`.
Enable it in the repository's **Settings → Pages → Source → GitHub Actions**.
Once deployment succeeds, the address is https://aimohsin01.github.io/personal-Audio-book/.
Books and settings stay in this browser's local storage; the hosted app does not upload them to GitHub.
The Python speech companion runs separately on your own computer. Browser reading and library playback work without it.
