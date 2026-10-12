import { useEffect, useState } from "react";
import { BookOpen, Plus, ArrowUpRight, Heart } from "lucide-react";

import { duration, progress, time, type Book } from "../model";

export function Cover({
  book,
  small = false,
}: {
  book: Book;
  small?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!book.cover) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(book.cover);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [book.cover]);
  const colors = [
    "#b47150",
    "#435665",
    "#63724e",
    "#927a91",
    "#b09967",
    "#395e61",
  ];
  return (
    <div
      className={`cover ${small ? "small" : ""}`}
      style={{ background: colors[book.title.charCodeAt(0) % colors.length] }}
    >
      {url ? (
        <img src={url} alt={`${book.title} cover`} />
      ) : (
        <>
          <span className="cover-rule" />
          <BookOpen size={small ? 20 : 27} />
          <strong>{book.title}</strong>
          <span>{book.author}</span>
          <span className="cover-rule" />
        </>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={32} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <button className="primary" onClick={action}>
          <Plus size={16} /> Add your first book
        </button>
      )}
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function Summary({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="summary">
      <span className="summary-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
export function BookCard({
  book: b,
  onOpen,
  onFavorite,
}: {
  book: Book;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={onOpen}>
        <Cover book={b} />
        <span className="format-badge">{b.format}</span>
        <span className="cover-open">
          <ArrowUpRight size={20} />
        </span>
      </button>
      <div className="book-meta">
        <button onClick={onOpen}>
          <h3>{b.title}</h3>
          <p>{b.author}</p>
        </button>
        <button
          className={b.favorite ? "favorite" : ""}
          aria-label={`Favorite ${b.title}`}
          onClick={onFavorite}
        >
          <Heart size={17} fill={b.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="book-foot">
        <span>{duration(b) ? time(duration(b)) : "Ready to read"}</span>
        <span>
          {b.completed
            ? "Completed"
            : b.lastPlayed
              ? Math.round(progress(b)) + "%"
              : ""}
        </span>
      </div>
    </article>
  );
}
