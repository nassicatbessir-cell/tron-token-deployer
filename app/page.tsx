"use client";

import { useState } from "react";

export default function Home() {
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const handleDeploy = async () => {
    try {
      let logoUrl = "";

      if (logoFile) {
        const logoData = new FormData();
        logoData.append("file", logoFile); // ✅ FIXED

        const uploadRes = await fetch("/api/upload-logo", {
          method: "POST",
          body: logoData,
        });

        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadJson.error || "Upload failed");
        }

        logoUrl = uploadJson.url;
      }

      const artifactRes = await fetch("/api/token-artifact");
      const artifact = await artifactRes.json();

      if (!artifactRes.ok) {
        throw new Error(artifact.error);
      }

      const { abi, bytecode } = artifact;

      if (!(window as any).tronWeb) {
        alert("TronLink not found");
        return;
      }

      const tronWeb = (window as any).tronWeb;

      const contract = await tronWeb.contract().new({
        abi,
        bytecode: bytecode.startsWith("0x")
          ? bytecode
          : `0x${bytecode}`,
        feeLimit: 100_000_000,
        callValue: 0,
        parameters: [
          "MyToken",
          "MTK",
          18,
          tronWeb.toSun(1000000),
        ],
      });

      console.log("DEPLOYED:", contract.address);
      alert("Token deployed: " + contract.address);

    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <main style={{ padding: 20 }}>
      <h1>TRC20 Deploy</h1>

      <input
        type="file"
        onChange={(e) =>
          setLogoFile(e.target.files?.[0] || null)
        }
      />

      <button onClick={handleDeploy}>
        Deploy Token
      </button>
    </main>
  );
}
