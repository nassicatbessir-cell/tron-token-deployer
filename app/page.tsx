"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateFallbackLogoMetadata,
  uploadLogoWithRetry,
} from "@/app/utils/logo-upload";
import {
  detectTronNetwork,
  getContractExplorerUrl,
  TRON_NETWORK_CONFIG,
  TronNetwork,
} from "@/app/utils/tron-network";

type DeployResult = {
  ipfsHash?: string;
  gatewayUrl?: string;
  contractAddress?: string;
  address?: string;
  explorerUrl?: string;
  metadataMessage?: string;
};

type ValidationResult = {
  name: string;
  symbol: string;
  supply: string;
};

const FEATURE_CARDS = [
  {
    title: "Source-synced artifact",
    description:
      "The deploy endpoint compiles the on-chain artifact from the current Solidity source instead of serving stale bytecode.",
  },
  {
    title: "Wallet-aware flow",
    description:
      "The UI detects TronLink, shows the active network, and keeps the deployment flow aligned with the connected wallet.",
  },
  {
    title: "Safer logo pipeline",
    description:
      "Logo uploads are validated, retried, and capped before they reach Pinata or the deployment result screen.",
  },
];

export default function Home() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("");
  const [network, setNetwork] = useState<TronNetwork | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  const [tokenName, setTokenName] = useState("MyToken");
  const [symbol, setSymbol] = useState("MTK");
  const [supply, setSupply] = useState("1000000");

  const networkLabel = useMemo(() => {
    if (!network) return "NETWORK UNKNOWN";
    return TRON_NETWORK_CONFIG[network].displayName;
  }, [network]);

  useEffect(() => {
    let active = true;

    const syncWallet = async () => {
      const tronWeb = window.tronWeb;

      if (!active) {
        return;
      }

      if (tronWeb?.defaultAddress?.base58) {
        setWallet(tronWeb.defaultAddress.base58);
      } else {
        setWallet("");
      }

      const detected = await detectTronNetwork();

      if (active) {
        setNetwork(detected);
      }
    };

    void syncWallet();
    const timer = window.setInterval(() => {
      void syncWallet();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(timer);
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

      if (!tronLink) {
        throw new Error("TronLink was not detected. Open this page inside TronLink.");
      }

      await tronLink.request({
        method: "tron_requestAccounts",
      });

      const tronWeb = window.tronWeb;

      if (!tronWeb?.defaultAddress?.base58) {
        throw new Error("Wallet connection was not completed.");
      }

      setWallet(tronWeb.defaultAddress.base58);
      setNetwork(await detectTronNetwork());
      setStatus("Wallet connected successfully.");
      return true;
    } catch (error: any) {
      setStatus(error?.message || "Wallet connection failed.");
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
      return;
    }

    setLogoPreview(URL.createObjectURL(file));
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
    const normalizedName = tokenName.trim();
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedSupply = supply.trim();

    if (!normalizedName) {
      throw new Error("Token name is required.");
    }

    if (!/^[A-Z0-9]{2,10}$/.test(normalizedSymbol)) {
      throw new Error("Symbol must be 2-10 uppercase letters or numbers.");
    }

    if (!/^\d+$/.test(normalizedSupply)) {
      throw new Error("Initial supply must be a whole number.");
    }

    if (BigInt(normalizedSupply) <= 0n) {
      throw new Error("Initial supply must be greater than zero.");
    }

    return {
      name: normalizedName,
      symbol: normalizedSymbol,
      supply: normalizedSupply,
    };
  };

  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      setResult(null);

      const validated = validateForm();
      const tronWeb = window.tronWeb;

      if (!tronWeb) {
        throw new Error("TronLink was not detected. Open this page inside TronLink.");
      }

      if (!tronWeb.defaultAddress?.base58) {
        setStatus("Connecting wallet...");
        const connected = await connectWallet();

        if (!connected || !window.tronWeb?.defaultAddress?.base58) {
          throw new Error("Please connect your TronLink wallet first.");
        }
      }

      const activeNetwork = (await detectTronNetwork()) || TronNetwork.MAINNET;
      setNetwork(activeNetwork);

      let logoMetadata = generateFallbackLogoMetadata(validated.symbol);

      if (logoFile) {
        setStatus("Uploading logo to IPFS...");
        const uploadResult = await uploadLogoWithRetry(logoFile);

        if (uploadResult.success) {
          logoMetadata = {
            ipfsHash: uploadResult.ipfsHash || "",
            cid: uploadResult.cid || uploadResult.ipfsHash || "",
            gatewayUrl: uploadResult.gatewayUrl || "",
            ipfsUrl: uploadResult.ipfsUrl || "",
            isPlaceholder: false,
          };
        } else {
          setStatus(
            uploadResult.error
              ? `${uploadResult.error} Continuing without hosted logo...`
              : "Logo upload failed. Continuing without hosted logo..."
          );
        }
      }

      setStatus("Generating contract artifact from source...");

      const artifactRes = await fetch("/api/token-artifact", {
        cache: "no-store",
      });
      const artifact = await artifactRes.json();

      if (!artifactRes.ok) {
        throw new Error(artifact.error || "Could not load contract artifact.");
      }

      if (!artifact.abi || !artifact.bytecode) {
        throw new Error("ABI or bytecode is missing.");
      }

      const bytecode = artifact.bytecode.startsWith("0x")
        ? artifact.bytecode
        : `0x${artifact.bytecode}`;

      setStatus("Waiting for TronLink confirmation...");

      const contract = await window.tronWeb.contract().new({
        abi: artifact.abi,
        bytecode,
        feeLimit: TRON_NETWORK_CONFIG[activeNetwork].feeLimit,
        callValue: 0,
        parameters: [validated.name, validated.symbol, validated.supply],
      });

      const address =
        contract?.address || contract?._address || contract?.options?.address;

      if (!address) {
        throw new Error("Deployment completed but contract address was not returned.");
      }

      let metadataMessage = "Token deployed successfully.";

      try {
        const metaRes = await fetch("/api/submit-token-meta", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contractAddress: address,
            name: validated.name,
            symbol: validated.symbol,
            decimals: 18,
            totalSupply: validated.supply,
            logoIpfsHash: logoMetadata.ipfsHash || "",
            logoCid: logoMetadata.cid || logoMetadata.ipfsHash || "",
            logoUrl: logoMetadata.isPlaceholder ? "" : logoMetadata.gatewayUrl || "",
            chain: activeNetwork,
            deployerAddress: window.tronWeb.defaultAddress.base58,
            deploymentTxHash: contract?.transaction?.txID || contract?.txID,
          }),
        });

        const metaJson = await metaRes.json().catch(() => null);

        if (metaRes.ok && metaJson?.message) {
          metadataMessage = metaJson.message;
        } else if (metaJson?.message) {
          metadataMessage = `Token deployed. Metadata submission skipped: ${metaJson.message}`;
        }
      } catch {
        metadataMessage = "Token deployed. Metadata submission was skipped.";
      }

      setResult({
        ipfsHash: logoMetadata.isPlaceholder ? "" : logoMetadata.ipfsHash || "",
        gatewayUrl: logoMetadata.isPlaceholder ? "" : logoMetadata.gatewayUrl || "",
        contractAddress: address,
        address,
        explorerUrl: getContractExplorerUrl(address, activeNetwork),
        metadataMessage,
      });

      setStatus("Deployment completed successfully.");
    } catch (error: any) {
      console.error(error);

      const message =
        error?.message || error?.response?.message || "Deployment failed.";

      setStatus(message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <main className="launchpad">
      <div className="glow glowOne" />
      <div className="glow glowTwo" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark">T</div>
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
          <div className="eyebrow">WEB3 TOKEN LAUNCHPAD</div>

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

          <div className="logoBox">
            {logoPreview ? (
              <img src={logoPreview} alt="Token logo preview" />
            ) : (
              <div className="logoPlaceholder">
                <span>+</span>
                <small>TOKEN LOGO</small>
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

          <label className="upload">
            <span>{logoFile ? logoFile.name : "SELECT TOKEN LOGO"}</span>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
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

          <div className="status">
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
            label="IPFS CID"
            value={result.ipfsHash || "No logo uploaded"}
            onCopy={() => copy(result.ipfsHash || "")}
          />

          <InfoRow
            label="IPFS GATEWAY"
            value={result.gatewayUrl || "—"}
            onCopy={() => copy(result.gatewayUrl || "")}
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
        </section>
      )}

      <footer>
        <span>TRON LAUNCHPAD</span>
        <span>TRC20 • IPFS • TRONLINK</span>
      </footer>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #05060a;
        }

        button,
        input {
          font: inherit;
        }

        button:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .launchpad {
          min-height: 100vh;
          color: #fff;
          background:
            radial-gradient(circle at 80% 10%, rgba(24, 91, 255, 0.18), transparent 32%),
            radial-gradient(circle at 15% 40%, rgba(255, 36, 77, 0.12), transparent 32%),
            #05060a;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          padding: 0 7vw;
          overflow: hidden;
          position: relative;
        }

        .glow {
          position: absolute;
          width: 420px;
          height: 420px;
          filter: blur(100px);
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.13;
        }

        .glowOne {
          background: #ff164e;
          top: 350px;
          left: -250px;
        }

        .glowTwo {
          background: #2563ff;
          top: -180px;
          right: -200px;
        }

        .topbar {
          height: 92px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
          z-index: 2;
        }

        .brand,
        .topActions,
        .heroStats,
        .cardHeader,
        .sectionTitle,
        .resultTitle {
          display: flex;
          align-items: center;
        }

        .brand {
          gap: 13px;
        }

        .brandMark {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          font-weight: 900;
          font-size: 23px;
          background: linear-gradient(135deg, #ff174d, #ff345f);
          box-shadow: 0 0 30px rgba(255, 23, 77, 0.3);
        }

        .brand strong {
          display: block;
          letter-spacing: 0.08em;
          font-size: 14px;
        }

        .brand span {
          display: block;
          color: #697085;
          font-size: 9px;
          letter-spacing: 0.18em;
          margin-top: 4px;
        }

        .topActions {
          gap: 12px;
        }

        .network,
        .wallet {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.035);
          color: #aeb6ca;
          border-radius: 11px;
          padding: 11px 14px;
          font-size: 10px;
          letter-spacing: 0.1em;
        }

        .wallet {
          color: white;
          cursor: pointer;
          border-color: rgba(255, 35, 78, 0.4);
          background: rgba(255, 35, 78, 0.08);
        }

        .wallet:hover:not(:disabled) {
          background: rgba(255, 35, 78, 0.16);
        }

        .wallet.connected {
          border-color: rgba(45, 209, 125, 0.4);
          color: #5ee7a3;
        }

        .dot,
        .live span,
        .status span {
          width: 7px;
          height: 7px;
          display: inline-block;
          border-radius: 50%;
          background: #37df88;
          box-shadow: 0 0 10px #37df88;
          margin-right: 7px;
        }

        .hero {
          min-height: 650px;
          display: grid;
          grid-template-columns: 1fr 430px;
          align-items: center;
          gap: 9vw;
          position: relative;
          z-index: 1;
        }

        .eyebrow,
        .miniLabel {
          color: #ff315e;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
        }

        h1 {
          font-size: clamp(55px, 7vw, 105px);
          line-height: 0.87;
          letter-spacing: -0.07em;
          margin: 18px 0 30px;
          font-weight: 900;
        }

        h1 span {
          color: transparent;
          -webkit-text-stroke: 1px #fff;
        }

        .heroText p {
          color: #8d96aa;
          max-width: 560px;
          line-height: 1.8;
          font-size: 14px;
        }

        .heroStats {
          gap: 35px;
          margin-top: 45px;
        }

        .heroStats div {
          padding-right: 35px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }

        .heroStats b {
          display: block;
          font-size: 15px;
        }

        .heroStats small {
          color: #666f83;
          font-size: 8px;
          letter-spacing: 0.15em;
        }

        .launchCard,
        .resultPanel {
          background: rgba(10, 12, 20, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 22px;
          padding: 25px;
          box-shadow: 0 25px 90px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(20px);
        }

        .launchCard {
          border-color: rgba(255, 38, 78, 0.25);
        }

        .cardHeader {
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .cardHeader h2 {
          margin: 7px 0 0;
          font-size: 23px;
        }

        .live {
          font-size: 9px;
          color: #51e69a;
        }

        .logoBox {
          height: 125px;
          border-radius: 16px;
          border: 1px dashed rgba(255, 255, 255, 0.13);
          display: grid;
          place-items: center;
          margin-bottom: 18px;
          background: radial-gradient(circle, #171c2c 0, #0a0c13 65%);
          overflow: hidden;
        }

        .logoBox img {
          width: 92px;
          height: 92px;
          object-fit: cover;
          border-radius: 20px;
          box-shadow: 0 0 35px rgba(255, 35, 77, 0.25);
        }

        .logoPlaceholder {
          text-align: center;
          color: #596174;
        }

        .logoPlaceholder span {
          display: block;
          font-size: 38px;
          font-weight: 200;
        }

        .logoPlaceholder small {
          font-size: 8px;
          letter-spacing: 0.2em;
        }

        label {
          display: block;
          color: #70798d;
          font-size: 8px;
          letter-spacing: 0.16em;
          font-weight: 800;
          margin-bottom: 15px;
        }

        input {
          display: block;
          width: 100%;
          margin-top: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #080a10;
          border-radius: 10px;
          padding: 12px;
          color: white;
          outline: none;
        }

        input:focus {
          border-color: rgba(255, 38, 78, 0.65);
          box-shadow: 0 0 0 3px rgba(255, 38, 78, 0.08);
        }

        .twoColumns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .upload {
          border: 1px dashed rgba(255, 255, 255, 0.13);
          padding: 14px;
          border-radius: 10px;
          cursor: pointer;
          color: #aab2c3;
        }

        .upload input {
          display: none;
        }

        .deployButton,
        .scanButton {
          width: 100%;
          border: 0;
          padding: 15px;
          border-radius: 11px;
          cursor: pointer;
          font-weight: 900;
          letter-spacing: 0.12em;
          color: white;
          background: linear-gradient(100deg, #ff174d, #b51fff, #246bff);
          box-shadow: 0 15px 40px rgba(255, 24, 80, 0.18);
        }

        .deployButton span {
          float: right;
        }

        .deployButton:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.12);
        }

        .status {
          margin-top: 15px;
          text-align: center;
          min-height: 18px;
          color: #697286;
          font-size: 9px;
          line-height: 1.6;
        }

        .projects {
          padding: 55px 0 80px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          position: relative;
          z-index: 1;
        }

        .sectionTitle {
          justify-content: space-between;
          margin-bottom: 25px;
        }

        .sectionTitle h2 {
          margin: 8px 0 0;
          font-size: 30px;
        }

        .projectCount {
          color: #687084;
          font-size: 9px;
          letter-spacing: 0.15em;
        }

        .projectGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
        }

        .project {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          padding: 20px;
          border-radius: 17px;
          transition: 0.2s;
        }

        .project:hover {
          border-color: rgba(255, 38, 78, 0.35);
          transform: translateY(-3px);
        }

        .projectLogo {
          width: 44px;
          height: 44px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #ff174d, #394cff);
          font-weight: 900;
        }

        .project h3 {
          margin: 20px 0 5px;
        }

        .project p {
          color: #6e778a;
          font-size: 11px;
          line-height: 1.7;
          min-height: 72px;
        }

        .bar {
          height: 4px;
          background: #171b27;
          border-radius: 10px;
          overflow: hidden;
          margin-top: 18px;
        }

        .bar div {
          height: 100%;
          background: linear-gradient(90deg, #ff174d, #5b67ff);
        }

        .progress {
          margin-top: 8px;
          color: #737d91;
          font-size: 9px;
        }

        .resultPanel {
          margin-bottom: 70px;
          border-color: rgba(48, 224, 140, 0.25);
        }

        .resultTitle {
          gap: 14px;
          margin-bottom: 25px;
        }

        .successIcon {
          width: 45px;
          height: 45px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #42e596;
          background: rgba(66, 229, 150, 0.08);
          border: 1px solid rgba(66, 229, 150, 0.25);
        }

        .resultTitle h2 {
          margin: 7px 0 0;
          font-size: 21px;
        }

        .infoRow {
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          padding: 15px 0;
        }

        .infoLabel {
          color: #697287;
          font-size: 8px;
          letter-spacing: 0.15em;
        }

        .infoValue {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-top: 7px;
          font-family: monospace;
          color: #e5e9f2;
          font-size: 12px;
          word-break: break-all;
        }

        .copy {
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: transparent;
          color: #9da6b8;
          padding: 7px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 9px;
        }

        .scanButton {
          display: block;
          text-align: center;
          text-decoration: none;
          margin-top: 20px;
          font-size: 10px;
        }

        .metaMessage {
          color: #8d96aa;
          font-size: 12px;
          line-height: 1.7;
          margin: 18px 0 0;
        }

        footer {
          padding: 25px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          color: #596174;
          display: flex;
          justify-content: space-between;
          font-size: 8px;
          letter-spacing: 0.16em;
        }

        @media (max-width: 900px) {
          .launchpad {
            padding: 0 20px;
          }

          .hero {
            grid-template-columns: 1fr;
            padding: 65px 0;
          }

          .projectGrid {
            grid-template-columns: 1fr;
          }

          .topbar {
            height: auto;
            padding: 18px 0;
            gap: 15px;
            flex-direction: column;
            align-items: flex-start;
          }

          .network {
            display: none;
          }

          h1 {
            font-size: 62px;
          }
        }
      `}</style>
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
