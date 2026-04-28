/**
 * Anchor worker — currently decoupled from the system.
 * This service is NOT running in production and is NOT
 * connected to the ingest, server, or dashboard.
 *
 * Preserved for future use when on-chain Merkle root
 * anchoring is re-enabled. Do not import or reference
 * anything in this directory from other apps.
 *
 * To re-enable: see ANCHORING.md in this directory.
 */
import { startAnchorWorker } from "./worker.js"

startAnchorWorker()
