import Wallet from "./upowTransactions/Wallet.js";
import BN from "bn.js";
import { generateKeys } from "./upowTransactions/Genkeys.js";
import { Buffer } from "buffer";
import CryptoJS from "crypto-js";
import elliptic from "elliptic";
import BigNumber from "bignumber.js";
import readline from "readline";
import { base58_to_binary } from "base58-js";
import { fileURLToPath } from "url";
import path from "path";
// (bs58 was only required for the removed legacy Transaction helper)

// Function to hash a message using SHA-256
function hashSha256(message) {
  const wordArray = CryptoJS.enc.Hex.parse(message);
  const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
  return hash;
}

// Function to create a CLI interface
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Function to ask a question and get user input
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

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

async function runCLI() {
  const rl = createInterface();

  try {
    console.log("=== UPOW Transaction Generator and Decoder ===\n");

    // Ask for mode
    const mode = await askQuestion(
      rl,
      "Choose mode (1: Generate Transaction, 2: Decode Transaction Hex, 3: Test UTXOs with Public Key): "
    );

    if (mode === "1") {
      // Generate Transaction Mode

      // Define alternative node endpoints
      const defaultEndpoints = ["https://api.upow.ai/"];

      // Ask for node endpoint
      console.log("Available node endpoints:");
      defaultEndpoints.forEach((ep, index) =>
        console.log(`${index + 1}. ${ep}`)
      );
      console.log("Or enter a custom endpoint URL");

      const endpoint = await askQuestion(
        rl,
        "Enter node endpoint (number or URL): "
      );

      // Determine the node endpoint based on user input
      let nodeEndpoint;
      if (
        /^\d+$/.test(endpoint) &&
        parseInt(endpoint) >= 1 &&
        parseInt(endpoint) <= defaultEndpoints.length
      ) {
        // User entered a number corresponding to one of the default endpoints
        nodeEndpoint = defaultEndpoints[parseInt(endpoint) - 1];
      } else if (endpoint) {
        // User entered a custom endpoint
        nodeEndpoint = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
      } else {
        // User didn't enter anything, use the first default endpoint
        nodeEndpoint = defaultEndpoints[0];
      }

      console.log(`Using node endpoint: ${nodeEndpoint}`);

      // Validate the endpoint URL
      try {
        new URL(nodeEndpoint);
      } catch (error) {
        throw new Error(`Invalid endpoint URL: ${nodeEndpoint}`);
      }

      // Ask for private key
      let privateKey, address;

      privateKey = await askQuestion(rl, "Enter your private key: ");
      if (!privateKey) {
        throw new Error("Private key is required.");
      }

      // Create a temporary wallet to get the address
      const tempWallet = new Wallet(privateKey, nodeEndpoint);
      address = tempWallet.address;
      console.log("Address:", address);

      // Create wallet instance
      const wallet = new Wallet(privateKey, nodeEndpoint);

      // Check balance with retry mechanism
      console.log("\nChecking balance...");
      let balance;
      try {
        balance = await wallet.checkBalance();
        console.log("Balance:", balance);

        // If there was an error getting the balance
        if (balance.error) {
          console.log("\nWarning: There was an issue retrieving your balance.");
          console.log(
            "Error:",
            balance.errorMessage.message || balance.errorMessage
          );
          console.log(
            "You can still generate a transaction, but you won't be able to verify if you have sufficient funds."
          );

          const continueAnyway = await askQuestion(
            rl,
            "\nDo you want to continue anyway? (y/n): "
          );
          if (continueAnyway.toLowerCase() !== "y") {
            throw new Error("Operation cancelled by user.");
          }
        }
      } catch (error) {
        console.error("\nError checking balance:", error.message);

        const continueAnyway = await askQuestion(
          rl,
          "\nDo you want to continue anyway? (y/n): "
        );
        if (continueAnyway.toLowerCase() !== "y") {
          throw new Error("Operation cancelled by user.");
        }

        balance = {
          totalBalance: "Unknown",
          pendingBalance: "Unknown",
          stakeBalance: "Unknown",
          pendingStakeBalance: "Unknown",
          error: true,
          errorMessage: error,
        };
      }

      // Ask for recipient address and amount
      const recipientAddress = await askQuestion(
        rl,
        "\nEnter recipient address: "
      );
      if (!recipientAddress) {
        throw new Error("Recipient address is required.");
      }

      const amountStr = await askQuestion(rl, "Enter amount to send: ");
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount.");
      }

      // Ask if user wants to include a message
      const includeMessageStr = await askQuestion(
        rl,
        "Include a message? (y/n): "
      );
      const includeMessage = includeMessageStr.toLowerCase() === "y";

      let message = "Test transaction message";
      if (includeMessage) {
        message = await askQuestion(rl, "Enter message: ");
      }

      // Generate transaction
      console.log("\nGenerating transaction...");
      let transaction;
      try {
        // First try to generate the transaction normally
        transaction = await generateTransactionHex(
          wallet,
          recipientAddress,
          amount,
          includeMessage,
          message,
          false
        );
      } catch (error) {
        console.error(`\nError generating transaction: ${error.message}`);

        if (
          error.message.includes("Failed to get address information") ||
          error.message.includes("Not enough funds") ||
          error.message.includes("getaddrinfo")
        ) {
          console.log(
            "\nThis could be due to connection issues with the node endpoint."
          );
          const skipCheck = await askQuestion(
            rl,
            "Do you want to generate a transaction without checking your balance? (y/n): "
          );

          if (skipCheck.toLowerCase() === "y") {
            console.log("\nGenerating transaction without balance check...");
            console.log(
              "Note: This transaction may fail if you don't have sufficient funds."
            );
            transaction = await generateTransactionHex(
              wallet,
              recipientAddress,
              amount,
              includeMessage,
              message,
              true
            );
          } else {
            throw new Error("Transaction generation cancelled.");
          }
        } else {
          throw error;
        }
      }

      console.log("\nTransaction generated successfully!");
      console.log("\nTransaction Details:");
      console.log("Inputs Count:", transaction.inputs);
      console.log("Outputs Count:", transaction.outputs);
      console.log("Total Amount:", transaction.totalAmount);
      console.log("Inputs Amount:", transaction.inputsAmount);
      if (transaction.message) {
        console.log("Message:", transaction.message);
      }

      // Display UTXO selection method
      console.log("\nUTXO Selection Method: Smallest First");
      console.log(
        "The UTXOs are sorted by amount (smallest first) and selected until the total amount is reached."
      );

      // Display selected UTXOs (inputs)
      console.log("\nSelected UTXOs (Inputs):");
      if (transaction.inputDetails && transaction.inputDetails.length > 0) {
        transaction.inputDetails.forEach((input, index) => {
          console.log(`Input #${index + 1}:`);
          console.log(`  Transaction Hash: ${input.tx_hash}`);
          console.log(`  Output Index: ${input.index}`);
          console.log(`  Amount: ${input.amount} UPOW`);
        });
      } else {
        console.log("No UTXO details available.");
      }

      console.log("\nTransaction Hash:", transaction.transactionHash);

      console.log("\nUnsigned Transaction Hex:");
      console.log(transaction.transactionHex);

      console.log("\nSigned Transaction Hex (ready to push to blockchain):");
      console.log(transaction.signedTransaction);

      // Decode the transaction to show the details
      // Decoded transaction details are now optional
      const showDecodedDetails = await askQuestion(
        rl,
        "\nDo you want to see decoded transaction details? (y/n): "
      );

      if (showDecodedDetails.toLowerCase() === "y") {
        console.log("\nDecoded Transaction Details:");
        const decoded = decodeTransactionHex(transaction.transactionHex);
        console.log(JSON.stringify(decoded, null, 2));
      }
    } else if (mode === "2") {
      // Decode Transaction Hex Mode
      const transactionHex = await askQuestion(
        rl,
        "Enter transaction hex to decode: "
      );

      if (!transactionHex) {
        throw new Error("Transaction hex is required.");
      }

      console.log("\nDecoding transaction hex...");
      const decoded = decodeTransactionHex(transactionHex);

      console.log("\nDecoded Transaction:");
      console.log(JSON.stringify(decoded, null, 2));
    } else if (mode === "3") {
      // Test UTXOs with Public Key Mode
      // Define alternative node endpoints
      const defaultEndpoints = ["https://api.upow.ai/"];

      // Ask for node endpoint
      console.log("Available node endpoints:");
      defaultEndpoints.forEach((ep, index) =>
        console.log(`${index + 1}. ${ep}`)
      );
      console.log("Or enter a custom endpoint URL");

      const endpoint = await askQuestion(
        rl,
        "Enter node endpoint (number or URL): "
      );

      // Determine the node endpoint based on user input
      let nodeEndpoint;
      if (
        /^\d+$/.test(endpoint) &&
        parseInt(endpoint) >= 1 &&
        parseInt(endpoint) <= defaultEndpoints.length
      ) {
        // User entered a number corresponding to one of the default endpoints
        nodeEndpoint = defaultEndpoints[parseInt(endpoint) - 1];
      } else if (endpoint) {
        // User entered a custom endpoint
        nodeEndpoint = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
      } else {
        // User didn't enter anything, use the first default endpoint
        nodeEndpoint = defaultEndpoints[0];
      }

      console.log(`Using node endpoint: ${nodeEndpoint}`);

      // Validate the endpoint URL
      try {
        new URL(nodeEndpoint);
      } catch (error) {
        throw new Error(`Invalid endpoint URL: ${nodeEndpoint}`);
      }

      // -------------------------------------------------------------------
      // Collect sender, recipient and amount from the CLI user
      // -------------------------------------------------------------------
      const fromAddress = await askQuestion(
        rl,
        "\nEnter sender address (from): "
      );
      if (!fromAddress) {
        throw new Error("Sender address is required.");
      }

      const recipientAddress = await askQuestion(
        rl,
        "Enter recipient address: "
      );
      if (!recipientAddress) {
        throw new Error("Recipient address is required.");
      }

      const amountStr = await askQuestion(rl, "Enter amount to send: ");
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount.");
      }

      console.log("\nFrom address:", fromAddress);
      console.log("Recipient address:", recipientAddress);
      console.log("Amount to send:", amount);

      // Ask if user wants to include a message
      const includeMessageStr = await askQuestion(
        rl,
        "Include a message? (y/n): "
      );
      const includeMessage = includeMessageStr.toLowerCase() === "y";

      let message = "Test transaction message";
      if (includeMessage) {
        message = await askQuestion(rl, "Enter message: ");
      }

      console.log("\nGenerating transaction without private key...");
      try {
        // Generate transaction without private key
        const transaction = await generateTransactionHexWithoutPrivateKey(
          fromAddress,
          recipientAddress,
          amount,
          nodeEndpoint,
          includeMessage,
          message
        );

        console.log("\nTransaction generated successfully!");
        console.log("\nTransaction Details:");
        console.log("Inputs Count:", transaction.inputs);
        console.log("Outputs Count:", transaction.outputs);
        console.log("Total Amount:", transaction.totalAmount);
        console.log("Inputs Amount:", transaction.inputsAmount);
        if (transaction.message) {
          console.log("Message:", transaction.message);
        }

        // Display UTXO selection method
        console.log("\nUTXO Selection Method: Smallest First");
        console.log(
          "The UTXOs are sorted by amount (smallest first) and selected until the total amount is reached."
        );

        // Display selected UTXOs (inputs)
        console.log("\nSelected UTXOs (Inputs):");
        if (transaction.inputDetails && transaction.inputDetails.length > 0) {
          transaction.inputDetails.forEach((input, index) => {
            console.log(`Input #${index + 1}:`);
            console.log(`  Transaction Hash: ${input.tx_hash}`);
            console.log(`  Output Index: ${input.index}`);
            console.log(`  Amount: ${input.amount} UPOW`);
          });
        } else {
          console.log("No UTXO details available.");
        }

        console.log("\nTransaction Hash:", transaction.transactionHash);

        console.log("\nUnsigned Transaction Hex:");
        console.log(transaction.transactionHex);

        console.log(
          "\nNote: This transaction is not signed and cannot be pushed to the blockchain."
        );
        console.log("It is for testing/simulation purposes only.");

        // Decode the transaction to show the details
        const showDecodedDetails = await askQuestion(
          rl,
          "\nDo you want to see decoded transaction details? (y/n): "
        );

        if (showDecodedDetails.toLowerCase() === "y") {
          console.log("\nDecoded Transaction Details:");
          const decoded = decodeTransactionHex(transaction.transactionHex);
          console.log(JSON.stringify(decoded, null, 2));
        }
      } catch (error) {
        console.error(`\nError generating transaction: ${error.message}`);
      }
    } else {
      throw new Error("Invalid mode selected.");
    }
  } catch (error) {
    console.error("\nError:", error.message);
  } finally {
    rl.close();
  }
}

// Run the CLI only if this module is executed directly (not when imported)
const __filename = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  runCLI();
}

// Export utility functions so that other modules can reuse them programmatically
export {
  generateTransactionHex,
  decodeTransactionHex,
  generateTransactionHexWithoutPrivateKey,
};
