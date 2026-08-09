"use client";

import { useState } from "react";

const ABI = [
  {
    inputs: [
      { internalType: "string", name: "_name", type: "string" },
      { internalType: "string", name: "_symbol", type: "string" },
      { internalType: "uint256", name: "_supply", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  }
];

// ⚠️ اینجا BYTECODE کامل خودت رو بذار
const BYTECODE = "PASTE_YOUR_BYTECODE_HERE";

export default function Page() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoURL, setLogoURL] = useState("");

  // 📦 آپلود واقعی روی IPFS
  const uploadToIPFS = async () => {
    if (!logo) return alert("لوگو انتخاب کن");

    const form = new FormData();
    form.append("file", logo);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: "YOUR_API_KEY",
        pinata_secret_api_key: "YOUR_SECRET"
      },
      body: form
    });

    const data = await res.json();
    const url = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
    setLogoURL(url);

    alert("✅ آپلود شد");
  };

  // 🚀 دیپلوی واقعی روی ترون
  const deployToken = async () => {
    const tron = (window as any).tronWeb;

    if (!tron) return alert("❌ TronLink وصل نیست");

    if (!name || !symbol || !supply)
      return alert("همه فیلدها رو پر کن");

    if (!logoURL)
      return alert("اول لوگو رو آپلود کن");

    try {
      const contract = await tron.contract().new({
        abi: ABI,
        bytecode: BYTECODE,
        parameters: [
          name,
          symbol,
          parseInt(supply)
        ],
        feeLimit: 1_000_000_000,
        callValue: 0,
      });

      alert("🚀 توکن ساخته شد:\n" + contract.address);

      console.log("LOGO:", logoURL);

    } catch (err) {
      console.error(err);
      alert("❌ خطا در دیپلوی");
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        background: "rgba(255,255,255,0.05)",
        padding: 30,
        borderRadius: 20,
        backdropFilter: "blur(15px)",
        width: 400
      }}>
        <h2 style={{ textAlign: "center" }}>🚀 Tron Token Creator</h2>

        <input placeholder="Token Name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />

        <input placeholder="Symbol"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          style={inputStyle}
        />

        <input placeholder="Supply"
          value={supply}
          onChange={e => setSupply(e.target.value)}
          style={inputStyle}
        />

        <input type="file"
          onChange={e => setLogo(e.target.files?.[0] || null)}
          style={inputStyle}
        />

        <button onClick={uploadToIPFS} style={btnStyle}>
          📦 Upload Logo (IPFS)
        </button>

        <button onClick={deployToken} style={{
          ...btnStyle,
          background: "linear-gradient(90deg,#ff416c,#ff4b2b)"
        }}>
          🚀 Deploy Token
        </button>

      </div>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "none"
};

const btnStyle = {
  width: "100%",
  marginTop: 15,
  padding: 12,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  background: "#00c6ff"
}
