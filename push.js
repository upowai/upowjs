import Wallet from "./upowTransactions/Wallet.js";
import BN from "bn.js";
import { generateKeys } from "./upowTransactions/Genkeys.js";
import {
  generateTransactionHex,
  decodeTransactionHex,
  generateTransactionHexWithoutPrivateKey,
} from "./transaction-hex-decoder.js";

async function sendTransaction(wallet, recipientAddress, amount) {
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
    const transactionResult = await wallet.transaction(
      beneficiaries,
      "this is the message"
    );
    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(error);
  }
}

async function stakeTransaction(wallet, amount) {
  if (!amount) {
    throw new Error("Amount is required for staking.");
  }

  try {
    const transactionResult = await wallet.stakeTransaction(amount);

    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function unStakeTransaction(wallet) {
  try {
    const transactionResult = await wallet.unstakeTransaction();

    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function registerInodeTransaction(wallet) {
  try {
    const transactionResult = await wallet.registerInode();

    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function deRegisterInodeTransaction(wallet) {
  try {
    const transactionResult = await wallet.deRegisterInode();

    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function registerValidatorTransaction(wallet) {
  try {
    const transactionResult = await wallet.registerValidator();

    return {
      response: transactionResult.response,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function voteTransaction(wallet, votingRange, recipient) {
  try {
    const transactionResult = await wallet.vote(votingRange, recipient);

    return {
      response: transactionResult.response,
      message: transactionResult.message,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function revokeTransaction(wallet, revokeFrom) {
  try {
    const transactionResult = await wallet.revoke(revokeFrom);

    return {
      response: transactionResult.response,
      message: transactionResult.message,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function uPowKeys() {
  try {
    const keys = generateKeys();

    return {
      response: keys,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function uPowBalance(wallet, address) {
  try {
    const balance = await wallet.checkBalancePublicKey(address);

    return {
      response: balance,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function uPowTxHash(wallet, txhash) {
  try {
    const hash = await wallet.getTxhash(txhash);

    return {
      response: hash,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function uPowGetAdress(wallet) {
  try {
    const address = await wallet.getAddressFromPrivateKey();

    return {
      response: address,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

async function consolidateUTXOs(
  wallet,
  recipientAddress,
  maxAmount = 5,
  maxInputs = 255
) {
  if (!recipientAddress) {
    throw new Error("Recipient address is required for consolidation.");
  }

  try {
    // Get small UTXOs for the wallet (less than or equal to maxAmount)
    // Limit to maxInputs (default 255) to prevent exceeding blockchain input limits
    const utxos = await wallet.getUTXOs(maxAmount, maxInputs);

    if (!utxos || utxos.length <= 1) {
      return {
        response: {
          success: false,
          message: `Not enough small UTXOs (≤ ${maxAmount}) to consolidate`,
        },
      };
    }

    console.log(
      `Found ${utxos.length} UTXOs with amount ≤ ${maxAmount} to consolidate (max inputs: ${maxInputs})`
    );

    // Calculate total amount from filtered UTXOs
    const totalAmount = utxos.reduce(
      (sum, utxo) => sum + Number(utxo.amount),
      0
    );
    console.log(`Total amount to consolidate: ${totalAmount}`);

    // Create a single transaction that sends all funds back to the same address
    const beneficiaries = [
      {
        address: recipientAddress,
        amount: totalAmount.toString(),
        type: "0",
      },
    ];

    const transactionResult = await wallet.transaction(
      beneficiaries,
      "UTXO consolidation"
    );

    return {
      response: transactionResult.response,
      consolidatedUtxos: utxos.length,
      totalAmount: totalAmount,
    };
  } catch (error) {
    throw new Error(`UTXO consolidation failed: ${error.message || error}`);
  }
}

async function analyzeUTXOs(wallet) {
  try {
    // Get all UTXOs for the wallet
    const addressInfo = await wallet.getAddressInfo(
      await wallet.getAddressFromPrivateKey(),
      0
    );
    const allUTXOs = wallet.getAddressInputFromJson(addressInfo);

    if (!allUTXOs || allUTXOs.length === 0) {
      return {
        response: {
          success: false,
          message: "No UTXOs found for this wallet",
        },
      };
    }

    // Group UTXOs by amount ranges
    const utxoAnalysis = {
      total: allUTXOs.length,
      totalValue: 0,
      ranges: {},
      distribution: {},
    };

    // Define common ranges
    const ranges = [
      { name: "dust", max: 1 },
      { name: "small", max: 5 },
      { name: "medium", max: 100 },
      { name: "large", max: 1000 },
      { name: "very_large", max: 10000 },
      { name: "huge", max: 100000 },
      { name: "massive", max: Infinity },
    ];

    // Initialize ranges
    ranges.forEach((range) => {
      utxoAnalysis.ranges[range.name] = {
        count: 0,
        totalValue: 0,
        utxos: [],
      };
    });

    // Analyze each UTXO
    allUTXOs.forEach((utxo) => {
      const amount = parseFloat(utxo.amount);
      utxoAnalysis.totalValue += amount;

      // Find which range this UTXO belongs to
      for (const range of ranges) {
        if (amount <= range.max) {
          utxoAnalysis.ranges[range.name].count++;
          utxoAnalysis.ranges[range.name].totalValue += amount;
          utxoAnalysis.ranges[range.name].utxos.push({
            txHash: utxo.tx_hash,
            index: utxo.index,
            amount: amount,
          });
          break;
        }
      }

      // Also track exact amounts for detailed distribution
      const amountKey = amount.toString();
      if (!utxoAnalysis.distribution[amountKey]) {
        utxoAnalysis.distribution[amountKey] = {
          count: 0,
          totalValue: 0,
        };
      }
      utxoAnalysis.distribution[amountKey].count++;
      utxoAnalysis.distribution[amountKey].totalValue += amount;
    });

    // Sort distribution by count (descending)
    const sortedDistribution = Object.entries(utxoAnalysis.distribution)
      .sort((a, b) => b[1].count - a[1].count)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    utxoAnalysis.distribution = sortedDistribution;

    return {
      response: {
        success: true,
        analysis: utxoAnalysis,
      },
    };
  } catch (error) {
    throw new Error(`UTXO analysis failed: ${error.message || error}`);
  }
}

export {
  sendTransaction,
  stakeTransaction,
  unStakeTransaction,
  registerInodeTransaction,
  deRegisterInodeTransaction,
  registerValidatorTransaction,
  voteTransaction,
  revokeTransaction,
  uPowKeys,
  uPowBalance,
  uPowTxHash,
  uPowGetAdress,
  consolidateUTXOs,
  analyzeUTXOs,
  Wallet,
  // Newly exposed helpers
  generateTransactionHex,
  decodeTransactionHex,
  generateTransactionHexWithoutPrivateKey,
};
