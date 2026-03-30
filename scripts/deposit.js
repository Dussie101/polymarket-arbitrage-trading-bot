// Deposit USDC into Polymarket exchange
const { ClobClient } = require("@polymarket/clob-client");
const { Wallet, ethers } = require("ethers");

async function deposit() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error("No PRIVATE_KEY"); process.exit(1); }
  
  const wallet = new Wallet(pk);
  console.log("Wallet:", wallet.address);
  
  // USDC contract on Polygon
  const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  
  // Polymarket CTF Exchange contract
  const ctfExchange = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
  
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-rpc.com");
  const signer = wallet.connect(provider);
  
  // Check USDC balance
  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdc = new ethers.Contract(usdcAddress, usdcAbi, signer);
  const balance = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", ethers.utils.formatUnits(balance, 6));
  
  if (balance.isZero()) {
    console.error("No USDC to deposit!");
    process.exit(1);
  }
  
  // First approve the CTF exchange to spend USDC
  const approveAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
  const usdcWithAbi = new ethers.Contract(usdcAddress, approveAbi, signer);
  
  console.log("Approving USDC spend...");
  const approveTx = await usdcWithAbi.approve(ctfExchange, balance);
  console.log("Approve tx:", approveTx.hash);
  await approveTx.wait();
  console.log("Approved!");
  
  // Now create a deposit order via the CLOB client
  const client = new ClobClient("https://clob.polymarket.com", 137, wallet);
  const creds = await client.createOrDeriveApiKey();
  console.log("API creds derived");
  
  // Check exchange balance before deposit
  try {
    const balBefore = await client.getBalanceUSDC();
    console.log("Exchange USDC before:", balBefore);
  } catch(e) {
    console.log("Could not check exchange balance (may be 0)");
  }
  
  // The CLOB client's deposit endpoint
  // Amount in USDC (6 decimals)
  const amount = ethers.utils.formatUnits(balance, 6);
  console.log("Depositing", amount, "USDC...");
  
  try {
    const result = await client.deposit({
      asset_type: "USDC",
      amount: amount.toString()
    });
    console.log("Deposit result:", JSON.stringify(result));
  } catch(e) {
    console.error("Deposit error:", e.message);
    
    // Try alternative: direct contract call
    console.log("\nTrying direct contract deposit...");
    const ctfAbi = [
      "function deposit(address token, uint256 amount) external",
      "function getCollateralBalance(address) view returns (uint256)"
    ];
    const ctf = new ethers.Contract(ctfExchange, ctfAbi, signer);
    
    const collatBefore = await ctf.getCollateralBalance(usdcAddress);
    console.log("Collateral before:", ethers.utils.formatUnits(collatBefore, 6));
    
    const depositTx = await ctf.deposit(usdcAddress, balance);
    console.log("Deposit tx:", depositTx.hash);
    await depositTx.wait();
    console.log("Deposit confirmed!");
    
    const collatAfter = await ctf.getCollateralBalance(usdcAddress);
    console.log("Collateral after:", ethers.utils.formatUnits(collatAfter, 6));
  }
}

deposit().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
