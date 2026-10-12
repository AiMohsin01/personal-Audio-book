import { useRef, useState } from "react";
import { Upload, Plus, ChevronRight, FileAudio, FileText } from "lucide-react";

import { importFile } from "../import";

import { Heading } from "./shared";
export default function UploadPage({
  onAdded,
  message,
  onLibrary,
}: {
  onAdded: () => Promise<void>;
  message: (s: string) => void;
  onLibrary: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [jobs, setJobs] = useState<
      { name: string; progress: number; status: string }[]
    >([]);
  const input = useRef<HTMLInputElement>(null);
  const run = async (files: FileList | File[]) => {
    if (busy) return;
    setBusy(true);
    const list = Array.from(files);
    setJobs(
      list.map((f) => ({ name: f.name, progress: 0, status: "Waiting" })),
    );
    for (let i = 0; i < list.length; i++) {
      try {
        setJobs((v) =>
          v.map((j, n) => (n === i ? { ...j, status: "Importing" } : j)),
        );
        const b = await importFile(list[i], (n) =>
          setJobs((v) =>
            v.map((j, k) => (k === i ? { ...j, progress: n } : j)),
          ),
        );
        setJobs((v) =>
          v.map((j, n) =>
            n === i
              ? {
                  ...j,
                  status: b.chapters.some((c) => c.text)
                    ? "Ready to read"
                    : "Ready to listen",
                }
              : j,
          ),
        );
        await onAdded();
      } catch (e) {
        message(`Could not import ${list[i].name}: ${String(e)}`);
        setJobs((v) =>
          v.map((j, n) => (n === i ? { ...j, status: String(e) } : j)),
        );
      }
    }
    setBusy(false);
  };
  return (
    <>
      <Heading
        eyebrow="BRING YOUR OWN STORIES"
        title="Add books"
        subtitle="Your files, on your device. No uploads to the cloud."
      />
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void run(e.dataTransfer.files);
        }}
      >
        <span className="upload-icon">
          <Upload size={32} />
        </span>
        <h2>Give your books a new home</h2>
        <p>Drag your files here, or choose them from your device.</p>
        <button
          className="primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus size={17} />
          {busy ? "Importing…" : "Choose files"}
        </button>
        <input
          hidden
          ref={input}
          type="file"
          multiple
          accept=".pdf,.epub,.mp3,.m4b,.wav,.flac,.m4a,.ogg"
          onChange={(e) => {
            if (e.target.files) void run(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="formats">
          PDF · EPUB · MP3 · M4B · WAV · FLAC · M4A · OGG
        </span>
      </div>
      <div className="two-columns">
        <div className="panel">
          <FileAudio size={24} />
          <h3>Already an audiobook?</h3>
          <p>
            Import audio, press play, and we’ll remember your place. Codec
            support depends on your browser.
          </p>
        </div>
        <div className="panel">
          <FileText size={24} />
          <h3>A book waiting to be heard?</h3>
          <p>
            Read PDFs and EPUBs, or use Voice Studio with the free local
            companion to generate narration.
          </p>
        </div>
      </div>
      {jobs.map((j, i) => (
        <div className="upload-job" key={i}>
          <FileText size={19} />
          <div>
            <strong>{j.name}</strong>
            <span>{j.status}</span>
            <progress value={j.progress} max="100" />
          </div>
          <span>{Math.round(j.progress)}%</span>
        </div>
      ))}
      {jobs.length > 0 && !busy && (
        <button className="primary" onClick={onLibrary}>
          Go to my library <ChevronRight size={16} />
        </button>
      )}
      <p className="notice">
        Large imports need free browser memory and disk space. Browser storage
        may be evicted; keep backups and request persistent storage in Storage
        Manager. Image-only PDFs need optional local OCR before text extraction.
      </p>
    </>
  );
}
