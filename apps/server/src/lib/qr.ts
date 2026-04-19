// QR helpers generate Solana Pay funding links for user registry PDAs. Wallets can scan the PNG
// data URL or open the Solana Pay URL directly on mobile.
import type { PdaFundingInfo } from "@mortemlabs/shared"
import QRCode from "qrcode"

const LAMPORTS_PER_SOL = 1_000_000_000

const solAmount = (lamports: number): number => lamports / LAMPORTS_PER_SOL

export const generateSolanaPayQr = async (
  address: string,
  lamports: number,
): Promise<PdaFundingInfo> => {
  const requiredSol = solAmount(lamports)
  const solanaPayUrl = `solana:${address}?amount=${requiredSol}&label=Mortem+PDA+Funding&message=Fund+your+Mortem+trace+anchor+PDA`
  const qrCodeDataUrl = await QRCode.toDataURL(solanaPayUrl, {
    color: { dark: "#000000", light: "#ffffff" },
    margin: 2,
    width: 256,
  })

  return {
    pdaAddress: address,
    qrCodeDataUrl,
    requiredLamports: lamports,
    requiredSol,
    solanaPayUrl,
  }
}
