// Import Modules (ESM Syntax)
import 'dotenv/config';
import express from 'express';
import Web3 from 'web3';
import admin from 'firebase-admin';
import cors from 'cors';
import fs from 'fs/promises'; // Use promises version
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
const serviceAccount = require('./path/to/serviceAccountKey.json'); // Update the correct path
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Load ABI from abi.json
const abiPath = path.join(__dirname, 'abi.json');
const UZT_ABI = JSON.parse(await fs.readFile(abiPath, 'utf8'));

// Initialize Web3
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ALCHEMY_URL));

// Load Smart Contract
const contract = new web3.eth.Contract(UZT_ABI, process.env.CONTRACT_ADDRESS);

// Securely Load Environment Variables
const senderAddress = process.env.SENDER_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

if (!senderAddress || !privateKey || !process.env.ALCHEMY_URL) {
    console.error("❌ Missing environment variables.");
    process.exit(1);
}

// ✅ Send UZT Transaction API
app.get('/sendUZT', async (req, res) => {
    const { receiverAdd, amount, useruid } = req.query;

    if (!receiverAdd || !amount || !useruid) {
        return res.status(400).json({ error: "❌ Missing required parameters." });
    }

    try {
        console.log(`🔄 Processing transaction for user: ${useruid}`);

        // Fetch User's Token Balance from Firebase
        const userRef = db.collection('users').doc(useruid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) throw new Error("❌ User not found in database.");

        const userData = userDoc.data();
        console.log("✅ User Data:", userData);

        if (!userData.tokens || userData.tokens < amount) {
            throw new Error("❌ Insufficient UZT balance in user account.");
        }

        // Validate Ethereum Address
        if (!web3.utils.isAddress(receiverAdd)) {
            throw new Error("❌ Invalid Ethereum address.");
        }
        console.log(`✅ Receiver Address: ${receiverAdd}`);

        // Convert Amount to Wei
        const amountWei = web3.utils.toWei(amount.toString(), "ether");
        console.log(`✅ Amount in Wei: ${amountWei}`);

        // Check Sender's UZT Balance
        const senderUZTBalance = await contract.methods.balanceOf(senderAddress).call();
        console.log(`💰 Sender's UZT Balance: ${senderUZTBalance} UZT`);

        if (BigInt(senderUZTBalance) < BigInt(amountWei)) {
            throw new Error("❌ Insufficient UZT balance in sender's wallet.");
        }

        // Check ETH Balance for Gas Fees
        const gasLimit = await contract.methods.transfer(receiverAdd, amountWei).estimateGas({ from: senderAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const gasCost = BigInt(gasLimit) * BigInt(gasPrice);
        const senderETHBalance = await web3.eth.getBalance(senderAddress);

        console.log(`⛽ Gas Limit: ${gasLimit}`);
        console.log(`⚡ Gas Price: ${web3.utils.fromWei(gasPrice, "gwei")} Gwei`);
        console.log(`⛽ Estimated Gas Cost: ${web3.utils.fromWei(gasCost.toString(), "ether")} ETH`);
        console.log(`💰 Sender's Sepolia ETH Balance: ${web3.utils.fromWei(senderETHBalance, "ether")} ETH`);

        if (BigInt(senderETHBalance) < gasCost) {
            throw new Error("❌ Insufficient Sepolia ETH balance for gas fees.");
        }

        // Prepare Transaction Data
        const txData = {
            from: senderAddress,
            to: process.env.CONTRACT_ADDRESS,
            gas: gasLimit,
            gasPrice: gasPrice,
            data: contract.methods.transfer(receiverAdd, amountWei).encodeABI(),
        };

        // Sign and Send Transaction
        console.log("🚀 Sending UZT...");
        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`✅ UZT Sent Successfully! Tx Hash: ${receipt.transactionHash}`);

        // Update Firestore (Subtract Tokens from User's Balance)
        await userRef.update({
            tokens: admin.firestore.FieldValue.increment(-amount),
            lastTransaction: receipt.transactionHash,
        });

        res.json({ success: true, txHash: receipt.transactionHash });
    } catch (error) {
        console.error("🚨 Error sending UZT:", error.message || error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
