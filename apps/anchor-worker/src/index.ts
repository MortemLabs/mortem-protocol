// The anchor worker entrypoint starts the pending trace polling loop. The worker module stays
// importable so tests can exercise batch preparation without starting an endless process.
import { startAnchorWorker } from "./worker.js"

startAnchorWorker()
