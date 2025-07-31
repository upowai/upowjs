import Wallet from "./upowTransactions/Wallet.js";
import BN from "bn.js";
import { generateKeys } from "./upowTransactions/Genkeys.js";
import { Buffer } from "buffer";
import CryptoJS from "crypto-js";
import elliptic from "elliptic";
import BigNumber from "bignumber.js";
import { base58_to_binary } from "base58-js";
// (bs58 was only required for the removed legacy Transaction helper)

// Function to hash a message using SHA-256
function hashSha256(message) {
  const wordArray = CryptoJS.enc.Hex.parse(message);
  const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
  return hash;
}

// CLI functions removed for frontend compatibility

// Function to generate a transaction without pushing it to the blockchain
async function generateTransactionHex(
  wallet,
  recipientAddress,
  amount,
  includeMessage = false,
  message = "Test transaction message",
  skipAddressInfoCheck = false
) {
  if (!recipientAddress || !amount) {
    throw new Error("Recipient address and amount are required.");
  }

  const beneficiaries = [
    {
      address: recipientAddress,
      amount: amount,
      type: "0",
    },
  ];

  try {
    // Get address info
    let addressInfo;
    try {
      addressInfo = await wallet.getAddressInfo(wallet.address, 0);
      if (!addressInfo || typeof addressInfo !== "object") {
        console.warn(
          "Warning: Could not retrieve address information from the node."
        );
        if (!skipAddressInfoCheck) {
          throw new Error(
            "Failed to get address information. Please check your connection or try a different node endpoint."
          );
        }
        // Create a minimal addressInfo object with empty spendable_outputs
        addressInfo = { spendable_outputs: [] };
      }
    } catch (error) {
      console.warn(`Warning: Error getting address info: ${error.message}`);
      if (!skipAddressInfoCheck) {
        throw error;
      }
      // Create a minimal addressInfo object with empty spendable_outputs
      addressInfo = { spendable_outputs: [] };
    }

    let totalAmount = new BN("0", 10);

    // Map beneficiaries
    const mappedBeneficiaries = beneficiaries.map((output) => {
      return {
        address: output.address,
        amount: wallet.amountInSmallestUnit(output.amount),
        type: output.type ?? "0",
      };
    });

    // Calculate total amount
    mappedBeneficiaries.forEach((output) => {
      totalAmount = totalAmount.add(output.amount);
    });

    // Get address inputs
    let addressInputs = wallet.getAddressInputFromJson(addressInfo);
    addressInputs.sort((a, b) => a.amount - b.amount);

    let inputs = [];
    let inputsAmount = new BN("0", 10);
    let inputDetails = [];

    // Select inputs
    for (const txInput of addressInputs) {
      inputs.push(wallet.getInput(txInput.tx_hash, txInput.index));
      inputsAmount = inputsAmount.add(
        wallet.amountInSmallestUnit(parseFloat(txInput.amount))
      );

      // Store input details for decoding
      inputDetails.push({
        tx_hash: txInput.tx_hash,
        index: txInput.index,
        amount: parseFloat(txInput.amount),
      });

      if (inputsAmount.gte(totalAmount)) {
        break;
      }
    }

    if (inputsAmount.lt(totalAmount)) {
      throw new Error("Not enough funds");
    }

    // Add change output if needed
    if (inputsAmount.gt(totalAmount)) {
      mappedBeneficiaries.push({
        address: wallet.address,
        amount: inputsAmount.sub(totalAmount),
        type: "0",
      });
    }

    // Create outputs
    let outputs = [];
    let outputDetails = [];

    mappedBeneficiaries.forEach((beneficiary) => {
      outputs.push(
        wallet.getOutput(
          beneficiary.address,
          beneficiary.amount,
          beneficiary.type
        )
      );

      // Store output details for decoding
      outputDetails.push({
        address: beneficiary.address,
        amount: beneficiary.amount.toString(),
        type: beneficiary.type,
      });
    });

    // Create transaction data
    let transactionData = [
      new Buffer.from(wallet.indexToByte(wallet.version, 1)),
      new Buffer.from(wallet.indexToByte(inputs.length, 1)),
    ];

    inputs.forEach((input) => transactionData.push(input));
    transactionData.push(
      new Buffer.from(wallet.indexToByte(outputs.length, 1))
    );
    outputs.forEach((output) => transactionData.push(output));

    // Convert to hex array
    const transactionHexArray = transactionData.map((t) => {
      return t.toString("hex");
    });

    // Add message if requested
    let messageText = includeMessage ? message : undefined;
    if (messageText) {
      transactionHexArray.push(
        Buffer.from(wallet.indexToByte(1, 1)).toString("hex")
      );
      let messageBuffer = Buffer.from(messageText, "utf-8").toString("hex");
      transactionHexArray.push(
        Buffer.from(wallet.indexToByte(messageText.length, 2)).toString("hex")
      );
      transactionHexArray.push(messageBuffer);
    } else {
      transactionHexArray.push(
        Buffer.from(wallet.indexToByte(0, 1)).toString("hex")
      );
    }

    // Join the hex array to get the complete transaction hex
    const transactionHex = transactionHexArray.join("");

    // Calculate transaction hash
    const transactionHash = hashSha256(transactionHex);

    // Sign the transaction
    const elp = elliptic.ec("p256");
    const pkey = new BN(new BigNumber(wallet.privateKey, 16).toString(10), 10);
    const key = elp.keyFromPrivate(pkey);
    const sign = key.sign(transactionHash);

    // Get signature components
    const signR = Buffer.from(sign.r.toArray().reverse()).toString("hex");
    const signS = Buffer.from(sign.s.toArray().reverse()).toString("hex");

    // Create the complete signed transaction
    const signedTransaction = [transactionHex, signR, signS].join("");

    return {
      transactionHex,
      transactionHash,
      signedTransaction,
      inputs: inputs.length,
      outputs: outputs.length,
      totalAmount: totalAmount.toString(),
      inputsAmount: inputsAmount.toString(),
      message: messageText,
      inputDetails,
      outputDetails,
    };
  } catch (error) {
    throw new Error(`Error generating transaction: ${error.message}`);
  }
}

// Function to decode a transaction hex
function decodeTransactionHex(transactionHex) {
  try {
    // Convert hex to buffer
    const buffer = Buffer.from(transactionHex, "hex");

    // Read version (first byte)
    const version = buffer[0];
    let offset = 1;

    // Read number of inputs
    const inputsCount = buffer[offset];
    offset += 1;

    // Parse inputs
    const inputs = [];
    for (let i = 0; i < inputsCount; i++) {
      // Each input has 32 bytes for tx_hash, 1 byte for index, and 1 byte for type
      const txHash = buffer.slice(offset, offset + 32).toString("hex");
      offset += 32;

      const index = buffer[offset];
      offset += 1;

      const type = buffer[offset];
      offset += 1;

      inputs.push({ txHash, index, type });
    }

    // Read number of outputs
    const outputsCount = buffer[offset];
    offset += 1;

    // Parse outputs
    const outputs = [];
    for (let i = 0; i < outputsCount; i++) {
      // Address is 33 bytes
      const addressBytes = buffer.slice(offset, offset + 33);
      offset += 33;

      // Try to convert to base58 address
      let address;
      try {
        // This is a simplified approach - actual implementation may vary
        address = addressBytes.toString("hex");
      } catch (e) {
        address = addressBytes.toString("hex");
      }

      // Amount bytes count
      const bytesCount = buffer[offset];
      offset += 1;

      // Amount value
      let amount = 0;
      for (let j = 0; j < bytesCount; j++) {
        amount += buffer[offset + j] * Math.pow(256, j);
      }
      offset += bytesCount;

      // Output type
      const type = buffer[offset];
      offset += 1;

      outputs.push({
        address,
        amount: amount / 100000000, // Convert from smallest unit
        type: type.toString(),
      });
    }

    // Check if there's a message
    let message = null;
    if (offset < buffer.length) {
      const hasMessage = buffer[offset];
      offset += 1;

      if (hasMessage === 1) {
        // Message length (2 bytes)
        const messageLength = buffer[offset] + (buffer[offset + 1] << 8);
        offset += 2;

        // Message content
        message = buffer.slice(offset, offset + messageLength).toString("utf8");
        offset += messageLength;
      }
    }

    // If there's more data, it's likely the signature
    let signature = null;
    if (offset < buffer.length) {
      signature = {
        r: buffer.slice(offset, offset + 32).toString("hex"),
        s: buffer.slice(offset + 32, offset + 64).toString("hex"),
      };
    }

    return {
      version,
      inputs,
      outputs,
      message,
      signature,
    };
  } catch (error) {
    throw new Error(`Error decoding transaction hex: ${error.message}`);
  }
}

// Function to generate a transaction hex without private key (no signing)
async function generateTransactionHexWithoutPrivateKey(
  fromAddress,
  recipientAddress,
  amount,
  nodeEndpoint,
  includeMessage = false,
  message = ""
) {
  // Temporary wallet instance without a private key – used **only** for helper/utility methods
  const tempWallet = new Wallet("", nodeEndpoint);

  // ---------------------------------------------------------------------------
  // STEP 1 – Fetch UTXOs for the sender and pick the smallest-first set of inputs
  // ---------------------------------------------------------------------------
  const addressInfo = await tempWallet.getAddressInfo(fromAddress, 0);
  if (!addressInfo || !addressInfo.spendable_outputs) {
    throw new Error(
      "No UTXOs found for this address or error retrieving data."
    );
  }

  // Collect and sort spendable outputs (smallest first)
  let addressInputs = tempWallet.getAddressInputFromJson(addressInfo);
  addressInputs.sort((a, b) => a.amount - b.amount);

  const selectedInputs = [];
  let inputsAmount = new BN("0", 10);
  const sendAmountSmallest = tempWallet.amountInSmallestUnit(amount);
  const feeSmallest = tempWallet.amountInSmallestUnit(0.0001); // simple fixed fee
  const totalRequired = sendAmountSmallest.add(feeSmallest);

  for (const input of addressInputs) {
    selectedInputs.push(input);
    inputsAmount = inputsAmount.add(
      tempWallet.amountInSmallestUnit(parseFloat(input.amount))
    );
    if (inputsAmount.gte(totalRequired)) {
      break;
    }
  }

  if (inputsAmount.lt(totalRequired)) {
    throw new Error(
      `Not enough funds. Required: ${totalRequired.toString()}, Available: ${inputsAmount.toString()}`
    );
  }

  // ---------------------------------------------------------------------------
  // STEP 2 – Build beneficiaries list (recipient + change)
  // ---------------------------------------------------------------------------
  const beneficiaries = [
    {
      address: recipientAddress,
      amount: sendAmountSmallest,
      type: "0",
    },
  ];

  const change = inputsAmount.sub(totalRequired);
  if (change.gt(new BN("0", 10))) {
    beneficiaries.push({
      address: fromAddress,
      amount: change,
      type: "0",
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 3 – Prepare binary buffers for inputs & outputs using wallet helpers
  // ---------------------------------------------------------------------------
  const inputBuffers = [];
  const inputDetails = [];
  selectedInputs.forEach((input) => {
    inputBuffers.push(tempWallet.getInput(input.tx_hash, input.index));
    inputDetails.push({
      tx_hash: input.tx_hash,
      index: input.index,
      amount: parseFloat(input.amount),
    });
  });

  const outputBuffers = [];
  const outputDetails = [];
  beneficiaries.forEach((b) => {
    outputBuffers.push(tempWallet.getOutput(b.address, b.amount, b.type));
    outputDetails.push({
      address: b.address,
      amount: b.amount.toString(),
      type: b.type,
    });
  });

  // ---------------------------------------------------------------------------
  // STEP 4 – Assemble the raw transaction data (version, counts, etc.)
  // ---------------------------------------------------------------------------
  const txParts = [
    Buffer.from(tempWallet.indexToByte(tempWallet.version, 1)),
    Buffer.from(tempWallet.indexToByte(inputBuffers.length, 1)),
  ];

  txParts.push(...inputBuffers);
  txParts.push(Buffer.from(tempWallet.indexToByte(outputBuffers.length, 1)));
  txParts.push(...outputBuffers);

  // Optional message section
  if (includeMessage && message) {
    txParts.push(Buffer.from(tempWallet.indexToByte(1, 1))); // message flag
    txParts.push(Buffer.from(tempWallet.indexToByte(message.length, 2)));
    txParts.push(Buffer.from(message, "utf-8"));
  } else {
    txParts.push(Buffer.from(tempWallet.indexToByte(0, 1))); // no message
  }

  // ---------------------------------------------------------------------------
  // STEP 5 – Convert to hex string & hash
  // ---------------------------------------------------------------------------
  const transactionHexArray = txParts.map((p) => p.toString("hex"));
  const transactionHex = transactionHexArray.join("");
  const transactionHash = hashSha256(transactionHex);

  return {
    transactionHex,
    transactionHash,
    inputs: inputBuffers.length,
    outputs: outputBuffers.length,
    totalAmount: sendAmountSmallest.toString(),
    inputsAmount: inputsAmount.toString(),
    message: includeMessage ? message : null,
    inputDetails,
    outputDetails,
    canPushToBlockchain: false, // Unsigned transaction cannot be broadcast
  };
}

// CLI functionality removed for frontend compatibility

// Export utility functions so that other modules can reuse them programmatically
export {
  generateTransactionHex,
  decodeTransactionHex,
  generateTransactionHexWithoutPrivateKey,
  hashSha256, // Export the hash function for frontend use
};
