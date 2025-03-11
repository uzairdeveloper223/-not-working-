require("dotenv").config();
const express = require("express");
const Web3 = require("web3");
const admin = require("firebase-admin");
const cors = require("cors");

// Firebase Setup
const serviceAccount = require("./admin-firebase.json"); // 🔹 Replace with your Firebase Admin SDK JSON
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Web3 & Contract Setup
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ALCHEMY_RPC_URL));
const contractABI = require("./abi.json"); // 🔹 Replace with your contract ABI
const contractAddress = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(contractABI, contractAddress);
const senderAddress = process.env.SENDER_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

const app = express();
app.use(express.json());
app.use(cors());

// 📌 Handle UZT Transfers
app.get("/sendUZT", async (req, res) => {
    try {
        const { receiverAdd, amount, useruid } = req.query;
        if (!receiverAdd || !amount || !useruid) {
            return res.status(400).json({ error: "❌ Missing parameters" });
        }

        // Get user details from Firestore
        const userDoc = await db.collection("users").doc(useruid).get();
        if (!userDoc.exists) return res.status(404).json({ error: "❌ User not found" });

        const userData = userDoc.data();
        if (!userData.ethAddress || userData.ethAddress !== receiverAdd) {
            return res.status(400).json({ error: "❌ Ethereum address mismatch" });
        }

        // Convert amount to Wei
        const amountWei = web3.utils.toWei(amount.toString(), "ether");

        // Check Sender UZT Balance
        const senderBalance = await contract.methods.balanceOf(senderAddress).call();
        if (web3.utils.toBigInt(senderBalance) < web3.utils.toBigInt(amountWei)) {
            return res.status(400).json({ error: "❌ Insufficient UZT balance" });
        }

        // Estimate Gas
        const gasLimit = await contract.methods.transfer(receiverAdd, amountWei).estimateGas({ from: senderAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const gasCost = web3.utils.toBigInt(gasLimit) * web3.utils.toBigInt(gasPrice);
        const senderETHBalance = await web3.eth.getBalance(senderAddress);

        if (web3.utils.toBigInt(senderETHBalance) < gasCost) {
            return res.status(400).json({ error: "❌ Insufficient Sepolia ETH for gas fees" });
        }

        // Sign Transaction
        const txData = {
            from: senderAddress,
            to: contractAddress,
            gas: gasLimit,
            gasPrice: gasPrice,
            data: contract.methods.transfer(receiverAdd, amountWei).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        // Update Firestore Transaction Status
        await db.collection("transactions").add({
            userId: useruid,
            userName: userData.name,
            ethAddress: receiverAdd,
            amount: amount,
            status: "approved",
            txHash: receipt.transactionHash,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.json({ success: true, txHash: receipt.transactionHash });

    } catch (error) {
        console.error("🚨 Error:", error.message || error);
        return res.status(500).json({ error: "🚨 Transaction failed", details: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
