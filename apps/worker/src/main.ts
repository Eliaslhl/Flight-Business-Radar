import { loadConfig } from "@fbr/config";
import { createLogger } from "@fbr/shared";
import { createWorkerRuntime } from "./runtime.js";

const config = loadConfig();
const logger = createLogger({
  name: "worker",
  level: config.log.level,
  pretty: config.log.pretty,
});

const runtime = createWorkerRuntime({ logger });
runtime.start();

const shutdown = (signal: string): void => {
  logger.info({ signal }, "signal d'arrêt reçu");
  void runtime.stop().then(() => process.exit(0));
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal);
  });
}

// Garde le process vivant tant qu'aucun signal n'est reçu.
setInterval(() => {
  /* keep-alive */
}, 1 << 30);
