import { useEffect, useRef, useState } from "react";
import { call } from "./api";
import type { Job } from "./types";

interface Props {
  job: Job | null;
  onDone: () => void;
  onError: (msg: string) => void;
}

export default function LogPanel({ job, onDone, onError }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!job) return;
    setLines([]);
    setRunning(true);
    const source = new EventSource(`/api/jobs/${job.id}/stream`);
    source.onmessage = (ev) =>
      setLines((l) => [...l, JSON.parse(ev.data) as string]);
    source.addEventListener("done", (ev) => {
      setLines((l) => [...l, "", `[beendet, Exit-Code ${ev.data}]`]);
      setRunning(false);
      source.close();
      onDone();
    });
    source.onerror = () => {
      setRunning(false);
      source.close();
    };
    return () => source.close();
  }, [job, onDone]);

  // Nur mitscrollen, wenn die Ansicht bereits am Ende steht.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 60)
      el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className="log-panel">
      <div className="log-head">
        <h2>{job ? `Ausgabe: ${job.label}` : "Ausgabe"}</h2>
        {running && job && (
          <button
            className="right"
            onClick={() =>
              call("DELETE", `/api/jobs/${job.id}`).catch((e: Error) =>
                onError(e.message),
              )
            }
          >
            Abbrechen
          </button>
        )}
      </div>
      <pre ref={box}>{job ? lines.join("\n") : "Noch nichts ausgeführt."}</pre>
    </section>
  );
}
