import { ethers } from "hardhat";

async function main() {
  const baseUri = process.env.RECEIPT_BASE_URI || "https://cdn.oneclick.xyz/receipt/";
  const C = await ethers.getContractFactory("OneClickReceiptNFT");
  const c = await C.deploy(baseUri);
  await c.waitForDeployment();
  console.log("OneClickReceiptNFT deployed to:", await c.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
