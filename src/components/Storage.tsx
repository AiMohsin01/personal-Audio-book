import { useEffect, useRef, useState } from "react";
import {
  Library,
  Upload,
  HardDrive,
  Download,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { db, download, exportBackup, decode } from "../db";

import { type Book } from "../model";

import { Heading, Summary } from "./shared";
export default function Storage({
  books,
  message,
  refresh,
  remove,
}: {
  books: Book[];
  message: (s: string) => void;
  refresh: () => Promise<void>;
  remove: (b: Book) => Promise<void>;
}) {
  const [estimate, setEstimate] = useState<StorageEstimate>({}),
    [persistent, setPersistent] = useState(false),
    [busy, setBusy] = useState(false);
  const restore = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void navigator.storage?.estimate().then(setEstimate);
    void navigator.storage?.persisted().then(setPersistent);
  }, [books]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      message(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="YOUR DATA, IN YOUR HANDS"
        title="Storage manager"
        subtitle="Back up your stories. Keep control of your files."
      />
      <div className="summary-grid">
        <Summary
          icon={<HardDrive size={20} />}
          label="Browser storage used"
          value={((estimate.usage || 0) / 1048576).toFixed(1) + " MB"}
          detail={`Quota: ${((estimate.quota || 0) / 1073741824).toFixed(1)} GB (browser estimate)`}
        />
        <Summary
          icon={<Library size={20} />}
          label="Books saved"
          value={String(books.length)}
          detail="Original files & generated audio"
        />
        <Summary
          icon={<ShieldCheck size={20} />}
          label="Persistent storage"
          value={persistent ? "Granted" : "Best effort"}
          detail="Keep backups to avoid data loss"
        />
      </div>
      <div className="two-columns">
        <section className="panel">
          <h3>Backup & restore</h3>
          <p>
            Backups include original files, generated audio, covers, metadata,
            progress, notes, settings, and listening activity. They contain
            private book text. Store them somewhere safe.
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void act(exportBackup)}
            >
              <Download size={16} />
              Export full backup
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => restore.current?.click()}
            >
              <Upload size={16} />
              Restore backup
            </button>
          </div>
          <input
            hidden
            type="file"
            accept=".json"
            ref={restore}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (
                file &&
                confirm(
                  "Merge this backup into your library? Matching IDs will be overwritten.",
                )
              )
                void act(async () => {
                  await db.restore(decode(JSON.parse(await file.text())));
                  await refresh();
                  message("Backup restored");
                });
              e.target.value = "";
            }}
          />
          <button
            className="text-button"
            onClick={() =>
              download(
                new Blob(
                  [
                    JSON.stringify(
                      books.map(({ cover, chapters, ...b }) => ({
                        ...b,
                        chapters: chapters.map(({ text, ...c }) => c),
                      })),
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                "folio-metadata.json",
              )
            }
          >
            Export metadata only
          </button>
          <p className="notice">
            Full JSON backups use memory proportional to your library. For
            multi-gigabyte libraries, retain original files and companion audio
            on disk rather than relying on browser backups.
          </p>
        </section>
        <section className="panel">
          <h3>Storage protection</h3>
          <p>
            Browsers can evict local data under disk pressure. Persistent
            storage helps, but is granted at the browser’s discretion. Private
            browsing may discard all data.
          </p>
          <button
            className="primary"
            onClick={async () => {
              const ok = await navigator.storage?.persist();
              setPersistent(!!ok);
              message(
                ok
                  ? "Persistent storage granted"
                  : "Browser declined; keep external backups",
              );
            }}
          >
            <ShieldCheck size={16} />
            Request persistent storage
          </button>
          <button
            className="text-button"
            onClick={() =>
              void act(async () => {
                for (const key of await caches.keys()) await caches.delete(key);
                message(
                  "Offline app cache cleared. Reload online to recache; books are unchanged.",
                );
              })
            }
          >
            Clear offline app cache
          </button>
        </section>
      </div>
      <section className="panel">
        <h3>Manage files</h3>
        {books.map((b) => (
          <div key={b.id} className="chapter-row">
            <strong>{b.title}</strong>
            <small>
              Source {(b.size / 1048576).toFixed(1)} MB ·{" "}
              {b.chapters.filter((c) => c.assetId?.startsWith("piper:")).length}{" "}
              generated chapters
            </small>
            <button
              onClick={() =>
                void act(async () => {
                  if (
                    !confirm(
                      "Remove generated narration for this book? Original files and text will stay.",
                    )
                  )
                    return;
                  const chapters = await Promise.all(
                    b.chapters.map(async (c) => {
                      if (c.assetId?.startsWith("piper:")) {
                        await db.deleteAsset(c.assetId);
                        return {
                          ...c,
                          assetId: undefined,
                          duration: undefined,
                        };
                      }
                      return c;
                    }),
                  );
                  await db.save({ ...b, chapters, position: 0 });
                  await refresh();
                  message(
                    "Generated audio removed from browser; companion files remain on disk",
                  );
                })
              }
            >
              Clear generated audio
            </button>
            <button
              className="danger"
              aria-label={`Delete ${b.title}`}
              onClick={() => void remove(b)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
