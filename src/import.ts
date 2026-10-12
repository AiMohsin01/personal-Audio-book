import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { unzip, strFromU8, type Unzipped } from "fflate";
import { readMP4Chapters } from "./mp4chapters";
import { createSHA256 } from "hash-wasm";
import { parseBlob } from "music-metadata";
import { db } from "./db";
import { uid, type Book, type Chapter } from "./model";
GlobalWorkerOptions.workerSrc = worker;
export async function importFile(
  file: File,
  onProgress: (n: number) => void,
): Promise<Book> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!["pdf", "epub", "mp3", "m4b", "wav", "flac", "m4a", "ogg"].includes(ext))
    throw Error(
      "Unsupported file. Choose PDF, EPUB, MP3, M4B, WAV, FLAC, M4A, or OGG.",
    );
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
    hasher.update(
      new Uint8Array(
        await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
      ),
    );
    onProgress(file.size ? (offset / file.size) * 10 : 0);
  }
  const hash = hasher.digest();
  if ((await db.books()).some((b) => b.fingerprint === hash))
    throw Error("This exact file is already in your library.");
  const book: Book = {
    id: uid(),
    title: file.name.replace(/\.[^.]+$/, ""),
    author: "Unknown author",
    description: "",
    category: "Uncategorized",
    added: Date.now(),
    lastPlayed: 0,
    favorite: false,
    completed: false,
    collection: "",
    chapters: [],
    position: 0,
    chapter: 0,
    readerChapter: 0,
    readerPosition: 0,
    marks: [],
    voice: "",
    fingerprint: hash,
    size: file.size,
    format: ext.toUpperCase(),
  };
  if (ext === "pdf") {
    const task = getDocument({
      data: await file.arrayBuffer(),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    const meta = await pdf.getMetadata();
    const info = meta.info as { Title?: string; Author?: string };
    book.title = info.Title || book.title;
    book.author = info.Author || book.author;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = (await page.getTextContent()).items
        .map((x) =>
          "str" in x ? x.str + ("hasEOL" in x && x.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      book.chapters.push({ id: uid(), title: `Page ${i}`, text });
      page.cleanup();
      onProgress((i / pdf.numPages) * 90);
    }
    await task.destroy();
  } else if (ext === "epub") {
    let expanded = 0;
    const files = await new Promise<Unzipped>(async (resolve, reject) => {
      try {
        unzip(
          new Uint8Array(await file.arrayBuffer()),
          {
            filter: (entry) => {
              expanded += entry.originalSize;
              if (expanded > 512 * 1024 * 1024)
                throw Error(
                  "EPUB expands beyond 512 MB. Split this book before import.",
                );
              return true;
            },
          },
          (err, result) => (err ? reject(err) : resolve(result)),
        );
      } catch (e) {
        reject(e);
      }
    });
    const parse = (path: string) =>
      new DOMParser().parseFromString(
        strFromU8(files[path]),
        "application/xml",
      );
    const container = parse("META-INF/container.xml");
    const opfPath = container
      .getElementsByTagName("rootfile")[0]
      ?.getAttribute("full-path");
    if (!opfPath || !files[opfPath])
      throw Error("EPUB has no readable package.");
    const opf = parse(opfPath);
    const tag = (name: string) =>
      opf.getElementsByTagNameNS("*", name)[0]?.textContent || "";
    book.title = tag("title") || book.title;
    book.author = tag("creator") || book.author;
    book.description = tag("description");
    book.category = tag("subject") || book.category;
    const base = opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : "";
    const resolve = (href: string) => {
      const parts = (base + decodeURIComponent(href.split("#")[0])).split("/");
      const out: string[] = [];
      for (const p of parts) {
        if (p === "..") out.pop();
        else if (p && p !== ".") out.push(p);
      }
      return out.join("/");
    };
    const items = Array.from(opf.getElementsByTagName("item"));
    const coverId = Array.from(opf.getElementsByTagName("meta"))
      .find((x) => x.getAttribute("name") === "cover")
      ?.getAttribute("content");
    const cover = items.find(
      (x) =>
        x.getAttribute("properties")?.includes("cover-image") ||
        x.getAttribute("id") === coverId,
    );
    if (cover) {
      const bytes = files[resolve(cover.getAttribute("href") || "")];
      if (bytes)
        book.cover = new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: cover.getAttribute("media-type") || "image/jpeg",
        });
    }
    const refs = Array.from(opf.getElementsByTagName("itemref"));
    for (let i = 0; i < refs.length; i++) {
      const item = items.find(
        (x) => x.getAttribute("id") === refs[i].getAttribute("idref"),
      );
      if (!item) continue;
      const bytes = files[resolve(item.getAttribute("href") || "")];
      if (!bytes) continue;
      const doc = new DOMParser().parseFromString(
        strFromU8(bytes),
        "text/html",
      );
      doc.querySelectorAll("script,style,nav").forEach((x) => x.remove());
      const title =
        doc.querySelector("h1,h2,h3,title")?.textContent?.trim() ||
        `Chapter ${i + 1}`;
      const text =
        Array.from(doc.querySelectorAll("p,h1,h2,h3,li,blockquote"))
          .map((x) => x.textContent?.trim())
          .filter(Boolean)
          .join("\n\n") ||
        doc.body.textContent?.trim() ||
        "";
      book.chapters.push({ id: uid(), title, text });
      onProgress(((i + 1) / refs.length) * 90);
    }
  } else {
    let chapters: Chapter[] = [];
    try {
      const metadata = await parseBlob(file, {
        includeChapters: true,
        duration: true,
      });
      book.title = metadata.common.title || book.title;
      book.author = metadata.common.artist || book.author;
      book.category = metadata.common.genre?.[0] || book.category;
      const pic = metadata.common.picture?.[0];
      if (pic)
        book.cover = new Blob([new Uint8Array(pic.data)], { type: pic.format });
      const assetId = uid();
      await db.asset(assetId, file);
      const nero = ["m4b", "m4a"].includes(ext)
        ? await readMP4Chapters(file)
        : [];
      const embedded:
        | {
            title: string;
            start: number;
            sampleOffset?: number;
            timeScale?: number;
            end?: number;
          }[]
        | undefined = nero.length ? nero : metadata.format.chapters;
      chapters = embedded?.length
        ? embedded.map((c, i) => {
            const start =
              c.sampleOffset !== undefined && metadata.format.sampleRate
                ? c.sampleOffset / metadata.format.sampleRate
                : c.start / (c.timeScale || 1);
            const next = embedded[i + 1];
            const end =
              c.end !== undefined
                ? c.end / (c.timeScale || 1)
                : next
                  ? next.sampleOffset !== undefined &&
                    metadata.format.sampleRate
                    ? next.sampleOffset / metadata.format.sampleRate
                    : next.start / (next.timeScale || 1)
                  : metadata.format.duration;
            return {
              id: uid(),
              title: c.title || `Chapter ${i + 1}`,
              assetId,
              start,
              end,
              duration: end !== undefined ? end - start : undefined,
            };
          })
        : [
            {
              id: uid(),
              title: metadata.common.title || "Full audiobook",
              assetId,
              duration: metadata.format.duration,
            },
          ];
    } catch {
      const assetId = uid();
      await db.asset(assetId, file);
      chapters = [{ id: uid(), title: "Full audiobook", assetId }];
    }
    book.chapters = chapters;
  }
  if (!book.chapters.length) throw Error("No readable chapters found.");
  if (ext === "pdf" || ext === "epub")
    await db.asset(`${book.id}:source`, file);
  await db.save(book);
  onProgress(100);
  return book;
}
