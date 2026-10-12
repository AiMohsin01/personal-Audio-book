import { validateBackup } from "./backup";
import { openDB } from "idb";
import { defaults, type Book, type Settings } from "./model";
const database = openDB("folio", 1, {
  upgrade(db) {
    db.createObjectStore("books", { keyPath: "id" });
    db.createObjectStore("assets");
    db.createObjectStore("settings");
    db.createObjectStore("activity", { keyPath: "date" });
    db.createObjectStore("collections");
  },
});
export const db = {
  async deleteAsset(id: string) {
    await (await database).delete("assets", id);
  },
  async deleteRecord(id: string) {
    await (await database).delete("books", id);
  },
  async books(): Promise<Book[]> {
    return (await database).getAll("books");
  },
  async save(b: Book) {
    await (await database).put("books", b);
  },
  async remove(b: Book) {
    const d = await database;
    const tx = d.transaction(["books", "assets"], "readwrite");
    await tx.objectStore("books").delete(b.id);
    await tx.objectStore("assets").delete(`${b.id}:source`);
    for (const c of b.chapters)
      if (c.assetId) await tx.objectStore("assets").delete(c.assetId);
    await tx.done;
  },
  async asset(id: string, blob?: Blob): Promise<Blob | undefined> {
    const d = await database;
    if (blob) {
      await d.put("assets", blob, id);
      return blob;
    }
    return d.get("assets", id);
  },
  async settings(): Promise<Settings> {
    return {
      ...defaults,
      ...(await (await database).get("settings", "preferences")),
    };
  },
  async setSettings(s: Settings) {
    await (await database).put("settings", s, "preferences");
  },
  async collections(): Promise<string[]> {
    return (await database).getAllKeys("collections") as Promise<string[]>;
  },
  async collection(name: string, remove = false) {
    const d = await database;
    if (remove) await d.delete("collections", name);
    else await d.put("collections", true, name);
  },
  async activity(): Promise<{ date: string; seconds: number }[]> {
    return (await database).getAll("activity");
  },
  async listen(seconds: number) {
    const d = await database;
    const tx = d.transaction("activity", "readwrite");
    const date = new Date().toLocaleDateString("en-CA");
    const old = await tx.store.get(date);
    await tx.store.put({ date, seconds: (old?.seconds || 0) + seconds });
    await tx.done;
  },
  async backup() {
    const d = await database;
    return {
      version: 1,
      books: await d.getAll("books"),
      settings: await d.get("settings", "preferences"),
      activity: await d.getAll("activity"),
      collections: await d.getAllKeys("collections"),
      assets: await Promise.all(
        (await d.getAllKeys("assets")).map(async (id) => ({
          id,
          blob: await d.get("assets", id),
        })),
      ),
    };
  },
  async restore(data: {
    version: number;
    books: Book[];
    settings: Settings;
    activity: { date: string; seconds: number }[];
    collections: string[];
    assets: { id: string; blob: Blob }[];
  }) {
    validateBackup(data);
    const d = await database;
    const tx = d.transaction(
      ["books", "assets", "settings", "activity", "collections"],
      "readwrite",
    );
    for (const b of data.books) await tx.objectStore("books").put(b);
    for (const a of data.assets)
      await tx.objectStore("assets").put(a.blob, a.id);
    if (data.settings)
      await tx.objectStore("settings").put(data.settings, "preferences");
    for (const a of data.activity || [])
      await tx.objectStore("activity").put(a);
    for (const c of data.collections || [])
      await tx.objectStore("collections").put(true, c);
    await tx.done;
  },
};
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
export async function exportBackup() {
  const data = await db.backup();
  const encoded = await JSON.stringify(await encode(data));
  download(
    new Blob([encoded], { type: "application/json" }),
    `folio-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
}
async function encode(v: any): Promise<any> {
  if (v instanceof Blob) {
    const bytes = new Uint8Array(await v.arrayBuffer());
    let str = "";
    for (let i = 0; i < bytes.length; i += 8192)
      str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { __blob: btoa(str), type: v.type };
  }
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  if (v && typeof v === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(v).map(async ([k, val]) => [k, await encode(val)]),
      ),
    );
  return v;
}
export function decode(v: any): any {
  if (v && typeof v === "object" && typeof v.__blob === "string")
    return new Blob([Uint8Array.from(atob(v.__blob), (c) => c.charCodeAt(0))], {
      type: v.type,
    });
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k, decode(val)]),
    );
  return v;
}
