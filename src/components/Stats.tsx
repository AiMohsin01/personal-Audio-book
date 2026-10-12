import { useEffect, useState } from "react";
import { Headphones, Clock, Leaf } from "lucide-react";
import { db } from "../db";

import { progress, type Book, type Settings as Preferences } from "../model";

import { Heading, Summary } from "./shared";
export default function Stats({
  books,
  settings,
}: {
  books: Book[];
  settings: Preferences;
}) {
  const [activity, setActivity] = useState<{ date: string; seconds: number }[]>(
    [],
  );
  useEffect(() => {
    void db.activity().then(setActivity);
    const id = setInterval(() => void db.activity().then(setActivity), 5000);
    return () => clearInterval(id);
  }, []);
  const today = new Date().toLocaleDateString("en-CA");
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    return {
      date: date.toLocaleDateString("en-CA"),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
    };
  });
  const total = activity.reduce((n, x) => n + x.seconds, 0);
  const week = activity
    .filter((a) => days.some((d) => d.date === a.date))
    .reduce((n, x) => n + x.seconds, 0);
  const month = activity
    .filter((a) => a.date.slice(0, 7) === today.slice(0, 7))
    .reduce((n, x) => n + x.seconds, 0);
  let streak = 0;
  const checkDate = new Date();
  if (!activity.some((a) => a.date === today && a.seconds > 0))
    checkDate.setDate(checkDate.getDate() - 1);
  while (
    activity.some(
      (a) => a.date === checkDate.toLocaleDateString("en-CA") && a.seconds > 0,
    )
  ) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return (
    <>
      <Heading
        eyebrow="SMALL MOMENTS ADD UP"
        title="Listening insights"
        subtitle="Real listening activity, recorded only on this device."
      />
      <div className="summary-grid">
        <Summary
          icon={<Headphones size={20} />}
          label="All-time listening"
          value={(total / 3600).toFixed(1) + "h"}
          detail={`${Math.round(total / 60)} minutes of stories`}
        />
        <Summary
          icon={<Clock size={20} />}
          label="This week"
          value={Math.round(week / 60) + "m"}
          detail={`This month: ${Math.round(month / 60)} minutes`}
        />
        <Summary
          icon={<Leaf size={20} />}
          label="Listening streak"
          value={streak + " days"}
          detail={`${books.filter((b) => b.completed).length} books marked completed`}
        />
      </div>
      <section className="panel">
        <h3>Your week in stories</h3>
        <div className="bar-chart">
          {days.map((d) => {
            const mins =
              (activity.find((a) => a.date === d.date)?.seconds || 0) / 60;
            return (
              <div key={d.date}>
                <span>{Math.round(mins)}m</span>
                <i
                  style={{
                    height: Math.max(
                      2,
                      Math.min(
                        180,
                        (mins /
                          Math.max(
                            settings.goal,
                            ...activity.map((a) => a.seconds / 60),
                          )) *
                          180,
                      ),
                    ),
                  }}
                />
                <small>{d.label}</small>
              </div>
            );
          })}
        </div>
        <p className="muted">
          Daily goal: {settings.goal} minutes · Today:{" "}
          {Math.round(
            (activity.find((a) => a.date === today)?.seconds || 0) / 60,
          )}{" "}
          minutes. Time counts actual playback, independent of speed. Waiting,
          paused, and seeking time are excluded.
        </p>
      </section>
      <section className="panel">
        <h3>Reading & listening history</h3>
        {books
          .filter((b) => b.lastPlayed)
          .sort((a, b) => b.lastPlayed - a.lastPlayed)
          .map((b) => (
            <div className="chapter-row" key={b.id}>
              <strong>{b.title}</strong>
              <span>{Math.round(progress(b))}%</span>
              <small>
                Last listened {new Date(b.lastPlayed).toLocaleString()}
              </small>
            </div>
          ))}
        {!books.some((b) => b.lastPlayed) && (
          <p className="muted">Your history begins when you press play.</p>
        )}
      </section>
    </>
  );
}
