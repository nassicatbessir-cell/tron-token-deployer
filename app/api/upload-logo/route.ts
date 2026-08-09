import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "فایلی دریافت نشد." },
        { status: 400 }
      );
    }

    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return NextResponse.json(
        { error: "PINATA_JWT در .env.local تنظیم نشده است." },
        { status: 500 }
      );
    }

    const pinataForm = new FormData();
    pinataForm.append("file", file, file.name);

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

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Pinata upload failed",
          details: data,
        },
        { status: response.status }
      );
    }

    const ipfsHash = data.IpfsHash;

    return NextResponse.json({
      success: true,
      ipfsHash,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
    });
  } catch (error) {
    console.error("Upload error:", error);

    return NextResponse.json(
      { error: "خطا هنگام آپلود لوگو." },
      { status: 500 }
    );
  }
}
