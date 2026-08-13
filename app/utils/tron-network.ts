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
    chainId: "0x2b6653dc",
    rpcUrl: "https://api.trongrid.io",
    explorerUrl: "https://tronscan.org",
    feeLimit: 500_000_000,
    displayName: "TRON MAINNET",
    minimumRecommendedBalanceSun: BigInt(100_000_000),
  },
  [TronNetwork.NILE_TESTNET]: {
    name: "TRON Nile Testnet",
    chainId: "0xcd8690dc",
    rpcUrl: "https://nile.trongrid.io",
    explorerUrl: "https://nile.tronscan.org",
    feeLimit: 500_000_000,
    displayName: "TRON NILE",
    minimumRecommendedBalanceSun: BigInt(100_000_000),
  },
} as const;

function normalizeProviderHost(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function addProviderHosts(hosts: Set<string>, tronWeb: TronWebLike | undefined) {
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
}

function collectProviderHosts() {
  const hosts = new Set<string>();

  if (typeof window === "undefined") {
    return [];
  }

  addProviderHosts(hosts, window.tronWeb);
  addProviderHosts(hosts, window.tronLink?.tronWeb);

  return [...hosts];
}

function detectNetworkFromHost(host: string): TronNetwork | null {
  if (!host) {
    return null;
  }

  try {
    const parsed = new URL(host.startsWith("http") ? host : `https://${host}`);
    const normalizedHost = parsed.host.toLowerCase();

    if (normalizedHost.includes("nile")) {
      return TronNetwork.NILE_TESTNET;
    }

    if (
      normalizedHost === "api.trongrid.io" ||
      normalizedHost.endsWith(".trongrid.io") ||
      normalizedHost === "tronscan.org" ||
      normalizedHost.endsWith(".tronscan.org") ||
      normalizedHost.endsWith("tronstack.io")
    ) {
      return TronNetwork.MAINNET;
    }
  } catch {
    if (host.includes("nile")) {
      return TronNetwork.NILE_TESTNET;
    }

    if (host.includes("api.trongrid.io") || host.includes("tronscan.org")) {
      return TronNetwork.MAINNET;
    }
  }

  return null;
}

/**
 * Detect the current TRON network from the injected TronWeb instance.
 * Returns null when the network cannot be determined with confidence.
 */
export async function detectTronNetwork(): Promise<TronNetwork | null> {
  try {
    const detectedNetworks = new Set<TronNetwork>();

    for (const host of collectProviderHosts()) {
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
export function isValidTronAddress(address: string, tronWeb?: TronWebLike): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  if (tronWeb?.isAddress) {
    try {
      return Boolean(tronWeb.isAddress(address));
    } catch {
      // Fall through to the local validator below.
    }
  }

  const tronAddressRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  return tronAddressRegex.test(address);
}

function normalizeSunValue(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Invalid TRX balance returned by TronLink.");
    }

    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new Error("Unexpected TRX balance response from TronLink.");
}

export async function getWalletBalanceSun(
  tronWeb: TronWebLike | undefined,
  address: string
): Promise<bigint> {
  if (!tronWeb?.trx?.getBalance) {
    throw new Error("TronLink balance API is unavailable.");
  }

  return normalizeSunValue(await tronWeb.trx.getBalance(address));
}

export function formatSunAsTrx(value: bigint | string | number): string {
  const sun = normalizeSunValue(value);
  const sign = sun < BigInt(0) ? "-" : "";
  const absolute = sun < BigInt(0) ? -sun : sun;
  const whole = absolute / BigInt(1_000_000);
  const fraction = (absolute % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");

  return fraction ? `${sign}${whole.toString()}.${fraction}` : `${sign}${whole.toString()}`;
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

export function isSupportedNetwork(
  network: TronNetwork | null,
  supportedNetworks: Set<TronNetwork>
): network is TronNetwork {
  return Boolean(network && supportedNetworks.has(network));
}
