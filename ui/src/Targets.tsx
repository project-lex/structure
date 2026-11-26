import { useEffect, useState } from "react";
import { call } from "./api";
import type { Target } from "./types";

interface Props {
  onRun: (url: string) => void;
  onError: (msg: string) => void;
}

export default function Targets({ onRun, onError }: Props) {
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    call<Target[]>("GET", "/api/targets")
      .then(setTargets)
      .catch((e: Error) => onError(e.message));
  }, [onError]);

  return (
    <section>
      <h2>Make-Targets</h2>
      {targets.map((t) => (
        <div className="row" key={t.name}>
          <div className="grow">
            <div className="name">{t.name}</div>
            <div className="desc" title={t.description}>
              {t.description}
            </div>
          </div>
          <button
            className="primary"
            onClick={() => onRun(`/api/make/${t.name}`)}
          >
            Ausführen
          </button>
        </div>
      ))}
    </section>
  );
}
