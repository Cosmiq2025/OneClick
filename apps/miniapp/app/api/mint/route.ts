import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RPC = process.env.BASE_RPC_URL!;
const RECEIPT_NFT_ADDRESS = process.env.RECEIPT_NFT_ADDRESS!;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY!;
const ABI = ["function mintTo(address to) external returns (uint256)"];

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json();
    if (!to) {
      return NextResponse.json({ ok: false, error: "missing 'to' address" }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const signer = new ethers.Wallet(SERVER_PRIVATE_KEY, provider);
    const c = new ethers.Contract(RECEIPT_NFT_ADDRESS, ABI, signer);

    const tx = await c.mintTo(to);
    const rc = await tx.wait();
    const txHash = rc?.hash ?? tx.hash;

    return NextResponse.json({
      ok: true,
      txHash,
      explorer: `https://sepolia.basescan.org/tx/${txHash}`
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "mint failed" }, { status: 500 });
  }
}
