import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { contractAbi } from "@/constants";
import { contractAddress } from "@/constants";

const etherlinkTestnet = {
  id: 127823,
  name: 'Etherlink Shadownet',
  nativeCurrency: {
    decimals: 18,
    name: 'XTZ',
    symbol: 'XTZ',
  },
  rpcUrls: {
    default: { http: ['https://node.shadownet.etherlink.com'] },
    public: { http: ['https://node.shadownet.etherlink.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherlink Explorer', url: 'https://testnet.explorer.etherlink.com/' },
  },
} as const;

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { tokenId: string } }
) {
  try {
    const tokenId = parseInt(params.tokenId);

    if (isNaN(tokenId)) {
      return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
    }

    if (!contractAddress) {
      return NextResponse.json({ error: "Contract address not configured" }, { status: 500 });
    }

    const client = createPublicClient({
      chain: etherlinkTestnet,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://node.shadownet.etherlink.com"),
    });

    // Get donation events for this token
    const logs = await client.getContractEvents({
      address: contractAddress as `0x${string}`,
      abi: contractAbi,
      eventName: "DonationReceived",
      args: {
        tokenId: BigInt(tokenId),
      },
      fromBlock: BigInt(0),
      toBlock: "latest",
    });

    const donations = logs.map((log: any) => ({
      donor: log.args?.donor as string,
      amount: log.args?.amount?.toString() || "0",
      blockNumber: log.blockNumber.toString(),
      transactionHash: log.transactionHash,
    }));

    return NextResponse.json(donations);
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }
}
