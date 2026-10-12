# Validation evidence

Validated in this Linux x86_64 cloud environment with Node 24, Python 3.12, and system Chromium. These results establish current-instance behavior, not universal browser/OS compatibility or restoration in a new cloud task.

| Check | Result |
|---|---|
| Production build, strict TypeScript including unused-code checks | Passed; offline service worker, local PDF worker, icons, and lazy route bundles emitted |
| `npm test` | 10 tests passed: progress/sorting/filtering, backup validation, real M4B chapter parsing, chapter edit position/note remapping |
| `.venv/bin/python -m pytest tests/test_companion.py -q` | 5 tests passed: actual eSpeak audio output, preview WAVs, interruption/retry with chunk reuse, inputs/Host/Origin/path controls, text chunk integrity |
| `npm run test:e2e` | 5 browser workflows: WAV/PDF/EPUB import and duplicates; playback and reader persistence; actual speech conversion and per-book voice restoration; binary backup/restore; offline reload; mobile settings; M4B end-chapter sleep/notes/collections/statistics; actual silence detection; chapter splitting/reordering/removal |
| `npm audit` | 0 known vulnerabilities reported in installed production and development dependencies |
| Setup helper | Executed successfully: frozen npm install, pinned Python dependencies, production rebuild |
| Startup helper | Both services responded; actual speech preview returned 49,560 PCM frames at 22,050 Hz. Normal termination stopped both children; restart and readiness checks passed |
| External app requests | Main browser workflow asserted zero non-local HTTP requests, including import/reading/playing/backup/offline flows |
| Repository checks | No accidental generated build/dependency/runtime files tracked; whitespace check passed |

Synthetic fixtures are authored locally. They are not demo books inserted into the application. Tests isolate browser contexts and run companion data under `/tmp/folio-e2e-data`; the test runner requires free service ports. Setup/smoke artifacts from earlier checks were preserved under `/tmp/folio-*-test-archive-*`, outside the application's data directory.

The build has a non-failing size warning for the PDF/import bundle. Initial application code is approximately 275 kB before compression, with import/reader/studio views lazy loaded. The complete production cache is about 2.3 MB plus saved book files. The Python tests report a non-failing Starlette deprecation warning for its currently compatible HTTPX test adapter.

## Not verified / outside the implemented scope

- Neural Piper model installation and inference: Hugging Face was rejected by the current environment network policy (HTTP 403). Piper itself imports successfully; voice installation/model-card/integrity controls are implemented, but neural synthesis has not been run without a model. Required domains are saved in the draft, not applied or published. eSpeak export is the tested fallback.
- Optional OCRmyPDF/Tesseract preprocessing, physical mobile devices, Windows/macOS fallback portability, every audio codec, huge-library memory stress, complete assistive-technology compliance, and trusted-LAN HTTPS companion deployment.
- Original PDF page rendering, exact generated word synchronization, arbitrary metadata schemas, service disk-management UI, and streaming filesystem-backed browser imports are remaining work, not placeholders presented as functional features.

See FEATURES.md for the full feature status and README.md for local installation, licenses, privacy, storage, and configuration.
