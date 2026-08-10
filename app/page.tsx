"use client";

import { useState } from "react";

type UploadResult = {
  success?: boolean;
  ipfsHash?: string;
  cid?: string;
  gatewayUrl?: string;
  ipfsUrl?: string;
  filename?: string;
  error?: string;
};

export default function Home() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [upload, setUpload] = useState<UploadResult | null>(null);

  const [tokenName, setTokenName] = useState("MyToken");
  const [tokenSymbol, setTokenSymbol] = useState("MTK");
  const [supply, setSupply] = useState("1000000");

  const [status, setStatus] = useState("آماده Deploy");
  const [deploying, setDeploying] = useState(false);
  const [contractAddress, setContractAddress] = useState("");

  const handleLogoChange = (file: File | null) => {
    setLogoFile(file);
    setUpload(null);

    if (!file) {
      setLogoPreview("");
      return;
    }

    const url = URL.createObjectURL(file);
    setLogoPreview(url);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("✅ کپی شد");
    } catch {
      setStatus("❌ کپی انجام نشد");
    }
  };

  const handleDeploy = async () => {
    if (deploying) return;

    try {
      setDeploying(true);
      setContractAddress("");
      setUpload(null);

      setStatus("🔐 در حال اتصال به TronLink...");

      const tronWeb = (window as any).tronWeb;

      if (!tronWeb) {
        throw new Error(
          "TronLink/TronWeb پیدا نشد. صفحه را داخل TronLink باز کنید."
        );
      }

      if (!tronWeb.defaultAddress?.base58) {
        throw new Error("کیف پول TronLink متصل نیست.");
      }

      /*
       * 1) Upload logo to IPFS
       */
      if (logoFile) {
        setStatus("☁️ در حال آپلود لوگو به IPFS...");

        const form = new FormData();
        form.append("file", logoFile);

        const res = await fetch("/api/upload-logo", {
          method: "POST",
          body: form,
        });

        const data: UploadResult = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error || "آپلود لوگو ناموفق بود."
          );
        }

        setUpload(data);

        setStatus(
          `✅ لوگو روی IPFS ثبت شد — CID: ${
            data.cid || data.ipfsHash || "نامشخص"
          }`
        );
      }

      /*
       * 2) Get contract artifact
       */
      setStatus("⚙️ در حال آماده‌سازی قرارداد...");

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

      /*
       * 3) Deploy TRC20
       */
      setStatus("🚀 در حال ارسال تراکنش Deploy...");

      const contract = await tronWeb.contract().new({
        abi: artifact.abi,
        bytecode,
        feeLimit: 500_000_000,
        callValue: 0,
        parameters: [
          tokenName,
          tokenSymbol,
          Number(supply),
        ],
      });

      const address =
        contract?.address ||
        contract?._address ||
        contract?.options?.address;

      if (!address) {
        throw new Error(
          "قرارداد Deploy شد ولی آدرس قرارداد دریافت نشد."
        );
      }

      setContractAddress(address);

      setStatus("🎉 Deploy با موفقیت انجام شد!");

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
    } finally {
      setDeploying(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-5xl px-5 py-10">

        {/* Header */}
        <header className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1 text-sm text-red-300">
            TRON • TRC20
          </div>

          <h1 className="text-4xl font-black tracking-tight md:text-5xl">
            TRC20 Token Deployer
          </h1>

          <p className="mt-3 max-w-2xl text-gray-400">
            Deploy توکن، آپلود لوگو روی IPFS و دریافت CID و Contract Address
            در یک محیط ساده و حرفه‌ای.
          </p>
        </header>

        {/* Status */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                deploying
                  ? "animate-pulse bg-yellow-400"
                  : status.startsWith("❌")
                  ? "bg-red-500"
                  : "bg-green-400"
              }`}
            />

            <div>
              <div className="text-xs uppercase tracking-widest text-gray-500">
                STATUS
              </div>
              <div className="mt-1 font-semibold text-gray-200">
                {status}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">

          {/* Token settings */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="mb-5 text-xl font-bold">
              🪙 Token Configuration
            </h2>

            <label className="mb-2 block text-sm text-gray-400">
              Token Name
            </label>

            <input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none transition focus:border-red-500"
              placeholder="MyToken"
            />

            <label className="mb-2 block text-sm text-gray-400">
              Symbol
            </label>

            <input
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 uppercase outline-none transition focus:border-red-500"
              placeholder="MTK"
            />

            <label className="mb-2 block text-sm text-gray-400">
              Initial Supply
            </label>

            <input
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
              type="number"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none transition focus:border-red-500"
              placeholder="1000000"
            />
          </section>

          {/* Logo */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="mb-5 text-xl font-bold">
              🖼️ Token Logo
            </h2>

            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/30 p-5 text-center transition hover:border-red-500/60">

              {logoPreview ? (
                <>
                  <img
                    src={logoPreview}
                    alt="Token logo preview"
                    className="mb-4 h-32 w-32 rounded-full border-4 border-white/10 object-cover shadow-2xl"
                  />

                  <div className="font-semibold">
                    {logoFile?.name}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    برای تغییر لوگو دوباره انتخاب کنید
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 text-5xl">🪙</div>
                  <div className="font-semibold">
                    انتخاب لوگو
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    PNG / JPG / WEBP
                  </div>
                </>
              )}

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                className="hidden"
                onChange={(e) =>
                  handleLogoChange(
                    e.target.files?.[0] || null
                  )
                }
              />
            </label>
          </section>
        </div>

        {/* Deploy */}
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="mt-6 w-full rounded-2xl bg-red-600 px-6 py-4 text-lg font-black shadow-xl shadow-red-900/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deploying
            ? "⏳ در حال انجام..."
            : "🚀 Deploy Token"}
        </button>

        {/* IPFS Result */}
        {upload?.cid && (
          <section className="mt-6 rounded-3xl border border-green-500/20 bg-green-500/[0.05] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                ☁️ IPFS Logo
              </h2>

              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-300">
                PINNED
              </span>
            </div>

            {upload.gatewayUrl && (
              <img
                src={upload.gatewayUrl}
                alt="IPFS Token Logo"
                className="mb-5 h-24 w-24 rounded-2xl border border-white/10 object-cover"
              />
            )}

            <div className="mb-3 text-xs uppercase tracking-widest text-gray-500">
              CID
            </div>

            <div className="flex gap-2">
              <code className="min-w-0 flex-1 overflow-hidden rounded-xl bg-black/40 px-4 py-3 text-sm text-green-300">
                {upload.cid}
              </code>

              <button
                onClick={() => copyText(upload.cid!)}
                className="rounded-xl border border-white/10 px-4 hover:bg-white/10"
              >
                Copy
              </button>
            </div>

            {upload.gatewayUrl && (
              <div className="mt-4 flex gap-2">
                <a
                  href={upload.gatewayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-center text-sm hover:bg-white/10"
                >
                  Open Logo
                </a>

                <button
                  onClick={() =>
                    copyText(upload.gatewayUrl!)
                  }
                  className="rounded-xl border border-white/10 px-4 hover:bg-white/10"
                >
                  Copy URL
                </button>
              </div>
            )}
          </section>
        )}

        {/* Contract Result */}
        {contractAddress && (
          <section className="mt-6 rounded-3xl border border-red-500/30 bg-red-500/[0.06] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                🎉 Deployment Successful
              </h2>

              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-300">
                DEPLOYED
              </span>
            </div>

            <div className="mb-2 text-xs uppercase tracking-widest text-gray-500">
              Contract Address
            </div>

            <div className="flex gap-2">
              <code className="min-w-0 flex-1 overflow-hidden rounded-xl bg-black/50 px-4 py-3 text-sm text-red-300">
                {contractAddress}
              </code>

              <button
                onClick={() =>
                  copyText(contractAddress)
                }
                className="rounded-xl border border-white/10 px-4 hover:bg-white/10"
              >
                Copy
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a
                href={`https://tronscan.org/#/contract/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-red-600 px-4 py-3 text-center font-bold hover:bg-red-500"
              >
                🔎 View on TronScan
              </a>

              {upload?.gatewayUrl && (
                <a
                  href={upload.gatewayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/10 px-4 py-3 text-center font-bold hover:bg-white/10"
                >
                  🖼️ View Token Logo
                </a>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-gray-600">
          TRC20 Deployment Tool • IPFS Logo Storage
        </footer>
      </div>
    </main>
  );
}
