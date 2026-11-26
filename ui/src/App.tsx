import { useCallback, useEffect, useState } from "react";
import { call } from "./api";
import type { Container, Job } from "./types";
import Targets from "./Targets";
import Containers from "./Containers";
import LogPanel from "./LogPanel";

export default function App() {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [containers, setContainers] = useState<Container[]>([]);

  const loadContainers = useCallback(
    () =>
      call<Container[]>("GET", "/api/containers")
        .then(setContainers)
        .catch((e: Error) => setError(e.message)),
    [],
  );

  useEffect(() => {
    loadContainers();
    const t = setInterval(loadContainers, 10000);
    return () => clearInterval(t);
  }, [loadContainers]);

  const start = (url: string) =>
    call<Job>("POST", url)
      .then((j) => {
        setError("");
        setJob(j);
      })
      .catch((e: Error) => setError(e.message));

  return (
    <>
      <header>Structure Management</header>
      {error && <div className="error">{error}</div>}
      <main>
        <Targets onRun={start} onError={setError} />
        <Containers
          containers={containers}
          onAction={start}
          onRefresh={loadContainers}
        />
        <LogPanel job={job} onDone={loadContainers} onError={setError} />
      </main>
    </>
  );
}
