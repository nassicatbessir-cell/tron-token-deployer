"use client";

import "./launchpad.css";

import { useEffect, useMemo, useState } from "react";
import { uploadLogoWithRetry } from "@/app/utils/logo-upload";
import {
  detectTronNetwork,
  formatSunAsTrx,
  getContractExplorerUrl,
  getTransactionExplorerUrl,
  getWalletBalanceSun,
  isSupportedNetwork,
  isValidTronAddress,
  TRON_NETWORK_CONFIG,
  TronNetwork,
} from "@/app/utils/tron-network";

type DeployResult = {
  cid?: string;
  gatewayUrl?: string;
  contractAddress?: string;
  address?: string;
  explorerUrl?: string;
  txId?: string;
  txExplorerUrl?: string;
  metadataMessage?: string;
  totalSupplyBaseUnits?: string;
};

type ValidationResult = {
  name: string;
  symbol: string;
  supply: string;
  decimals: number;
  description: string;
  website: string;
  telegram: string;
  twitter: string;
};

type ArtifactResponse = {
  abi?: unknown;
  bytecode?: string;
  constructorAbi?: {
    type?: string;
    inputs?: Array<{ type?: string }>;
  };
  error?: string;
};

const FEATURE_CARDS = [
  {
    title: "Network-safe deploy flow",
    description:
      "Deployment now stops on unknown or unsupported TRON networks instead of guessing a chain.",
  },
  {
    title: "Strict IPFS upload validation",
    description:
      "Logo uploads sanitize Unicode filenames, validate MIME and size, and stop the flow on upload failure.",
  },
  {
    title: "Explicit deployment states",
    description:
      "Wallet, artifact, metadata, transaction, and explorer outcomes are surfaced without silent fallbacks.",
  },
];

const SUPPORTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TOKEN_DECIMALS = 6n;
const DEFAULT_MAX_LOGO_SIZE_MB = 5;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_CONTRACT_SUPPLY = MAX_UINT256 / 10n ** TOKEN_DECIMALS;
const configuredMaxLogoSizeMb = Number.parseInt(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || `${DEFAULT_MAX_LOGO_SIZE_MB}`,
  10
);
const MAX_LOGO_SIZE_MB =
  Number.isFinite(configuredMaxLogoSizeMb) && configuredMaxLogoSizeMb > 0
    ? configuredMaxLogoSizeMb
    : DEFAULT_MAX_LOGO_SIZE_MB;
const SUPPORTED_NETWORKS = new Set(
  (process.env.NEXT_PUBLIC_SUPPORTED_NETWORKS || "mainnet,nile")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .flatMap((value) => {
      if (value === "mainnet") {
        return [TronNetwork.MAINNET];
      }

      if (value === "nile") {
        return [TronNetwork.NILE_TESTNET];
      }

      return [];
    })
);

function validateOptionalHttpsUrl(value: string, label: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return "";
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${label} must use https.`);
  }

  return parsedUrl.toString();
}

function normalizeContractAddress(
  tronWeb: { address?: { fromHex: (value: string) => string } } | undefined,
  value: string | undefined
) {
  if (!value) {
    return "";
  }

  if (value.startsWith("T")) {
    return value;
  }

  try {
    return tronWeb?.address?.fromHex(value) || value;
  } catch {
    return value;
  }
}

function expandTokenAmountToBaseUnits(amount: string, decimals: bigint) {
  return (BigInt(amount) * 10n ** decimals).toString();
}

function isExpectedConstructor(artifact: ArtifactResponse) {
  const inputTypes = Array.isArray(artifact.constructorAbi?.inputs)
    ? artifact.constructorAbi.inputs.map((input) => input?.type)
    : [];

  return (
    inputTypes.length === 4 &&
    inputTypes[0] === "string" &&
    inputTypes[1] === "string" &&
    inputTypes[2] === "uint256" &&
    inputTypes[3] === "uint8"
  );
}

function mapDeployError(error: unknown) {
  const err = error as { message?: string; response?: { message?: string } };
  const message =
    typeof err?.message === "string"
      ? err.message
      : typeof err?.response?.message === "string"
        ? err.response.message
        : "Deployment failed.";

  if (/rejected|denied|cancel/i.test(message)) {
    return "TronLink rejected the transaction request.";
  }

  if (/Failed to fetch/i.test(message)) {
    return "Artifact or metadata request failed before the server responded.";
  }

  if (/PINATA_JWT/i.test(message)) {
    return "Logo upload failed: PINATA_JWT is not configured on the server.";
  }

  return message;
}

function isErrorStatus(message: string) {
  if (!message) return false;
  return /failed|error|not detected|insufficient|invalid|required|disabled|rejected|denied|timeout|could not|missing|not supported|not configured/i.test(
    message
  );
}

function isSuccessStatus(message: string) {
  if (!message) return false;
  return /(connected|completed successfully|copied|ready for deployment)/i.test(message);
}

export default function Home() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("");
  const [network, setNetwork] = useState<TronNetwork | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [tronLinkDetected, setTronLinkDetected] = useState(false);

  const [tokenName, setTokenName] = useState("MyToken");
  const [symbol, setSymbol] = useState("MTK");
  const [supply, setSupply] = useState("1000000");
  const [decimals, setDecimals] = useState("6");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");

  const networkLabel = useMemo(() => {
    if (!network) {
      return wallet ? "NETWORK UNAVAILABLE" : "NETWORK UNKNOWN";
    }

    return TRON_NETWORK_CONFIG[network].displayName;
  }, [network, wallet]);

  useEffect(() => {
    let active = true;

    const syncWallet = async () => {
      const tronLink = window.tronLink;
      const tronWeb = window.tronWeb;
      const hasTronLink = Boolean(tronLink?.request || tronWeb);

      if (!active) {
        return;
      }

      setTronLinkDetected(hasTronLink);

      const address = tronWeb?.defaultAddress?.base58 || "";

      if (address && isValidTronAddress(address, tronWeb)) {
        setWallet(address);
      } else {
        setWallet("");
      }

      const detected = await detectTronNetwork();

      if (active) {
        setNetwork(detected);
      }
    };

    const handleAccountsChanged = async () => {
      if (!active) {
        return;
      }

      setStatus("Wallet account changed. Verifying the active TronLink account...");

      await syncWallet();

      if (active && window.tronWeb?.defaultAddress?.base58) {
        setStatus("Wallet account updated successfully.");
      }
    };

    const handleChainChanged = async () => {
      if (!active) {
        return;
      }

      setStatus("TRON network changed. Verifying the active network...");

      await syncWallet();

      if (active) {
        const detected = await detectTronNetwork();

        if (detected) {
          setStatus(
            `Network changed to ${TRON_NETWORK_CONFIG[detected].displayName}.`
          );
        } else {
          setStatus("Network changed, but the active TRON network could not be verified.");
        }
      }
    };

    const handleDisconnect = () => {
      if (!active) {
        return;
      }

      setWallet("");
      setNetwork(null);
      setStatus("TronLink wallet disconnected.");
    };

    void syncWallet();

    window.addEventListener("accountsChanged", handleAccountsChanged);
    window.addEventListener("chainChanged", handleChainChanged);
    window.addEventListener("disconnect", handleDisconnect);

    const tronLink = window.tronLink;

    if (tronLink?.on) {
      tronLink.on("accountsChanged", handleAccountsChanged);
      tronLink.on("chainChanged", handleChainChanged);
      tronLink.on("disconnect", handleDisconnect);
    }

    return () => {
      active = false;

      window.removeEventListener("accountsChanged", handleAccountsChanged);
      window.removeEventListener("chainChanged", handleChainChanged);
      window.removeEventListener("disconnect", handleDisconnect);

      if (tronLink?.removeListener) {
        tronLink.removeListener("accountsChanged", handleAccountsChanged);
        tronLink.removeListener("chainChanged", handleChainChanged);
        tronLink.removeListener("disconnect", handleDisconnect);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      const tronLink = window.tronLink;

      if (!tronLink?.request) {
        throw new Error(
          "TronLink was not detected. On mobile, open this page inside the TronLink app browser (DApp browser). On desktop, install the TronLink extension."
        );
      }

      await tronLink.request({
        method: "tron_requestAccounts",
      });

      const tronWeb = window.tronWeb;

      if (!tronWeb?.defaultAddress?.base58) {
        throw new Error("Wallet connection was not completed. Approve the request in TronLink.");
      }

      const connectedAddress = tronWeb.defaultAddress.base58;

      if (!isValidTronAddress(connectedAddress, tronWeb)) {
        throw new Error("TronLink returned an invalid wallet address.");
      }

      const detectedNetwork = await detectTronNetwork();

      setWallet(connectedAddress);
      setNetwork(detectedNetwork);
      setTronLinkDetected(true);
      setStatus(
        detectedNetwork
          ? `Wallet connected on ${TRON_NETWORK_CONFIG[detectedNetwork].displayName}.`
          : "Wallet connected, but the TRON network could not be detected."
      );
      return true;
    } catch (error: unknown) {
      const err = error as { message?: string };
      setStatus(err?.message || "Wallet connection failed.");
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLogo = (file: File | null) => {
    if (logoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreview);
    }

    setLogoFile(file);

    if (!file) {
      setLogoPreview("");
      setStatus("Logo removed.");
      return;
    }

    if (!SUPPORTED_LOGO_TYPES.has(file.type)) {
      setLogoFile(null);
      setLogoPreview("");
      setStatus("Logo must be a PNG, JPEG, or WebP image.");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
      setLogoFile(null);
      setLogoPreview("");
      setStatus(`Logo must be ${MAX_LOGO_SIZE_MB}MB or smaller.`);
      return;
    }

    setLogoPreview(URL.createObjectURL(file));
    setStatus(`Logo selected: ${file.name}`);
  };

  const shorten = (value: string) => {
    if (!value) return "";
    return `${value.slice(0, 7)}...${value.slice(-6)}`;
  };

  const copy = async (value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setStatus("Copied to clipboard.");
  };

  const validateForm = (): ValidationResult => {
    const normalizedDecimals = Number.parseInt(decimals, 10);

    if (
      !Number.isInteger(normalizedDecimals) ||
      normalizedDecimals < 0 ||
      normalizedDecimals > 18
    ) {
      throw new Error("DECIMALS must be an integer between 0 and 18.");
    }

    const normalizedName = tokenName.trim();
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedSupply = supply.trim();

    if (!normalizedName) {
      throw new Error("Token name is required.");
    }

    if (normalizedName.length > 64) {
      throw new Error("Token name must be 64 characters or fewer.");
    }

    if (!/^[A-Z0-9]{2,10}$/.test(normalizedSymbol)) {
      throw new Error("Symbol must be 2-10 uppercase letters or numbers.");
    }

    if (!/^\d+$/.test(normalizedSupply)) {
      throw new Error("Initial supply must be a whole number.");
    }

    const normalizedSupplyBigInt = BigInt(normalizedSupply);

    if (normalizedSupplyBigInt <= 0n) {
      throw new Error("Initial supply must be greater than zero.");
    }

    const maxContractSupply =
      MAX_UINT256 / 10n ** BigInt(normalizedDecimals);

    if (normalizedSupplyBigInt > maxContractSupply) {
      throw new Error(
        `Initial supply exceeds the contract limit for ${normalizedDecimals} decimals.`
      );
    }

    if (logoFile) {
      if (!SUPPORTED_LOGO_TYPES.has(logoFile.type)) {
        throw new Error("Logo must be a PNG, JPEG, or WebP image.");
      }

      if (logoFile.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
        throw new Error(`Logo must be ${MAX_LOGO_SIZE_MB}MB or smaller.`);
      }
    }

    return {
      name: normalizedName,
      symbol: normalizedSymbol,
      supply: normalizedSupply,
      decimals: normalizedDecimals,
      description: description.trim(),
      website: validateOptionalHttpsUrl(website, "Website"),
      telegram: validateOptionalHttpsUrl(telegram, "Telegram"),
      twitter: validateOptionalHttpsUrl(twitter, "Twitter/X"),
    };
  };

  const validationMessage = useMemo(() => {
    try {
      validateForm();
      return "";
    } catch (error: unknown) {
      const err = error as { message?: string };
      return err?.message || "Token data is invalid.";
    }
  }, [tokenName, symbol, supply, description, website, telegram, twitter, logoFile]);

  const deployDisabledReason = useMemo(() => {
    if (isDeploying) {
      return "Deployment is already running.";
    }

    if (!wallet) {
      return "Connect TronLink before deploying.";
    }

    if (!network) {
      return "Open the dApp on a detected TRON network before deploying.";
    }

    if (!isSupportedNetwork(network, SUPPORTED_NETWORKS)) {
      return "The connected TRON network is not supported for deployment.";
    }

    if (validationMessage) {
      return validationMessage;
    }

    return "";
  }, [isDeploying, wallet, network, validationMessage]);

  const handleDeploy = async () => {
    if (deployDisabledReason) {
      setStatus(deployDisabledReason);
      return;
    }

    try {
      setIsDeploying(true);
      setResult(null);

      const validated = validateForm();
      const tronWeb = window.tronWeb;

      if (!tronWeb) {
        throw new Error(
          "TronLink was not detected. Open this page inside the TronLink app browser."
        );
      }

      if (!tronWeb.defaultAddress?.base58) {
        setStatus("Connecting wallet...");
        const connected = await connectWallet();

        if (!connected || !window.tronWeb?.defaultAddress?.base58) {
          throw new Error("Please connect your TronLink wallet first.");
        }
      }

      const activeWallet = window.tronWeb?.defaultAddress?.base58 || "";

      if (!isValidTronAddress(activeWallet, window.tronWeb)) {
        throw new Error("Connected wallet address is invalid.");
      }

      setStatus("Detecting active TRON network...");
      const activeNetwork = await detectTronNetwork();

      if (!activeNetwork) {
        throw new Error(
          "Could not detect the active TRON network. Open the dApp inside TronLink and try again."
        );
      }

      if (!isSupportedNetwork(activeNetwork, SUPPORTED_NETWORKS)) {
        throw new Error("Deployment is disabled on the connected TRON network.");
      }

      setNetwork(activeNetwork);

      setStatus("Checking wallet balance for deployment fees...");
      const balanceSun = await getWalletBalanceSun(window.tronWeb, activeWallet);
      const minimumBalance = TRON_NETWORK_CONFIG[activeNetwork].minimumRecommendedBalanceSun;

      if (balanceSun < minimumBalance) {
        throw new Error(
          `Insufficient TRX balance for a reliable deployment on ${TRON_NETWORK_CONFIG[activeNetwork].displayName}. ` +
            `Current balance: ${formatSunAsTrx(balanceSun)} TRX. ` +
            `Recommended minimum: ${formatSunAsTrx(minimumBalance)} TRX (covers energy/bandwidth fees).`
        );
      }

      const totalSupplyBaseUnits = expandTokenAmountToBaseUnits(validated.supply, BigInt(validated.decimals));
      let logoMetadata = {
        cid: "",
        gatewayUrl: "",
        ipfsUrl: "",
      };

      if (logoFile) {
        setStatus("Uploading logo to IPFS...");
        const uploadResult = await uploadLogoWithRetry(logoFile);

        if (!uploadResult.success || !uploadResult.cid || !uploadResult.gatewayUrl) {
          throw new Error(uploadResult.error || "Logo upload failed.");
        }

        logoMetadata = {
          cid: uploadResult.cid,
          gatewayUrl: uploadResult.gatewayUrl,
          ipfsUrl: uploadResult.ipfsUrl || `ipfs://${uploadResult.cid}`,
        };
      }

      setStatus("Creating token metadata payload...");
      const metadataPayload = {
        name: validated.name,
        symbol: validated.symbol,
        description: validated.description,
        decimals: validated.decimals,
        totalSupply: validated.supply,
        totalSupplyBaseUnits,
        logoIpfsHash: logoMetadata.cid,
        logoCid: logoMetadata.cid,
        logoUrl: logoMetadata.gatewayUrl,
        website: validated.website,
        telegram: validated.telegram,
        twitter: validated.twitter,
        chain: activeNetwork,
        deployerAddress: activeWallet,
      };

      setStatus("Fetching contract artifact...");
      const artifactRes = await fetch("/api/token-artifact", {
        cache: "no-store",
      });
      const artifact = (await artifactRes.json().catch(() => null)) as ArtifactResponse | null;

      if (!artifactRes.ok) {
        throw new Error(artifact?.error || "Artifact request failed.");
      }

      if (!artifact?.abi || !artifact?.bytecode) {
        throw new Error("ABI or bytecode is missing from the artifact response.");
      }

      if (!isExpectedConstructor(artifact)) {
        throw new Error("Artifact constructor validation failed.");
      }

      const walletBeforeDeploy = window.tronWeb?.defaultAddress?.base58 || "";
      const networkBeforeDeploy = await detectTronNetwork();

      if (walletBeforeDeploy !== activeWallet) {
        throw new Error("The connected TronLink wallet changed before deployment confirmation.");
      }

      if (networkBeforeDeploy !== activeNetwork) {
        throw new Error("The connected TRON network changed before deployment confirmation.");
      }

      const bytecode = artifact.bytecode.startsWith("0x")
        ? artifact.bytecode
        : `0x${artifact.bytecode}`;

      setStatus("Waiting for TronLink confirmation...");

      const deployedContract = await window.tronWeb?.contract?.().new({
        abi: artifact.abi,
        bytecode,
        feeLimit: TRON_NETWORK_CONFIG[activeNetwork].feeLimit,
        callValue: 0,
        parameters: [validated.name, validated.symbol, validated.supply, validated.decimals],
      });

      const deployed = deployedContract as {
        address?: string;
        _address?: string;
        options?: { address?: string };
        transaction?: { txID?: string; txId?: string };
        txID?: string;
      } | null;
      const rawAddress =
        deployed?.address || deployed?._address || deployed?.options?.address;
      const address = normalizeContractAddress(window.tronWeb, rawAddress);
      const txId =
        deployed?.transaction?.txID || deployed?.transaction?.txId || deployed?.txID || "";

      if (!address || !isValidTronAddress(address, window.tronWeb)) {
        throw new Error("Deployment completed but a valid contract address was not returned.");
      }

      setStatus("Submitting token metadata...");
      let metadataMessage = "Token deployed successfully.";

      try {
        const metaRes = await fetch("/api/submit-token-meta", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contractAddress: address,
            ...metadataPayload,
            deploymentTxHash: txId,
          }),
        });

        const metaJson = await metaRes.json().catch(() => null);

        if (!metaRes.ok) {
          metadataMessage = metaJson?.message
            ? `Token deployed. Metadata submission failed: ${metaJson.message}`
            : "Token deployed. Metadata submission failed.";
        } else {
          metadataMessage =
            metaJson?.message || "Token deployed and metadata submitted successfully.";
        }
      } catch {
        metadataMessage =
          "Token deployed. Metadata submission request failed before the server responded.";
      }

      setResult({
        cid: logoMetadata.cid,
        gatewayUrl: logoMetadata.gatewayUrl,
        contractAddress: address,
        address,
        explorerUrl: getContractExplorerUrl(address, activeNetwork),
        txId,
        txExplorerUrl: txId ? getTransactionExplorerUrl(txId, activeNetwork) : "",
        metadataMessage,
        totalSupplyBaseUnits,
      });

      setStatus("Deployment completed successfully.");
    } catch (error: unknown) {
      console.error(error);
      setStatus(mapDeployError(error));
    } finally {
      setIsDeploying(false);
    }
  };

  const statusClass = isErrorStatus(status)
    ? "status isError"
    : isSuccessStatus(status)
      ? "status isSuccess"
      : "status";

  return (
    <main className="launchpad">
      <div className="glow glowOne" />
      <div className="glow glowTwo" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark tronPulse" aria-label="TRON">
            <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
              <path d="M8 8h48L32 56 8 8Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/>
              <path d="M8 8l24 13 24-13M32 21v35M20 15l12 6 12-6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <strong>TRON LAUNCHPAD</strong>
            <span>TRC20 TOKEN DEPLOYER</span>
          </div>
        </div>

        <div className="topActions">
          <div className="network">
            <span className="dot" />
            {networkLabel}
          </div>

          {wallet ? (
            <button className="wallet connected" type="button">
              {shorten(wallet)}
            </button>
          ) : (
            <button
              className="wallet"
              type="button"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="heroText">
          <div className="heroEyebrow">
            <div className="eyebrow">WEB3 TOKEN LAUNCHPAD</div>
            <div className="terminalMini" aria-label="Live terminal">
              <span className="terminalPrompt">$</span>
              <span className="terminalText">
                deploy --network tron --token
              </span>
              <span className="terminalCursor" />
            </div>
          </div>

          <h1>
            CREATE.
            <br />
            <span>DEPLOY.</span>
            <br />
            LAUNCH.
          </h1>

          <p>
            Deploy TRC20 tokens from the current Solidity source, upload token logos to IPFS,
            and keep the launch flow aligned with the network connected in TronLink.
          </p>

          <div className="heroStats">
            <div>
              <b>TRC20</b>
              <small>STANDARD</small>
            </div>
            <div>
              <b>IPFS</b>
              <small>LOGO STORAGE</small>
            </div>
            <div>
              <b>SYNCED</b>
              <small>SOURCE + ARTIFACT</small>
            </div>
          </div>
        </div>

        <div className="launchCard">
          <div className="cardHeader">
            <div>
              <span className="miniLabel">NEW TOKEN</span>
              <h2>Launchpad</h2>
            </div>

            <div className="live">
              <span />
              READY
            </div>
          </div>

          {!tronLinkDetected && !wallet && (
            <div className="walletBanner">
              <strong>TronLink not detected</strong>
              On mobile: open this page inside the TronLink app (DApp / Browser tab).
              On desktop: install the TronLink browser extension, then refresh.
              Regular mobile browsers cannot connect a TRON wallet.
            </div>
          )}

          <div className="logoBox">
            {logoPreview ? (
              <img src={logoPreview} alt="Token logo preview" />
            ) : (
              <div className="logoPlaceholder">
                <div className="logoPulse">
                  <span>+</span>
                </div>
                <small>NO LOGO SELECTED</small>
              </div>
            )}
          </div>

          <label>
            TOKEN NAME
            <input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="MyToken"
            />
          </label>

          <div className="twoColumns">
            <label>
              SYMBOL
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="MTK"
                maxLength={10}
              />
            </label>

            <label>
              INITIAL SUPPLY
              <input
                value={supply}
                onChange={(event) => setSupply(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="1000000"
              />
            </label>
          </div>

          <div className="twoColumns">
            <label>
              DECIMALS
              <input
                type="number"
                min="0"
                max="18"
                step="1"
                value={decimals}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^\\d{0,2}$/.test(value)) {
                    setDecimals(value);
                  }
                }}
                inputMode="numeric"
              />
            </label>

            <label>
              WEBSITE
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com"
              />
            </label>
          </div>

          <div className="twoColumns">
            <label>
              TELEGRAM
              <input
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
                placeholder="https://t.me/example"
              />
            </label>

            <label>
              TWITTER / X
              <input
                value={twitter}
                onChange={(event) => setTwitter(event.target.value)}
                placeholder="https://x.com/example"
              />
            </label>
          </div>

          <label>
            DESCRIPTION
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional token description"
              maxLength={280}
            />
          </label>

          <label className={`upload${logoFile ? " hasFile" : ""}`}>
            <span>{logoFile ? `✓ ${logoFile.name}` : "SELECT TOKEN LOGO"}</span>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => handleLogo(event.target.files?.[0] || null)}
            />
          </label>

          <button
            className="deployButton"
            type="button"
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? "DEPLOYING TOKEN" : "DEPLOY TOKEN"}
            <span>↗</span>
          </button>

          {deployDisabledReason && !isDeploying && (
            <div className="hint">{deployDisabledReason}</div>
          )}

          <div className={statusClass}>
            <span />
            {status || "READY FOR DEPLOYMENT"}
          </div>
        </div>
      </section>

      <section className="projects">
        <div className="sectionTitle">
          <div>
            <span className="miniLabel">PRODUCTION READINESS</span>
            <h2>What changed</h2>
          </div>

          <span className="projectCount">3 UPGRADES</span>
        </div>

        <div className="projectGrid">
          {FEATURE_CARDS.map((card) => (
            <article className="project" key={card.title}>
              <div className="projectLogo">✓</div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <div className="bar">
                <div style={{ width: "100%" }} />
              </div>
              <div className="progress">READY</div>
            </article>
          ))}
        </div>
      </section>

      {result && (
        <section className="resultPanel">
          <div className="resultTitle">
            <span className="successIcon">✓</span>
            <div>
              <span className="miniLabel">DEPLOYMENT COMPLETE</span>
              <h2>Token successfully deployed</h2>
            </div>
          </div>

          <InfoRow
            label="CONTRACT ADDRESS"
            value={result.contractAddress || ""}
            onCopy={() => copy(result.contractAddress || "")}
          />

          <InfoRow
            label="TRANSACTION ID"
            value={result.txId || ""}
            onCopy={() => copy(result.txId || "")}
          />

          <InfoRow
            label="IPFS CID"
            value={result.cid || "No logo uploaded"}
            onCopy={() => copy(result.cid || "")}
          />

          <InfoRow
            label="IPFS GATEWAY"
            value={result.gatewayUrl || "—"}
            onCopy={() => copy(result.gatewayUrl || "")}
          />

          <InfoRow
            label="TOTAL SUPPLY BASE UNITS"
            value={result.totalSupplyBaseUnits || "—"}
            onCopy={() => copy(result.totalSupplyBaseUnits || "")}
          />

          <p className="metaMessage">{result.metadataMessage}</p>

          <a
            className="scanButton"
            href={result.explorerUrl || "#"}
            target="_blank"
            rel="noreferrer"
          >
            OPEN CONTRACT ON TRONSCAN ↗
          </a>

          {result.txExplorerUrl && (
            <a
              className="scanButton"
              href={result.txExplorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              OPEN TRANSACTION ON TRONSCAN ↗
            </a>
          )}
        </section>
      )}

      <footer>
        <span>TRON LAUNCHPAD</span>
        <span>TRC20 • IPFS • TRONLINK</span>
      </footer>
    </main>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="infoRow">
      <div className="infoLabel">{label}</div>
      <div className="infoValue">
        <span>{value || "—"}</span>
        {value && (
          <button className="copy" type="button" onClick={onCopy}>
            COPY
          </button>
        )}
      </div>
    </div>
  );
}
