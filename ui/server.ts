#!/usr/bin/env node
// Lokale Management-UI für Makefile-Targets und Docker-Compose-Services.
// Backend ohne Abhängigkeiten (Node >= 18); liefert das gebaute React-Frontend aus dist/ aus.
// Start: `make ui`.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
// Im Container zeigt PROJECT_ROOT auf das (unter identischem Pfad gemountete) Projektverzeichnis.
const ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, "..");
// Lokal bewusst nur loopback (die UI führt Shell-Kommandos aus). Im Container 0.0.0.0, der Port
// wird dort nur an 127.0.0.1 des Hosts veröffentlicht.
const HOST = process.env.UI_HOST || "127.0.0.1";
const PORT = Number(process.env.UI_PORT) || 81;
const ENV_FILE = path.join("docker", ".env");
type Cmd = [string, string[]];
const ACTIONS: Record<string, string[]> = {
  start: ["start"],
  stop: ["stop"],
  restart: ["restart"],
  up: ["up", "-d"],
  logs: ["logs", "--tail", "200", "-f"],
};
const MAX_BUFFER = 500; // Zeilen pro Job

const compose = (...args: string[]): Cmd => [
  "docker",
  [
    "compose",
    ...(fs.existsSync(path.join(ROOT, ENV_FILE))
      ? ["--env-file", ENV_FILE]
      : []),
    ...args,
  ],
];

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(
      cmd,
      args,
      { cwd: ROOT, maxBuffer: 8 << 20 },
      (err, out, errOut) =>
        err ? reject(new Error((errOut || err.message).trim())) : resolve(out),
    ),
  );

// Makefile-Targets samt Kommentar direkt darüber; .PHONY und Variablen werden ignoriert.
interface Target {
  name: string;
  description: string;
}

function makeTargets(): Target[] {
  const lines = fs
    .readFileSync(path.join(ROOT, "Makefile"), "utf8")
    .split("\n");
  const targets: Target[] = [];
  let doc: string[] = [];
  for (const line of lines) {
    if (/^#/.test(line)) {
      doc.push(line.replace(/^#+\s?/, ""));
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):(?!=)/);
    if (m) targets.push({ name: m[1], description: doc.join(" ").trim() });
    doc = [];
  }
  return targets;
}

interface Service {
  name: string;
  state: string;
  status: string;
  health: string;
}
interface PsEntry {
  Service: string;
  State: string;
  Status: string;
  Health?: string;
}

async function containers(): Promise<Service[]> {
  const services = (await run(...compose("config", "--services")))
    .split("\n")
    .filter(Boolean);
  let ps: PsEntry[] = [];
  try {
    const out = await run(...compose("ps", "-a", "--format", "json"));
    // Compose v2 liefert je nach Version ein JSON-Array oder eine Zeile pro Container.
    ps = out.trim().startsWith("[")
      ? JSON.parse(out)
      : out
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
  } catch {
    /* Docker nicht erreichbar: Services trotzdem listen */
  }
  const byService = Object.fromEntries(ps.map((c) => [c.Service, c]));
  return services.map((name) => {
    const c = byService[name];
    return {
      name,
      state: c ? c.State : "not created",
      status: c ? c.Status : "",
      health: (c && c.Health) || "",
    };
  });
}

// ---- Jobs (laufende/abgeschlossene Prozesse mit gepuffertem Output) ----
interface Job {
  id: number;
  label: string;
  lines: string[];
  clients: Set<ServerResponse>;
  done: boolean;
  code: number | null;
  child: ChildProcess;
}
const jobs = new Map<number, Job>();
let nextId = 1;

function startJob(label: string, [cmd, args]: Cmd): Job {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, TERM: "dumb" },
  });
  const job: Job = {
    id: nextId++,
    label,
    lines: [],
    clients: new Set(),
    done: false,
    code: null,
    child,
  };
  const push = (chunk: Buffer | string) => {
    for (const l of chunk.toString().split("\n"))
      if (l) {
        job.lines.push(l);
        if (job.lines.length > MAX_BUFFER) job.lines.shift();
        for (const res of job.clients)
          res.write(`data: ${JSON.stringify(l)}\n\n`);
      }
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("error", (e) => push(`Fehler: ${e.message}`));
  child.on("close", (code) => {
    job.done = true;
    job.code = code;
    for (const res of job.clients) {
      res.write(`event: done\ndata: ${code}\n\n`);
      res.end();
    }
    job.clients.clear();
    if (jobs.size > 50)
      for (const [id, j] of jobs)
        if (j.done) {
          jobs.delete(id);
          break;
        }
  });
  jobs.set(job.id, job);
  return job;
}

const publicJob = (j: Job) => ({
  id: j.id,
  label: j.label,
  done: j.done,
  code: j.code,
});

// ---- HTTP ----
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean).slice(1); // ohne "api"
  const [a, b, c] = parts;
  const action = c ? ACTIONS[c] : undefined;

  if (req.method === "GET" && a === "targets")
    return json(res, 200, makeTargets());
  if (req.method === "GET" && a === "containers")
    return json(res, 200, await containers());
  if (req.method === "GET" && a === "jobs" && !b)
    return json(res, 200, [...jobs.values()].map(publicJob));

  if (req.method === "POST" && a === "make" && b) {
    if (!makeTargets().some((t) => t.name === b))
      return json(res, 404, { error: "Unbekanntes Target" });
    return json(res, 200, publicJob(startJob(`make ${b}`, ["make", [b]])));
  }
  if (req.method === "POST" && a === "containers" && b && c) {
    if (!action) return json(res, 400, { error: "Unbekannte Aktion" });
    if (!(await containers()).some((s) => s.name === b))
      return json(res, 404, { error: "Unbekannter Service" });
    return json(
      res,
      200,
      publicJob(startJob(`${c} ${b}`, compose(...action, b))),
    );
  }
  if (a === "jobs" && b) {
    const job = jobs.get(Number(b));
    if (!job) return json(res, 404, { error: "Job nicht gefunden" });
    if (req.method === "DELETE") {
      if (!job.done) job.child.kill();
      return json(res, 200, publicJob(job));
    }
    if (req.method === "GET" && c === "stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      for (const l of job.lines) res.write(`data: ${JSON.stringify(l)}\n\n`);
      if (job.done) {
        res.write(`event: done\ndata: ${job.code}\n\n`);
        return res.end();
      }
      job.clients.add(res);
      req.on("close", () => job.clients.delete(res));
      return;
    }
  }
  json(res, 404, { error: "Not found" });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    // Schutz gegen DNS-Rebinding und fremde Webseiten, die localhost anpingen.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
      return json(res, 403, { error: "Host nicht erlaubt" });
    if (
      req.method !== "GET" &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return json(res, 403, { error: "Origin nicht erlaubt" });
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method === "GET") {
        const file = path.join(
          DIST,
          url.pathname === "/" ? "index.html" : path.normalize(url.pathname),
        );
        if (
          file.startsWith(DIST + path.sep) &&
          fs.existsSync(file) &&
          fs.statSync(file).isFile()
        ) {
          res.writeHead(200, {
            "content-type":
              MIME[path.extname(file)] || "application/octet-stream",
          });
          return fs.createReadStream(file).pipe(res);
        }
      }
      json(res, 404, { error: "Not found" });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  })
  .on("error", (e: NodeJS.ErrnoException) => {
    const hint =
      e.code === "EADDRINUSE"
        ? " (belegt; anderen Port per UI_PORT=<port> setzen)"
        : "";
    console.error(`Start fehlgeschlagen: ${e.message}${hint}`);
    process.exit(1);
  })
  .listen(PORT, HOST, () =>
    console.log(`Management-UI: http://localhost:${PORT}`),
  );
