import 'dotenv/config';
import express from 'express';
import Web3 from 'web3';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";

// Convert __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// ✅ Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// ✅ Firebase Web SDK Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBg1E1MDhmBWkZzGLN9TfWO02HPZ97rXJo",
    authDomain: "todo-master-dev-uzair.firebaseapp.com",
    projectId: "todo-master-dev-uzair",
    storageBucket: "todo-master-dev-uzair.firebasestorage.app",
    messagingSenderId: "333109267415",
    appId: "1:333109267415:web:60e5411bb485209f55d992"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ✅ Load ABI from abi.json
const abiPath = path.join(__dirname, 'abi.json');
const UZT_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

// ✅ Initialize Web3
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ALCHEMY_URL));

// ✅ Load Smart Contract
const contract = new web3.eth.Contract(UZT_ABI, process.env.CONTRACT_ADDRESS);

// 🔒 Securely Load Environment Variables
const senderAddress = process.env.SENDER_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

if (!senderAddress || !privateKey || !process.env.ALCHEMY_URL) {
    console.error("❌ Missing environment variables.");
    process.exit(1);
}

// ✅ Send UZT Transaction API
app.get('/sendUZT', async (req, res) => {
    const { receiverAdd, amount, useruid, transactionID } = req.query;

    if (!receiverAdd || !amount || !useruid || !transactionID) {
        return res.status(400).json({ error: "❌ Missing required parameters." });
    }

    try {
        console.log(`🔄 Processing transaction for user: ${useruid}`);

        // Fetch Tax Percentage from Firestore
        const taxRef = doc(db, "settings", "default");
        const taxSnap = await getDoc(taxRef);

        if (!taxSnap.exists()) {
            throw new Error("❌ Tax settings not found.");
        }

        const taxPercentage = taxSnap.data().tax || 0;
        console.log(`🧾 Tax Percentage: ${taxPercentage}%`);

        // Convert amount to number
        const amountNum = parseFloat(amount);

        // Calculate tax amount
        const taxAmount = (amountNum * taxPercentage) / 100;
        const finalAmount = amountNum - taxAmount;

        console.log(`💰 Initial Amount: ${amountNum} UZT`);
        console.log(`💸 Tax Deducted: ${taxAmount} UZT`);
        console.log(`📤 Final Amount Sent: ${finalAmount} UZT`);

        if (finalAmount <= 0) {
            throw new Error("❌ Amount too small after tax deduction.");
        }

        // Fetch User's Token Balance
        const userRef = doc(db, 'users', useruid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) throw new Error("❌ User not found in database.");

        const userData = userSnap.data();
        console.log("✅ User Data:", userData);

        if (!userData.tokens || userData.tokens < amountNum) {
            throw new Error("❌ Insufficient UZT balance in user account.");
        }

        // Validate Ethereum Address
        if (!web3.utils.isAddress(receiverAdd)) {
            throw new Error("❌ Invalid Ethereum address.");
        }
        console.log(`✅ Receiver Address: ${receiverAdd}`);

        // Convert Final Amount to Wei
        const finalAmountWei = web3.utils.toWei(finalAmount.toString(), "ether");
        console.log(`✅ Final Amount in Wei: ${finalAmountWei}`);

        // Check Sender's UZT Balance
        const senderUZTBalance = await contract.methods.balanceOf(senderAddress).call();
        console.log(`💰 Sender's UZT Balance: ${senderUZTBalance} UZT`);

        if (web3.utils.toBigInt(senderUZTBalance) < web3.utils.toBigInt(finalAmountWei)) {
            throw new Error("❌ Insufficient UZT balance in sender's wallet.");
        }

        // Check ETH Balance for Gas Fees
        const gasLimit = await contract.methods.transfer(receiverAdd, finalAmountWei).estimateGas({ from: senderAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const gasCost = web3.utils.toBigInt(gasLimit) * web3.utils.toBigInt(gasPrice);
        const senderETHBalance = await web3.eth.getBalance(senderAddress);

        console.log(`⛽ Gas Limit: ${gasLimit}`);
        console.log(`⚡ Gas Price: ${web3.utils.fromWei(gasPrice, "gwei")} Gwei`);
        console.log(`⛽ Estimated Gas Cost: ${web3.utils.fromWei(gasCost.toString(), "ether")} ETH`);
        console.log(`💰 Sender's Sepolia ETH Balance: ${web3.utils.fromWei(senderETHBalance, "ether")} ETH`);

        if (web3.utils.toBigInt(senderETHBalance) < gasCost) {
            throw new Error("❌ Insufficient Sepolia ETH balance for gas fees.");
        }

        // Prepare Transaction Data
        const txData = {
            from: senderAddress,
            to: process.env.CONTRACT_ADDRESS,
            gas: gasLimit,
            gasPrice: gasPrice,
            data: contract.methods.transfer(receiverAdd, finalAmountWei).encodeABI()
        };

        // Sign and Send Transaction
        console.log("🚀 Sending UZT...");
        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`✅ UZT Sent Successfully! Tx Hash: ${receipt.transactionHash}`);

        // ✅ Update Firestore Transactions Collection
        const transactionRef = doc(db, "transactions", transactionID);
        await updateDoc(transactionRef, {
            status: "approved",
            approvedAt: serverTimestamp(),
            txHash: receipt.transactionHash,
            taxDeducted: taxAmount
        });

        // ✅ Deduct Tokens & Tax from User's Balance
        await updateDoc(userRef, {
            tokens: increment(-amountNum), // Deduct full amount including tax
            lastTransaction: receipt.transactionHash
        });

        res.json({ success: true, txHash: receipt.transactionHash });
    } catch (error) {
        console.error("🚨 Error sending UZT:", error.message || error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
