import { ethers } from "hardhat";
async function main() {
  console.log("Deploying OneClickReceiptNFT to Base Sepolia…");
  const F = await ethers.getContractFactory("OneClickReceiptNFT");
  const c = await F.deploy("ipfs://placeholder/");
  await c.waitForDeployment();
  console.log("ReceiptNFT:", await c.getAddress());
}
main().catch((e)=>{ console.error(e); process.exit(1); });
