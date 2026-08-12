/**
 * TRON network utilities and constants.
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
    feeLimit: 500_000_000,
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
} as const;

function normalizeProviderHost(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function collectProviderHosts(tronWeb: any) {
  const hosts = new Set<string>();

  const addHost = (value: unknown) => {
    const host = normalizeProviderHost(value);

    if (host) {
      hosts.add(host);
    }
  };

  addHost(tronWeb?.fullNode?.host);
  addHost(tronWeb?.solidityNode?.host);
  addHost(tronWeb?.eventServer?.host);
  addHost(tronWeb?.fullNode?.fullHost);
  addHost(tronWeb?.solidityNode?.fullHost);
  addHost(tronWeb?.eventServer?.fullHost);
  addHost(tronWeb?.defaultNode);
  addHost(tronWeb?.fullHost);

  try {
    const providers = tronWeb?.currentProviders?.();
    addHost(providers?.fullNode?.host);
    addHost(providers?.solidityNode?.host);
    addHost(providers?.eventServer?.host);
  } catch {
    // Ignore provider access failures and fall back to the hosts already collected.
  }

  return [...hosts];
}

function detectNetworkFromHost(host: string): TronNetwork | null {
  if (!host) {
    return null;
  }

  if (host.includes("nile")) {
    return TronNetwork.NILE_TESTNET;
  }

  if (
    host.includes("api.trongrid.io") ||
    host.includes("tronscan.org") ||
    host.includes("tronstack.io")
  ) {
    return TronNetwork.MAINNET;
  }

  return null;
}

/**
 * Detect the current TRON network from the injected TronWeb instance.
 * Returns null when the network cannot be determined with confidence.
 */
export async function detectTronNetwork(): Promise<TronNetwork | null> {
  try {
    const tronWeb = (window as any).tronWeb;

    if (!tronWeb) {
      return null;
    }

    const detectedNetworks = new Set<TronNetwork>();

    for (const host of collectProviderHosts(tronWeb)) {
      const network = detectNetworkFromHost(host);

      if (network) {
        detectedNetworks.add(network);
      }
    }

    if (detectedNetworks.size === 1) {
      return [...detectedNetworks][0];
    }

    return null;
  } catch (error) {
    console.error("Error detecting TRON network:", error);
    return null;
  }
}

/**
 * Validate whether a value is a TRON base58 address.
 */
export function isValidTronAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  const tronAddressRegex = /^T[1-9A-HJ-NP-Z]{32}$/;
  return tronAddressRegex.test(address);
}

/**
 * Get the explorer URL for a contract.
 */
export function getContractExplorerUrl(
  contractAddress: string,
  network: TronNetwork
): string {
  const config = TRON_NETWORK_CONFIG[network];
  return `${config.explorerUrl}/#/contract/${contractAddress}/code`;
}

/**
 * Get the explorer URL for a transaction.
 */
export function getTransactionExplorerUrl(
  txHash: string,
  network: TronNetwork
): string {
  const config = TRON_NETWORK_CONFIG[network];
  return `${config.explorerUrl}/#/transaction/${txHash}`;
}

/**
 * Format SUN to TRX.
 */
export function sunToTrx(sun: string | number): string {
  const num = typeof sun === "string" ? BigInt(sun) : BigInt(sun);
  const trx = Number(num) / 1_000_000;
  return trx.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
