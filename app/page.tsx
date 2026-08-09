"use client";

import { useState } from "react";

declare global {
  interface Window {
    tronLink?: any;
    tronWeb?: any;
  }
}

export default function Home() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [status, setStatus] = useState("Wallet not connected");
  const [address, setAddress] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    try {
      setStatus("Detecting TronLink...");

      for (let i = 0; i < 20; i++) {
        if ((window as any).tronLink || (window as any).tronWeb) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const tronLink = (window as any).tronLink;
      const tronWeb = (window as any).tronWeb;

      if (!tronLink && !tronWeb) {
        setStatus("Open this page inside TronLink DApp browser");
        return;
      }

      if (tronLink?.request) {
        const result = await tronLink.request({
          method: "tron_requestAccounts",
        });

        if (result?.code !== 200 && result?.code !== 0) {
          throw new Error("Wallet connection was rejected");
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const activeTronWeb = (window as any).tronWeb;
      const account = activeTronWeb?.defaultAddress?.base58;

      if (!account) {
        throw new Error("TronLink opened, but no active wallet account was found");
      }

      setAddress(account);
      setStatus(`Connected: ${account.slice(0, 7)}...${account.slice(-5)}`);
    } catch (error: any) {
      console.error(error);
      setStatus(error?.message || "Connection failed");
    }
  }

  async function deployToken() {
    if (busy) return;

    try {
      setBusy(true);
      setAddress("");
      setTxid("");

      if (!window.tronLink) {
        throw new Error("TronLink is not installed");
      }

      if (!name.trim() || !symbol.trim() || !supply.trim()) {
        throw new Error("Complete all token fields first");
      }

      if (!/^[0-9]+$/.test(supply.trim())) {
        throw new Error("Supply must contain numbers only");
      }

      setStatus("Connecting wallet...");

      await window.tronLink.request({
        method: "tron_requestAccounts",
      });

      const tronWeb = window.tronWeb;

      if (!tronWeb?.defaultAddress?.base58) {
        throw new Error("No active TronLink account");
      }

      setStatus("Loading contract...");

      const response = await fetch("/api/token-artifact", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load contract artifact");
      }

      const artifact = await response.json();

      if (!artifact.abi || !artifact.bytecode) {
        throw new Error("ABI or bytecode is missing");
      }

      setStatus("Preparing deployment...");

      const contract = await tronWeb.contract().new({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        parameters: [
          name.trim(),
          symbol.trim(),
          supply.trim(),
        ],
        feeLimit: 500_000_000,
      });

      const deployedAddress =
        contract?.address ||
        contract?._address ||
        "";

      if (deployedAddress) {
        setAddress(String(deployedAddress));
      }

      setStatus("Deployment completed");
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.message ||
          error?.response?.message ||
          "Deployment failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <div className="glow glow1" />
      <div className="glow glow2" />

      <nav className="navbar">
        <div className="brand">
          <div className="tron-orb">
            <span>◆</span>
          </div>

          <div>
            <strong>TRON</strong>
            <small>DEPLOYMENT STUDIO</small>
          </div>
        </div>

        <button
          className="walletButton"
          onClick={connectWallet}
        >
          CONNECT WALLET
        </button>
      </nav>

      <section className="hero">
        <div className="badge">
          ● TRON NETWORK
        </div>

        <h1>
          TRC20
          <span> TOKEN FACTORY</span>
        </h1>

        <p>
          Create and deploy your own TRC20 token
          directly from your connected TronLink wallet.
        </p>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <span className="eyebrow">TOKEN CONFIGURATION</span>
            <h2>Deploy New Asset</h2>
          </div>

          <div className="network">
            <i />
            TRON NETWORK
          </div>
        </div>

        <div className="grid">
          <div className="field">
            <label>TOKEN NAME</label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Token"
            />
          </div>

          <div className="field">
            <label>TOKEN SYMBOL</label>

            <input
              value={symbol}
              onChange={(e) =>
                setSymbol(e.target.value.toUpperCase())
              }
              placeholder="MTK"
            />
          </div>

          <div className="field full">
            <label>INITIAL SUPPLY</label>

            <input
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
              placeholder="1000000"
              inputMode="numeric"
            />

            <small>
              18 decimals · Supply is assigned to the
              deploying wallet
            </small>
          </div>
        </div>

        <button
          className="deploy"
          onClick={deployToken}
          disabled={busy}
        >
          {busy ? "DEPLOYING..." : "DEPLOY TRC20 TOKEN"}
        </button>

        <div className="status">
          <span className={busy ? "pulse" : ""} />
          {status}
        </div>

        {address && (
          <div className="result">
            <span>CONTRACT ADDRESS</span>
            <code>{address}</code>
          </div>
        )}

        {txid && (
          <div className="result">
            <span>TRANSACTION ID</span>
            <code>{txid}</code>
          </div>
        )}
      </section>

      <footer>
        <span>TRC20 FACTORY</span>
        <span>•</span>
        <span>TRON ECOSYSTEM</span>
        <span>•</span>
        <span>SECURE CLIENT CONNECTION</span>
      </footer>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .app {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(
              circle at 50% -10%,
              #321018 0,
              transparent 38%
            ),
            linear-gradient(
              135deg,
              #050608,
              #0a0c11 50%,
              #030405
            );
          padding: 28px;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .glow {
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          filter: blur(110px);
          opacity: .14;
          pointer-events: none;
        }

        .glow1 {
          background: #ff164f;
          top: 100px;
          left: -220px;
        }

        .glow2 {
          background: #ff174f;
          right: -250px;
          bottom: 40px;
        }

        .navbar {
          position: relative;
          z-index: 2;
          max-width: 1080px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .tron-orb {
          width: 45px;
          height: 45px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              #ff315b,
              #b90032
            );
          box-shadow:
            0 0 28px rgba(255, 20, 75, .4);
          transform: rotate(45deg);
        }

        .tron-orb span {
          transform: rotate(-45deg);
          font-size: 20px;
        }

        .brand strong {
          display: block;
          font-size: 18px;
          letter-spacing: 3px;
        }

        .brand small {
          display: block;
          margin-top: 3px;
          color: #777b86;
          font-size: 8px;
          letter-spacing: 2px;
        }

        .walletButton {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.045);
          color: white;
          border-radius: 12px;
          padding: 13px 18px;
          font-weight: 800;
          letter-spacing: 1px;
          cursor: pointer;
          transition: .2s;
        }

        .walletButton:hover {
          border-color: rgba(255,30,80,.7);
          background: rgba(255,30,80,.1);
        }

        .hero {
          position: relative;
          z-index: 1;
          max-width: 850px;
          margin: 100px auto 45px;
          text-align: center;
        }

        .badge {
          display: inline-block;
          padding: 8px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.04);
          color: #b8bbc3;
          font-size: 10px;
          letter-spacing: 2px;
        }

        .hero h1 {
          margin: 20px 0 12px;
          font-size: clamp(46px, 8vw, 86px);
          line-height: .95;
          letter-spacing: -4px;
          font-weight: 900;
        }

        .hero h1 span {
          display: block;
          color: #ff315b;
          text-shadow:
            0 0 35px rgba(255,30,80,.25);
        }

        .hero p {
          max-width: 600px;
          margin: auto;
          color: #777c88;
          line-height: 1.7;
          font-size: 15px;
        }

        .panel {
          position: relative;
          z-index: 2;
          max-width: 820px;
          margin: auto;
          padding: 30px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(13,15,20,.78);
          box-shadow:
            0 30px 100px rgba(0,0,0,.4),
            inset 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(24px);
        }

        .panelHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 28px;
        }

        .eyebrow {
          color: #666b77;
          font-size: 9px;
          letter-spacing: 2px;
        }

        .panel h2 {
          margin: 6px 0 0;
          font-size: 25px;
        }

        .network {
          padding: 9px 12px;
          border-radius: 9px;
          background: rgba(255,255,255,.04);
          color: #969aa5;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .network i {
          display: inline-block;
          width: 6px;
          height: 6px;
          margin-right: 7px;
          border-radius: 50%;
          background: #24e58a;
          box-shadow: 0 0 10px #24e58a;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        .field label {
          color: #8b909c;
          font-size: 9px;
          letter-spacing: 1.7px;
          font-weight: 800;
        }

        .field input {
          width: 100%;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(0,0,0,.27);
          color: white;
          border-radius: 13px;
          padding: 16px;
          outline: none;
          font-size: 15px;
          transition: .2s;
        }

        .field input:focus {
          border-color: rgba(255,35,85,.7);
          box-shadow:
            0 0 0 3px rgba(255,35,85,.07);
        }

        .field input::placeholder {
          color: #454852;
        }

        .field small {
          color: #555a66;
          font-size: 9px;
        }

        .deploy {
          width: 100%;
          margin-top: 28px;
          padding: 17px;
          border: 0;
          border-radius: 14px;
          color: white;
          background:
            linear-gradient(
              100deg,
              #ff174f,
              #d9003d
            );
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 1.4px;
          cursor: pointer;
          box-shadow:
            0 15px 35px rgba(255,0,60,.18);
          transition: .2s;
        }

        .deploy:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow:
            0 18px 45px rgba(255,0,60,.28);
        }

        .deploy:disabled {
          opacity: .55;
          cursor: wait;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 18px;
          padding: 13px;
          border-radius: 11px;
          background: rgba(255,255,255,.025);
          color: #747984;
          font-size: 11px;
        }

        .status > span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #666b75;
        }

        .status > .pulse {
          background: #ff315b;
          box-shadow: 0 0 12px #ff315b;
        }

        .result {
          margin-top: 12px;
          padding: 15px;
          border-radius: 12px;
          background: rgba(0,0,0,.25);
          border: 1px solid rgba(255,255,255,.06);
        }

        .result span {
          display: block;
          margin-bottom: 8px;
          color: #656a75;
          font-size: 8px;
          letter-spacing: 1.5px;
        }

        .result code {
          color: #ff5677;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        footer {
          position: relative;
          z-index: 1;
          max-width: 820px;
          margin: 28px auto 0;
          display: flex;
          justify-content: center;
          gap: 12px;
          color: #3f434d;
          font-size: 8px;
          letter-spacing: 1.5px;
        }

        @media (max-width: 650px) {
          .app {
            padding: 20px;
          }

          .hero {
            margin-top: 70px;
          }

          .hero h1 {
            font-size: 52px;
          }

          .panel {
            padding: 22px;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .field.full {
            grid-column: auto;
          }

          .panelHeader {
            align-items: flex-start;
            flex-direction: column;
          }

          footer {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </main>
  );
}
