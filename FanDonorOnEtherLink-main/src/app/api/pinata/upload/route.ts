import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({ error: "Missing PINATA_JWT" }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = (form.get("name") as string | null) ?? "";
  const description = (form.get("description") as string | null) ?? "";

  if (!file || !name || !description) {
    return NextResponse.json({ error: "Missing file/name/description" }, { status: 400 });
  }

  try {
    // Upload file to Pinata
    const fileForm = new FormData();
    fileForm.append("file", file);
    fileForm.append("pinataMetadata", JSON.stringify({ name: file.name }));
    fileForm.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const fileRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: fileForm,
    });

    if (!fileRes.ok) {
      const txt = await fileRes.text();
      return NextResponse.json(
        { error: `File upload failed: ${fileRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const fileJson = await fileRes.json();
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${fileJson.IpfsHash}`;

    // Upload metadata to Pinata
    const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: { name, description, image: imageUrl },
        pinataMetadata: { name: `${name}-metadata` },
      }),
    });

    if (!metaRes.ok) {
      const txt = await metaRes.text();
      return NextResponse.json(
        { error: `Metadata upload failed: ${metaRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const metaJson = await metaRes.json();
    const tokenURI = `https://gateway.pinata.cloud/ipfs/${metaJson.IpfsHash}`;

    return NextResponse.json({ tokenURI });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
