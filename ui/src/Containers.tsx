import type { Container } from "./types";

interface Props {
  containers: Container[];
  onAction: (url: string) => void;
  onRefresh: () => void;
}

export default function Containers({ containers, onAction, onRefresh }: Props) {
  return (
    <section>
      <h2>
        Container
        <button className="right" onClick={onRefresh}>
          Aktualisieren
        </button>
      </h2>
      {containers.map((c) => {
        const running = c.state === "running";
        const toggle = running
          ? "stop"
          : c.state === "not created"
            ? "up"
            : "start";
        const act = (action: string) => () =>
          onAction(`/api/containers/${c.name}/${action}`);
        return (
          <div className="row" key={c.name}>
            <span className={`dot ${c.state}`} title={c.state} />
            <div className="grow">
              <div className="name">{c.name}</div>
              <div className="desc">{c.status || c.state}</div>
            </div>
            <button onClick={act(toggle)}>{running ? "Stop" : "Start"}</button>
            <button onClick={act("restart")}>Restart</button>
            <button onClick={act("logs")}>Logs</button>
          </div>
        );
      })}
    </section>
  );
}
