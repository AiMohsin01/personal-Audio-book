import { Cover, Empty, Heading, Summary, BookCard } from "./components/shared";
const UploadPage = lazy(() => import("./components/UploadPage"));
const Details = lazy(() => import("./components/Details"));
import PlayerControls from "./components/PlayerControls";
const Reader = lazy(() => import("./components/Reader"));
const Studio = lazy(() => import("./components/Studio"));
const Stats = lazy(() => import("./components/Stats"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));
const Storage = lazy(() => import("./components/Storage"));
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Headphones,
  LayoutDashboard,
  Library,
  Upload,
  Mic,
  Bookmark,
  BarChart3,
  FolderHeart,
  Settings,
  HardDrive,
  Search,
  Plus,
  ArrowUpRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Grid2X2,
  List,
  ChevronRight,
  X,
  Trash2,
  Clock,
  Volume2,
  Check,
  Menu,
  Leaf,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react";
import { db } from "./db";

import {
  defaults,
  filterBooks,
  progress,
  time,
  uid,
  type Book,
  type Settings as Preferences,
} from "./model";
import { usePlayer } from "./player";
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["library", "My library", Library],
  ["upload", "Add books", Upload],
  ["studio", "Voice studio", Mic],
  ["marks", "Bookmarks & notes", Bookmark],
  ["stats", "Listening insights", BarChart3],
  ["collections", "Collections", FolderHeart],
] as const;
export default function App() {
  const [books, setBooks] = useState<Book[]>([]),
    [settings, setSettings] = useState<Preferences>(defaults),
    [page, setPage] = useState("dashboard"),
    [selected, setSelected] = useState(""),
    [current, setCurrent] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("added"),
    [grid, setGrid] = useState(true),
    [toast, setToast] = useState(""),
    [loaded, setLoaded] = useState(false),
    [collections, setCollections] = useState<string[]>([]),
    [queue, setQueue] = useState<string[]>([]),
    [mobile, setMobile] = useState(false);
  const booksRef = useRef(books);
  booksRef.current = books;
  const message = useCallback((s: string) => setToast(s), []);
  useEffect(() => {
    void Promise.all([db.books(), db.settings(), db.collections()])
      .then(([b, s, c]) => {
        setBooks(b);
        booksRef.current = b;
        setSettings(s);
        setSort(s.sort);
        setCollections(c);
        if (s.autoResume)
          setCurrent(
            [...b]
              .sort((x, y) => y.lastPlayed - x.lastPlayed)
              .find((x) => x.lastPlayed > 0 && !x.completed)?.id || "",
          );
        setLoaded(true);
      })
      .catch((e) => message(`Storage unavailable: ${e.message}`));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  const patch = useCallback((id: string, p: Partial<Book>) => {
    const old = booksRef.current.find((b) => b.id === id);
    if (!old) return;
    const next = { ...old, ...p };
    booksRef.current = booksRef.current.map((b) => (b.id === id ? next : b));
    setBooks(booksRef.current);
    void db.save(next).catch((e) => message(`Could not save: ${e.message}`));
  }, []);
  const preferences = (p: Partial<Preferences>) => {
    const s = { ...settings, ...p };
    setSettings(s);
    void db.setSettings(s).catch((e) => message(e.message));
  };
  const active = books.find((b) => b.id === current);
  const player = usePlayer(
    active,
    settings,
    patch,
    () => {
      const id = queue[0];
      if (id) {
        setCurrent(id);
        setQueue(queue.slice(1));
        return true;
      }
      return false;
    },
    message,
  );
  const navigate = (p: string) => {
    setPage(p);
    setMobile(false);
    setQuery("");
  };
  const details = (b: Book) => {
    setSelected(b.id);
    navigate("details");
  };
  const listen = (b: Book) => {
    player.pause();
    setCurrent(b.id);
    setSelected(b.id);
    navigate("player");
  };
  const remove = async (b: Book) => {
    if (!confirm(`Delete “${b.title}”, its audio, and notes from this device?`))
      return;
    try {
      if (current === b.id) {
        player.pause();
        setCurrent("");
      }
      await db.remove(b);
      setBooks((v) => v.filter((x) => x.id !== b.id));
      navigate("library");
      message("Book deleted");
    } catch (e) {
      message(String(e));
    }
  };
  const selectedBook = books.find((b) => b.id === selected);
  const filtered = filterBooks(books, query, filter, sort);
  const listening = books
    .filter((b) => b.lastPlayed && !b.completed)
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
  const addMark = (kind: "bookmark" | "note" = "bookmark") => {
    if (!active) return;
    const text = kind === "note" ? prompt("Your note at this position:") : "";
    if (text === null) return;
    patch(active.id, {
      marks: [
        ...active.marks,
        {
          id: uid(),
          chapter: active.chapter,
          position: player.position,
          text: text || active.chapters[active.chapter].title,
          kind,
          created: Date.now(),
        },
      ],
    });
    message(kind === "note" ? "Note saved" : "Bookmark saved");
  };
  const addCollection = async () => {
    const name = prompt("Collection name:")?.trim();
    if (!name || collections.includes(name)) return;
    await db.collection(name);
    setCollections(await db.collections());
  };
  return (
    <div
      className={`app ${settings.theme} ${settings.sidebar ? "" : "slim"}`}
      style={
        {
          "--accent": settings.accent,
          "--paper": settings.background,
          "--card-width": `${settings.cardSize}px`,
          "--cover-height": `${settings.coverSize}px`,
          "--density": settings.density,
          fontFamily: settings.font,
          fontSize: settings.fontSize,
        } as CSSProperties
      }
    >
      <aside className={mobile ? "open" : ""}>
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-icon">
            <Headphones size={23} />
          </span>
          folio<span className="brand-dot">.</span>
        </button>
        <div className="workspace-label">YOUR PERSONAL SHELF</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "library" && <em>{books.length}</em>}
              {id === "studio" && <span className="new-badge">LOCAL</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-collections">
          <div className="small-heading">
            COLLECTIONS
            <button aria-label="Create collection" onClick={addCollection}>
              <Plus size={15} />
            </button>
          </div>
          {collections.slice(0, 4).map((c) => (
            <button
              key={c}
              onClick={() => {
                setFilter("collection:" + c);
                navigate("library");
              }}
            >
              <span className="collection-dot" />
              {c}
            </button>
          ))}
          {!collections.length && <p>A little space for your favorites.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="private-card">
            <ShieldCheck size={19} />
            <div>
              <strong>Entirely yours.</strong>
              <span>Offline. Private. Always free.</span>
            </div>
          </div>
          <button onClick={() => navigate("storage")}>
            <HardDrive size={18} />
            Storage manager
          </button>
          <button onClick={() => navigate("settings")}>
            <Settings size={18} />
            Settings
          </button>
          <div className="profile">
            <span>M</span>
            <div>
              <strong>My personal space</strong>
              <small>Local library · No account</small>
            </div>
            <Leaf size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span>Your personal space</span>
            <ChevronRight size={14} />
            <strong>
              {nav.find((x) => x[0] === page)?.[1] ||
                (
                  {
                    details: "Book details",
                    player: "Now playing",
                    reader: "Reading room",
                    settings: "Settings",
                    storage: "Storage manager",
                  } as Record<string, string>
                )[page]}
            </strong>
          </div>
          <div className="header-actions">
            <span className="offline">
              <span /> Local-first
            </span>
            <button
              aria-label="Toggle dark mode"
              onClick={() =>
                preferences({
                  theme: settings.theme === "dark" ? "light" : "dark",
                })
              }
            >
              {settings.theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
            <span className="avatar">M</span>
          </div>
        </header>
        <main>
          <Suspense fallback={<div className="empty">Opening this view…</div>}>
            {!loaded ? (
              <div className="empty">Opening your library…</div>
            ) : (
              <>
                {page === "dashboard" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <div className="eyebrow">
                          A LITTLE TIME, A GOOD BOOK
                        </div>
                        <h1>
                          Your next chapter awaits<span>.</span>
                        </h1>
                        <p>
                          A quiet place for stories, ideas, and everything in
                          between.
                        </p>
                      </div>
                      <button
                        className="primary"
                        onClick={() => navigate("upload")}
                      >
                        <Plus size={17} /> Add books
                      </button>
                    </div>
                    <section className="hero">
                      <div>
                        <span className="pill">
                          <Headphones size={14} /> YOUR LIBRARY. YOUR PACE.
                        </span>
                        <h2>
                          Make room for
                          <br />a good story.
                        </h2>
                        <p>
                          Bring the books you love. Listen, read, and
                          <br className="desktop" /> pick up right where you
                          left off.
                        </p>
                        <button
                          className="primary"
                          onClick={() =>
                            listening[0]
                              ? listen(listening[0])
                              : navigate("upload")
                          }
                        >
                          {listening[0] ? (
                            <Play size={16} />
                          ) : (
                            <Plus size={16} />
                          )}{" "}
                          {listening[0]
                            ? "Continue listening"
                            : "Start your library"}
                          <ArrowUpRight size={16} />
                        </button>
                        <span className="hero-caption">
                          No subscriptions. Just your stories.
                        </span>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit o1" />
                        <div className="orbit o2" />
                        <div className="art-book back">
                          <span>
                            THE ART OF
                            <br />
                            SLOW LIVING
                          </span>
                          <Leaf size={42} />
                          <small>A little more presence</small>
                        </div>
                        <div className="art-book front">
                          <span>
                            WANDER
                            <br />
                            <i>and wonder</i>
                          </span>
                          <div className="mountains" />
                          <small>STORIES FOR THE JOURNEY</small>
                        </div>
                        <div className="art-badge">
                          <Headphones size={18} />
                          <span>
                            Good books.
                            <br />
                            <strong>Great company.</strong>
                          </span>
                        </div>
                        <span className="spark s1">✧</span>
                        <span className="spark s2">✧</span>
                      </div>
                    </section>
                    <div className="summary-grid">
                      <Summary
                        icon={<Library size={20} />}
                        label="Books on your shelf"
                        value={String(books.length)}
                        detail="A world waiting to be explored"
                      />
                      <Summary
                        icon={<Headphones size={20} />}
                        label="In progress"
                        value={String(listening.length)}
                        detail="One chapter at a time"
                      />
                      <Summary
                        icon={<Check size={20} />}
                        label="Books completed"
                        value={String(books.filter((b) => b.completed).length)}
                        detail="Stories that stay with you"
                      />
                    </div>
                    <div className="section-heading">
                      <div>
                        <h2>Continue your journey</h2>
                        <p>Right where you left off.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter("listening");
                          navigate("library");
                        }}
                      >
                        View all <ChevronRight size={16} />
                      </button>
                    </div>
                    {listening.length ? (
                      <div className="continue-grid">
                        {listening.slice(0, 3).map((b) => (
                          <button
                            className="continue-card"
                            key={b.id}
                            onClick={() => listen(b)}
                          >
                            <Cover book={b} small />
                            <div>
                              <span className="eyebrow">{b.format}</span>
                              <h3>{b.title}</h3>
                              <p>{b.author}</p>
                              <div className="progress-track">
                                <i style={{ width: progress(b) + "%" }} />
                              </div>
                              <small>{Math.round(progress(b))}% complete</small>
                            </div>
                            <span className="round-play">
                              <Play size={18} />
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="quiet-empty">
                        <Headphones size={24} />
                        <div>
                          <strong>Your listening journey starts here</strong>
                          <p>
                            Add a book and press play. We’ll save your place.
                          </p>
                        </div>
                        <button onClick={() => navigate("upload")}>
                          Explore your shelf <ArrowUpRight size={16} />
                        </button>
                      </div>
                    )}
                    <div className="section-heading">
                      <div>
                        <h2>Recently added</h2>
                        <p>Fresh additions to your personal shelf.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter("all");
                          navigate("library");
                        }}
                      >
                        Open library <ChevronRight size={16} />
                      </button>
                    </div>
                    {books.length ? (
                      <div className="book-grid">
                        {[...books]
                          .sort((a, b) => b.added - a.added)
                          .slice(0, 5)
                          .map((b) => (
                            <BookCard
                              key={b.id}
                              book={b}
                              onOpen={() => details(b)}
                              onFavorite={() =>
                                patch(b.id, { favorite: !b.favorite })
                              }
                            />
                          ))}
                      </div>
                    ) : (
                      <Empty
                        title="A shelf with endless possibilities"
                        action={() => navigate("upload")}
                      >
                        Your books belong here. Add an audiobook, PDF, or EPUB
                        to get started.
                      </Empty>
                    )}
                    <div className="quote">
                      <Leaf size={18} />
                      <span>
                        “A book is a dream that you hold in your hand.”
                      </span>
                      <small>— Neil Gaiman</small>
                    </div>
                  </>
                )}
                {page === "library" && (
                  <>
                    <Heading
                      eyebrow="YOUR STORIES, TOGETHER"
                      title="My library"
                      subtitle={`${books.length} books. A collection that is entirely yours.`}
                      action={
                        <button
                          className="primary"
                          onClick={() => navigate("upload")}
                        >
                          <Plus size={16} />
                          Add books
                        </button>
                      }
                    />
                    <div className="library-tabs">
                      {[
                        ["all", "All books"],
                        ["listening", "Currently listening"],
                        ["recent", "Recently added"],
                        ["favorites", "Favorites"],
                        ["completed", "Completed"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          className={filter === v ? "selected" : ""}
                          onClick={() => setFilter(v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="toolbar">
                      <label className="search">
                        <Search size={17} />
                        <input
                          placeholder="Search books, authors, genres…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Library filter"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">All books</option>
                        <option value="listening">Currently listening</option>
                        <option value="recent">Recently added</option>
                        <option value="favorites">Favorites</option>
                        <option value="completed">Completed</option>
                        {collections.map((c) => (
                          <option key={c} value={"collection:" + c}>
                            Collection: {c}
                          </option>
                        ))}
                        {[...new Set(books.map((b) => b.author))].map((a) => (
                          <option key={"a" + a} value={"author:" + a}>
                            Author: {a}
                          </option>
                        ))}
                        {[...new Set(books.map((b) => b.category))].map((a) => (
                          <option key={"g" + a} value={"genre:" + a}>
                            Genre: {a}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Sort books"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {[
                          ["added", "Recently added"],
                          ["title", "Title"],
                          ["author", "Author"],
                          ["lastPlayed", "Last played"],
                          ["duration", "Duration"],
                          ["progress", "Progress"],
                        ].map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <div className="view-toggle">
                        <button
                          aria-label="Grid view"
                          className={grid ? "selected" : ""}
                          onClick={() => setGrid(true)}
                        >
                          <Grid2X2 size={17} />
                        </button>
                        <button
                          aria-label="List view"
                          className={!grid ? "selected" : ""}
                          onClick={() => setGrid(false)}
                        >
                          <List size={17} />
                        </button>
                      </div>
                    </div>
                    {filtered.length ? (
                      <div className={grid ? "book-grid" : "book-list"}>
                        {filtered.map((b) => (
                          <BookCard
                            key={b.id}
                            book={b}
                            onOpen={() => details(b)}
                            onFavorite={() =>
                              patch(b.id, { favorite: !b.favorite })
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title={
                          books.length
                            ? "No books match your search"
                            : "Your shelf is waiting"
                        }
                        action={
                          books.length ? undefined : () => navigate("upload")
                        }
                      >
                        Add your own files to build a private library you can
                        take offline.
                      </Empty>
                    )}
                  </>
                )}
                {page === "upload" && (
                  <UploadPage
                    onAdded={async () => {
                      setBooks(await db.books());
                    }}
                    message={message}
                    onLibrary={() => navigate("library")}
                  />
                )}
                {page === "details" && selectedBook && (
                  <Details
                    book={selectedBook}
                    patch={(p) => patch(selectedBook.id, p)}
                    collections={collections}
                    listen={() => listen(selectedBook)}
                    read={() => navigate("reader")}
                    studio={() => navigate("studio")}
                    remove={() => void remove(selectedBook)}
                    enqueue={() => {
                      setQueue([...queue, selectedBook.id]);
                      message("Added to playback queue");
                    }}
                    message={message}
                  />
                )}
                {page === "player" && (
                  <>
                    <Heading
                      eyebrow="TAKE A MOMENT"
                      title="Now playing"
                      subtitle="The rest of the world can wait."
                    />
                    {active ? (
                      <>
                        <div className="full-player">
                          <Cover book={active} />
                          <div className="full-player-info">
                            <span className="eyebrow">
                              {active.category} · {active.format}
                            </span>
                            <h2>{active.title}</h2>
                            <p>{active.author}</p>
                            <p className="chapter-label">
                              {active.chapters[active.chapter]?.title}
                            </p>
                            <PlayerControls
                              player={player}
                              settings={settings}
                              preferences={preferences}
                            />
                            <div className="player-extra">
                              <button onClick={() => addMark()}>
                                <Bookmark size={17} /> Bookmark
                              </button>
                              <button onClick={() => addMark("note")}>
                                <Plus size={17} /> Note
                              </button>
                              <label>
                                <Clock size={17} />
                                <select
                                  aria-label="Sleep timer"
                                  value={
                                    player.endSleep
                                      ? -1
                                      : player.sleepUntil
                                        ? Math.ceil(
                                            (player.sleepUntil - Date.now()) /
                                              60000,
                                          )
                                        : 0
                                  }
                                  onChange={(e) =>
                                    player.sleep(Number(e.target.value))
                                  }
                                >
                                  <option value="0">Sleep timer off</option>
                                  <option value="5">5 minutes</option>
                                  <option value="15">15 minutes</option>
                                  <option value="30">30 minutes</option>
                                  <option value="60">60 minutes</option>
                                  <option value="-1">End of chapter</option>
                                </select>
                              </label>
                            </div>
                            {player.sleepUntil > 0 && (
                              <p className="muted">
                                Sleep timer ends at{" "}
                                {new Date(
                                  player.sleepUntil,
                                ).toLocaleTimeString()}
                              </p>
                            )}
                            {!player.ready && (
                              <p className="notice">
                                This chapter needs narration.{" "}
                                <button
                                  onClick={() => {
                                    setSelected(active.id);
                                    navigate("studio");
                                  }}
                                >
                                  Open Voice Studio
                                </button>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="two-columns">
                          <section className="panel">
                            <h3>Chapters</h3>
                            {active.chapters.map((c, i) => (
                              <button
                                key={c.id}
                                className={`chapter-row ${i === active.chapter ? "selected" : ""}`}
                                onClick={() => player.changeChapter(i)}
                              >
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                <strong>{c.title}</strong>
                                <small>
                                  {c.assetId ? time(c.duration || 0) : "Text"}
                                </small>
                              </button>
                            ))}
                          </section>
                          <section className="panel">
                            <h3>
                              Up next{" "}
                              <span className="count">{queue.length}</span>
                            </h3>
                            {queue.length ? (
                              queue.map((id, i) => {
                                const b = books.find((x) => x.id === id);
                                return (
                                  b && (
                                    <div className="queue-row" key={i}>
                                      <Cover book={b} small />
                                      <button
                                        onClick={() => {
                                          listen(b);
                                          setQueue(
                                            queue.filter((_, n) => n !== i),
                                          );
                                        }}
                                      >
                                        {b.title}
                                      </button>
                                      <button
                                        aria-label="Remove from queue"
                                        onClick={() =>
                                          setQueue(
                                            queue.filter((_, n) => n !== i),
                                          )
                                        }
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                  )
                                );
                              })
                            ) : (
                              <p className="muted">
                                Add books from their details to create a
                                listening queue.
                              </p>
                            )}
                          </section>
                        </div>
                      </>
                    ) : (
                      <Empty
                        title="Find your next listen"
                        action={() => navigate("upload")}
                      >
                        Open a book from your library to start listening.
                      </Empty>
                    )}
                  </>
                )}
                {page === "reader" && selectedBook && (
                  <Reader
                    book={selectedBook}
                    settings={settings}
                    preferences={preferences}
                    patch={(p) => patch(selectedBook.id, p)}
                    message={message}
                  />
                )}
                {page === "studio" && (
                  <Studio
                    books={books}
                    selected={selected}
                    settings={settings}
                    patch={patch}
                    message={message}
                  />
                )}
                {page === "marks" && (
                  <>
                    <Heading
                      eyebrow="KEEP THE GOOD PARTS"
                      title="Bookmarks & notes"
                      subtitle="Moments worth coming back to."
                    />
                    {books.some((b) => b.marks.length) ? (
                      books.flatMap((b) =>
                        b.marks.map((m) => (
                          <div className="mark-card" key={m.id}>
                            <Bookmark size={20} />
                            <div>
                              <strong>{b.title}</strong>
                              <span>
                                {m.kind} · {b.chapters[m.chapter]?.title} ·{" "}
                                {time(m.position)}
                              </span>
                              <p>{m.text}</p>
                            </div>
                            <button
                              onClick={() => {
                                setSelected(b.id);
                                if (
                                  m.kind === "highlight" ||
                                  m.kind === "reading"
                                ) {
                                  patch(b.id, {
                                    readerChapter: m.chapter,
                                    readerPosition: m.position,
                                  });
                                  navigate("reader");
                                } else {
                                  setCurrent(b.id);
                                  patch(b.id, {
                                    chapter: m.chapter,
                                    position: m.position,
                                  });
                                  navigate("player");
                                }
                              }}
                            >
                              Go to <ArrowUpRight size={16} />
                            </button>
                            <button
                              aria-label="Delete bookmark or note"
                              onClick={() =>
                                patch(b.id, {
                                  marks: b.marks.filter((x) => x.id !== m.id),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )),
                      )
                    ) : (
                      <Empty title="Save a moment">
                        Bookmark a chapter or leave a note while listening.
                        Highlights from your reading room live here too.
                      </Empty>
                    )}
                  </>
                )}
                {page === "stats" && (
                  <Stats books={books} settings={settings} />
                )}
                {page === "collections" && (
                  <>
                    <Heading
                      eyebrow="CURATE YOUR CORNER"
                      title="Collections"
                      subtitle="A home for every kind of story."
                      action={
                        <button
                          className="primary"
                          onClick={() => void addCollection()}
                        >
                          <Plus size={16} /> New collection
                        </button>
                      }
                    />
                    {collections.length ? (
                      <div className="collections-grid">
                        {collections.map((c) => (
                          <div className="panel collection-card" key={c}>
                            <FolderHeart size={32} />
                            <h3>{c}</h3>
                            <p>
                              {books.filter((b) => b.collection === c).length}{" "}
                              books
                            </p>
                            <button
                              className="primary"
                              onClick={() => {
                                setFilter("collection:" + c);
                                navigate("library");
                              }}
                            >
                              Open collection <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="text-button"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Remove collection “${c}”? Books will be kept.`,
                                  )
                                )
                                  return;
                                await db.collection(c, true);
                                for (const b of books.filter(
                                  (b) => b.collection === c,
                                ))
                                  patch(b.id, { collection: "" });
                                setCollections(await db.collections());
                              }}
                            >
                              Remove collection
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty title="Make it your own">
                        Create collections above, then organize books from their
                        details.
                      </Empty>
                    )}
                  </>
                )}
                {page === "settings" && (
                  <SettingsPage settings={settings} preferences={preferences} />
                )}
                {page === "storage" && (
                  <Storage
                    books={books}
                    message={message}
                    refresh={async () => {
                      setBooks(await db.books());
                      setSettings(await db.settings());
                      setCollections(await db.collections());
                    }}
                    remove={remove}
                  />
                )}
              </>
            )}
          </Suspense>
        </main>
        <footer>
          <Leaf size={14} />
          <span>Made for the love of books.</span>
          <span>Your files stay on this device.</span>
        </footer>
      </div>
      <div className={`mini-player ${settings.playerCompact ? "compact" : ""}`}>
        <div className="mini-book">
          {active ? (
            <>
              <button onClick={() => navigate("player")}>
                <Cover book={active} small />
              </button>
              <button className="mini-title" onClick={() => navigate("player")}>
                <strong>{active.title}</strong>
                <span>{active.author}</span>
              </button>
              <button
                aria-label="Favorite current book"
                onClick={() => patch(active.id, { favorite: !active.favorite })}
              >
                <Heart
                  size={18}
                  fill={active.favorite ? "currentColor" : "none"}
                />
              </button>
            </>
          ) : (
            <>
              <span className="mini-empty-icon">
                <Headphones size={25} />
              </span>
              <div>
                <strong>Your next great listen</strong>
                <span>Add a book to make yourself at home.</span>
              </div>
            </>
          )}
        </div>
        <div className="mini-controls">
          <div>
            <button
              aria-label={`Skip back ${settings.skip} seconds`}
              disabled={!active}
              onClick={() => player.skip(-settings.skip)}
            >
              <SkipBack size={19} />
            </button>
            <button
              className="play-button"
              aria-label={player.playing ? "Pause" : "Play"}
              disabled={!active}
              onClick={player.toggle}
            >
              {player.playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              aria-label={`Skip forward ${settings.skip} seconds`}
              disabled={!active}
              onClick={() => player.skip(settings.skip)}
            >
              <SkipForward size={19} />
            </button>
          </div>
          <div className="mini-progress">
            <span>{time(player.position)}</span>
            <input
              aria-label="Playback position"
              type="range"
              min="0"
              max={player.length || 1}
              step="0.1"
              value={Math.min(player.position, player.length || 1)}
              disabled={!player.ready}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <span>{time(player.length)}</span>
          </div>
        </div>
        <div className="mini-options">
          <button
            onClick={() =>
              preferences({
                speed:
                  settings.speed >= 2
                    ? 0.75
                    : Math.round((settings.speed + 0.25) * 100) / 100,
              })
            }
          >
            {settings.speed}×
          </button>
          <button
            aria-label="Bookmark current position"
            disabled={!active}
            onClick={() => addMark()}
          >
            <Bookmark size={17} />
          </button>
          <Volume2 size={18} />
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.volume}
            onChange={(e) => preferences({ volume: Number(e.target.value) })}
          />
          <button
            aria-label="Open full player"
            onClick={() => navigate("player")}
          >
            <ArrowUpRight size={19} />
          </button>
        </div>
      </div>
      <nav className="mobile-bottom">
        {[nav[0], nav[1], nav[2], nav[3], nav[6]].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={page === id ? "active" : ""}
          >
            <Icon size={19} />
            <span>{label.split(" ")[0]}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div role="status" className="toast">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
