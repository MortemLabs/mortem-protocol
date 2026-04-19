// The on-chain route hosts PDA registration, funding, agent registry, and anchor history flows.
// Wallet signing happens in the client panel so user transactions are never signed server-side.
import { OnchainPanel } from "./onchain-panel"

export default function OnchainPage() {
  return <OnchainPanel />
}
