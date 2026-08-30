type TronLinkRequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

interface TronWebAddress {
  base58?: string;
  hex?: string;
}

interface TronWebNodeRef {
  host?: string;
  fullHost?: string;
}

interface TronWebProviderMap {
  fullNode?: TronWebNodeRef;
  solidityNode?: TronWebNodeRef;
  eventServer?: TronWebNodeRef;
}

interface TronContractFactory {
  new: (options: {
    abi: unknown;
    bytecode: string;
    feeLimit: number;
    callValue: number;
    parameters: [string, string, string, number];
  }) => Promise<unknown>;
}

interface TronWebLike {
  defaultAddress?: TronWebAddress;
  fullNode?: TronWebNodeRef;
  solidityNode?: TronWebNodeRef;
  eventServer?: TronWebNodeRef;
  defaultNode?: string;
  fullHost?: string;
  currentProviders?: () => TronWebProviderMap;
  isAddress?: (value: string) => boolean;
  address?: {
    fromHex: (value: string) => string;
  };
  trx?: {
    getBalance?: (address: string) => Promise<unknown>;
  };
  contract?: () => TronContractFactory;
}

interface Window {
  tronWeb?: TronWebLike;
  tronLink?: {
    tronWeb?: TronWebLike;
    request?: (args: TronLinkRequestArgs) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  };
}
