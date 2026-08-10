"use client";

import { useState } from "react";

export default function Home() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  const handleDeploy = async () => {
    try {
      setStatus("در حال اتصال به کیف پول...");

      const tronWeb = (window as any).tronWeb;

      if (!tronWeb) {
        throw new Error("TronLink/TronWeb پیدا نشد. صفحه را داخل TronLink باز کنید.");
      }

      if (!tronWeb.defaultAddress?.base58) {
        throw new Error("کیف پول TronLink متصل نیست.");
      }

      let logoUrl = "";

      if (logoFile) {
        setStatus("در حال آپلود لوگو...");

        const logoData = new FormData();
        logoData.append("file", logoFile);

        const uploadRes = await fetch("/api/upload-logo", {
          method: "POST",
          body: logoData,
        });

        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadJson.error || "آپلود لوگو ناموفق بود.");
        }

        logoUrl =
          uploadJson.gatewayUrl ||
          uploadJson.url ||
          "";

        console.log("Logo:", logoUrl);
      }

      setStatus("در حال دریافت ABI و Bytecode...");

      const artifactRes = await fetch("/api/token-artifact", {
        cache: "no-store",
      });

      const artifact = await artifactRes.json();

      if (!artifactRes.ok) {
        throw new Error(
          artifact.error || "دریافت قرارداد ناموفق بود."
        );
      }

      if (!artifact.abi || !artifact.bytecode) {
        throw new Error("ABI یا Bytecode موجود نیست.");
      }

      const bytecode = artifact.bytecode.startsWith("0x")
        ? artifact.bytecode
        : `0x${artifact.bytecode}`;

      setStatus("در حال ارسال تراکنش Deploy...");

      const contract = await tronWeb.contract().new({
        abi: artifact.abi,
        bytecode,
        feeLimit: 500_000_000,
        callValue: 0,

        // قرارداد Solidity دقیقاً 3 پارامتر دارد:
        // tokenName, tokenSymbol, initialSupply
        parameters: [
          "MyToken",
          "MTK",
          1000000,
        ],
      });

      const address =
        contract?.address ||
        contract?._address ||
        contract?.options?.address;

      if (!address) {
        throw new Error(
          "تراکنش ارسال شد ولی آدرس قرارداد دریافت نشد."
        );
      }

      console.log("DEPLOYED CONTRACT:", address);

      setStatus(
        "✅ توکن با موفقیت Deploy شد: " + address
      );

      alert(
        "Token deployed successfully!\n\nContract:\n" +
          address
      );

    } catch (error: any) {
      console.error("DEPLOY ERROR:", error);

      const message =
        error?.message ||
        error?.response?.message ||
        error?.response?.data?.message ||
        "Deployment failed";

      setStatus("❌ " + message);
      alert("Deployment failed:\n\n" + message);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "white",
        padding: "40px",
        fontFamily: "Arial",
      }}
    >
      <h1>TRC20 Deploy</h1>

      <p>
        {status || "آماده Deploy"}
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={(e) =>
          setLogoFile(e.target.files?.[0] || null)
        }
      />

      <br />
      <br />

      <button
        onClick={handleDeploy}
        style={{
          padding: "12px 24px",
          cursor: "pointer",
        }}
      >
        Deploy Token
      </button>
    </main>
  );
}
