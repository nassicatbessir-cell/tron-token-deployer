/**
 * TRON Network utilities and constants
 */

export enum TronNetwork {
  MAINNET = "TRON_MAINNET",
  NILE_TESTNET = "TRON_NILE",
}

export const TRON_NETWORK_CONFIG = {
  [TronNetwork.MAINNET]: {
    name: "TRON Mainnet",
    chainId: "0x39",
    rpcUrl: "https://api.trongrid.io",
    explorerUrl: "https://tronscan.org",
    feeLimit: 500_000_000, // 500 TRX in sun
    displayName: "TRON MAINNET",
  },
  [TronNetwork.NILE_TESTNET]: {
    name: "TRON Nile Testnet",
    chainId: "0x00a0",
    rpcUrl: "https://nile.trongrid.io",
    explorerUrl: "https://nile.tronscan.org",
    feeLimit: 500_000_000,
    displayName: "TRON NILE",
  },
};

/**
 * Detect current TRON network from TronWeb instance
 */
export async function detectTronNetwork(): Promise<TronNetwork | null> {
  try {
    const tronWeb = (window as any).tronWeb;

    if (!tronWeb) {
      return null;
    }

    // Check if we can access network info (TRON v5.3+)
    if (tronWeb.fullNode?.host) {
      const host = tronWeb.fullNode.host;

      if (host.includes("nile")) {
        return TronNetwork.NILE_TESTNET;
      }

      if (host.includes("trongrid.io") && !host.includes("nile")) {
        return TronNetwork.MAINNET;
      }
    }

    // Fallback: try to detect by querying chain parameters
    try {
      const chainParameters = await tronWeb.trx.getChainParameters();

      if (Array.isArray(chainParameters)) {
        // TRON mainnet has different parameters than testnet
        // This is a heuristic; you may need to refine based on actual parameters
        return TronNetwork.MAINNET;
      }
    } catch {
      // Continue to next detection method
    }

    return null;
  } catch (error) {
    console.error("Error detecting TRON network:", error);
    return null;
  }
}

/**
 * Validate if address is valid TRON address
 */
export function isValidTronAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  // TRON addresses start with T and are base58 encoded, 34 characters long
  const tronAddressRegex = /^T[1-9A-HJ-NP-Z]{32}$/;
  return tronAddressRegex.test(address);
}

/**
 * Get explorer URL for contract
 */
export function getContractExplorerUrl(
  contractAddress: string,
  network: TronNetwork
): string {
  const config = TRON_NETWORK_CONFIG[network];
  return `${config.explorerUrl}/#/contract/${contractAddress}/code`;
}

/**
 * Get transaction explorer URL
 */
export function getTransactionExplorerUrl(
  txHash: string,
  network: TronNetwork
): string {
  const config = TRON_NETWORK_CONFIG[network];
  return `${config.explorerUrl}/#/transaction/${txHash}`;
}

/**
 * Format SUN to TRX
 */
export function sunToTrx(sun: string | number): string {
  const num = typeof sun === "string" ? BigInt(sun) : BigInt(sun);
  const trx = Number(num) / 1_000_000;
  return trx.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
