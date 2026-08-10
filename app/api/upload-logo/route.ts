import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    // Accept both field names for compatibility.
    const file = formData.get("file") ?? formData.get("logo");

    if (
      !file ||
      typeof (file as any).arrayBuffer !== "function" ||
      typeof (file as any).name !== "string"
    ) {
      return NextResponse.json(
        {
          error: "فایل لوگو دریافت نشد.",
          hint: "نام فیلد باید file یا logo باشد.",
        },
        { status: 400 }
      );
    }

    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return NextResponse.json(
        {
          error: "PINATA_JWT تنظیم نشده است.",
        },
        { status: 500 }
      );
    }

    const filename = (file as any).name || "token-logo.png";

    const pinataForm = new FormData();

    pinataForm.append(
      "file",
      file as any,
      filename
    );

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: pinataForm,
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Pinata error:", data);

      return NextResponse.json(
        {
          error: "آپلود لوگو در IPFS ناموفق بود.",
          details: data,
        },
        { status: response.status || 500 }
      );
    }

    const ipfsHash = data?.IpfsHash;

    if (!ipfsHash) {
      return NextResponse.json(
        {
          error: "Pinata پاسخ معتبر برای CID برنگرداند.",
          details: data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      ipfsHash,
      cid: ipfsHash,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      ipfsUrl: `ipfs://${ipfsHash}`,
      filename,
    });
  } catch (error: any) {
    console.error("Logo upload error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "خطا هنگام آپلود لوگو.",
      },
      { status: 500 }
    );
  }
}
