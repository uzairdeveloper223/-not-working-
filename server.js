const express = require("express");
const cors = require("cors");
const Web3 = require("web3");
const admin = require("firebase-admin");
require("dotenv").config();

// Initialize Express
const app = express();

// Enable CORS for all domains
app.use(cors({ origin: "*" }));
app.use(express.json());

// Initialize Firebase Admin SDK
const serviceAccount = require("./firebase-admin-sdk.json"); // Ensure this file exists
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Load Web3 with Alchemy RPC URL
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ALCHEMY_RPC_URL));

// Load the contract ABI & address
const contractABI = require("./abi.json");
const contractAddress = "0x0330Bf3D0deE40a14d9f923c3eD9C1eF445e7862"; // Replace with your contract address
const contract = new web3.eth.Contract(contractABI, contractAddress);

// **GET / (API Status Check)**
app.get("/", (req, res) => {
    res.send("UZT Testnet API is running ✅");
});

// **POST /sendUZT (Process Withdrawals)**
app.post("/sendUZT", async (req, res) => {
    try {
        const { receiverAdd, amount, useruid } = req.body;

        if (!receiverAdd || !amount || !useruid) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // Fetch user data from Firestore
        const userRef = db.collection("users").doc(useruid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const userBalance = userData.tokens || 0;

        // Check if user has enough balance
        if (userBalance < amount) {
            return res.status(400).json({ error: "Insufficient balance" });
        }

        // Get the sender's private key (Use environment variable for security)
        const senderAddress = process.env.SENDER_ADDRESS;
        const senderPrivateKey = process.env.SENDER_PRIVATE_KEY;

        if (!senderAddress || !senderPrivateKey) {
            return res.status(500).json({ error: "Server is missing sender credentials" });
        }

        // Convert amount to blockchain format (adjust decimal places if needed)
        const decimals = await contract.methods.decimals().call();
        const tokenAmount = web3.utils.toBN(amount).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decimals)));

        // Build transaction data
        const txData = contract.methods.transfer(receiverAdd, tokenAmount).encodeABI();

        // Get gas price
        const gasPrice = await web3.eth.getGasPrice();

        // Create raw transaction
        const tx = {
            from: senderAddress,
            to: contractAddress,
            gas: 200000,
            gasPrice: gasPrice,
            data: txData
        };

        // Sign transaction
        const signedTx = await web3.eth.accounts.signTransaction(tx, senderPrivateKey);

        // Send transaction
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log("Transaction successful:", receipt.transactionHash);

        // Deduct amount from user's balance and update Firestore
        await userRef.update({
            tokens: userBalance - amount
        });

        // Log the transaction in Firestore
        await db.collection("transactions").add({
            userId: useruid,
            userName: userData.name,
            ethAddress: receiverAdd,
            amount: amount,
            status: "success",
            txHash: receipt.transactionHash,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, txHash: receipt.transactionHash });
    } catch (error) {
        console.error("Transaction error:", error);
        res.status(500).json({ error: "Transaction failed", details: error.message });
    }
});

// Start the server on Railway's default port or 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
