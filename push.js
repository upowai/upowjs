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
  Wallet,
  // Newly exposed helpers
  generateTransactionHex,
  decodeTransactionHex,
  generateTransactionHexWithoutPrivateKey,
};
