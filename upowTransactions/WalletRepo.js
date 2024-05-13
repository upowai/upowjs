import axios from "axios";
import BigNumber from "bignumber.js";
import WalletUtil from "./WalletUtils.js";
import { Buffer } from "buffer";
import elliptic from "elliptic";
import BN from "bn.js";
import CryptoJS from "crypto-js";

function hashSha256(message) {
  const wordArray = CryptoJS.enc.Hex.parse(message);
  const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
  return hash;
}

export default class WalletRepo extends WalletUtil {
  constructor(privateKey, endpoint) {
    super(privateKey, endpoint);
  }

  async getBalanceInfo(address) {
    try {
      const params = new URLSearchParams({ address, show_pending: true });
      const url = `${this.endpoint}get_address_info?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      // const data = response.data;
      if (!data.ok) {
        return {
          totalBalance: null,
          pendingBalance: null,
          stakeBalance: null,
          pendingStakeBalance: null,
          error: true,
          errorMessage: data.error,
        };
      }

      const result = data.result || {};
      const pendingTransactions = result.pending_transactions || [];
      const spendableOutputs = result.spendable_outputs || [];

      const spendableHashes = new Set(
        spendableOutputs.map((output) => output.tx_hash)
      );

      let totalBalance = new BigNumber(result.balance || 0);
      let pendingBalance = new BigNumber(0);
      let stakeBalance = new BigNumber(result.stake || 0);
      let pendingStakeBalance = new BigNumber(0);

      pendingTransactions.forEach((transaction) => {
        transaction.inputs.forEach((input) => {
          if (input.address === address && spendableHashes.has(input.tx_hash)) {
            const inputAmount = new BigNumber(input.amount || 0);
            if (
              transaction.outputs.some((output) => output.type === "UN_STAKE")
            ) {
              pendingBalance = pendingBalance.plus(inputAmount);
            } else if (transaction.transaction_type === "REGULAR") {
              pendingBalance = pendingBalance.minus(inputAmount);
            }
          }
        });

        transaction.outputs.forEach((output) => {
          if (output.address === address) {
            const outputAmount = new BigNumber(output.amount || 0);
            if (output.type === "STAKE") {
              pendingStakeBalance = pendingStakeBalance.plus(outputAmount);
            } else if (output.type === "UN_STAKE") {
              pendingStakeBalance = pendingStakeBalance.minus(outputAmount);
            } else if (output.type === "REGULAR") {
              pendingBalance = pendingBalance.plus(outputAmount);
            }
          }
        });
      });

      // Format the balances
      const formattedTotalBalance = totalBalance.toFixed();
      const formattedPendingBalance = pendingBalance.toFixed();
      const formattedStakeBalance = stakeBalance.toFixed();
      const formattedPendingStakeBalance = pendingStakeBalance.toFixed();

      return {
        totalBalance: formattedTotalBalance,
        pendingBalance: formattedPendingBalance,
        stakeBalance: formattedStakeBalance,
        pendingStakeBalance: formattedPendingStakeBalance,
        error: false,
        errorMessage: null,
      };
    } catch (error) {
      `Error: ${error.message}`;
      return {
        totalBalance: null,
        pendingBalance: null,
        stakeBalance: null,
        pendingStakeBalance: null,
        error: true,
        errorMessage: error,
      };
    }
  }

  async getAddressInfo(address = this.address, transactions_count = 20) {
    try {
      let req = await axios.get(
        this.endpoint +
          "get_address_info?address=" +
          address +
          "&transactions_count_limit=" +
          transactions_count +
          "&verify=true&show_pending=1",
        {
          mode: "no-cors",
          headers: {
            "Bypass-Tunnel-Reminder": "",
          },
        }
      );
      return req.data.result;
    } catch (err) {
      return err.request;
    }
  }

  async get_address_info(
    address,
    stake_outputs = false,
    delegate_spent_votes = false,
    delegate_unspent_votes = false,
    address_state = false,
    inode_registration_outputs = false,
    validator_unspent_votes = false
  ) {
    const params = new URLSearchParams({
      address,
      transactions_count_limit: 0,
      show_pending: true,
      stake_outputs,
      delegate_spent_votes,
      delegate_unspent_votes,
      address_state,
      inode_registration_outputs,
      validator_unspent_votes,
    });

    try {
      const response = await axios.get(`${this.endpoint}get_address_info`, {
        params,
        mode: "no-cors",
        headers: {
          "Bypass-Tunnel-Reminder": "",
        },
      });

      return response.data.result;
    } catch (error) {
      console.error("Error fetching address info:", error);
      throw error;
    }
  }

  async pushTransaction(txHex) {
    try {
      const response = await fetch(`${this.endpoint}push_tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tx_hex: txHex }),
        timeout: 10000,
      });

      if (response.ok) {
        const res = await response.json();
        if (res.ok) {
          const hash = hashSha256(txHex);
          return { error: null, hash };
        } else {
          throw new Error("Transaction not pushed");
        }
      } else {
        const errorResponse = await response.json();
        throw new Error(errorResponse);
      }
    } catch (err) {
      // console.error(`Error during request to node: ${err}`);
      throw new Error(err);
    }
  }

  async getValidatorsInfo(inode) {
    const url = `${this.node_url}/get_validators_info${
      inode ? `?inode=${inode}` : ""
    }`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      const result = await response.json();
      return result;
    } catch (error) {
      console.error(
        "There has been a problem with your fetch operation:",
        error
      );
      throw new Error(error);
    }
  }

  async getDelegatesInfo(validator = null) {
    const params = validator ? { validator: validator } : {};
    const url = `${this.endpoint}get_delegates_info`;

    try {
      const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Add any additional headers if needed
        },
        timeout: 10000, // Timeout in milliseconds
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(
        "There has been a problem with your fetch operation:",
        error
      );
      throw new Error(error);
    }
  }

  async getDobbyInfo() {
    try {
      const response = await fetch(`${this.endpoint}dobby_info`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error("Error fetching Dobby info:", error);
      throw new Error(error);
    }
  }

  async getTransactionDetails(txHash) {
    try {
      const response = await fetch(
        `${this.endpoint}get_transaction?tx_hash=${txHash}&verify=true`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (!result.ok) {
        throw new Error("API returned an error response");
      }
      return result.result;
    } catch (error) {
      console.error("Error fetching transaction details:", error);
      throw new Error(error);
    }
  }

  async completeTransaction({ message, transactionData }) {
    let transactionHash;
    if (message === undefined) {
      transactionHash = hashSha256(transactionData.join(""));
      transactionData.push(Buffer.from(this.indexToByte(0, 1)).toString("hex"));
    } else {
      transactionData.push(Buffer.from(this.indexToByte(1, 1)).toString("hex"));
      let message_buffer = Buffer.from(message, "utf-8").toString("hex");
      transactionData.push(
        Buffer.from(this.indexToByte(message.length, 2)).toString("hex")
      );
      transactionData.push(message_buffer);

      transactionHash = hashSha256(transactionData.join(""));
    }
    let elp = elliptic.ec("p256");
    // console.log("data", transactionData.join(""));
    const pkey = new BN(new BigNumber(this.privateKey, 16).toString(10), 10);
    let key = elp.keyFromPrivate(pkey);
    let sign = key.sign(transactionHash);
    let transactionBuffer = transactionData.join("");
    let signr = Buffer.from(sign.r.toArray().reverse()).toString("hex");
    let signs = Buffer.from(sign.s.toArray().reverse()).toString("hex");
    let signedTransaction = [transactionBuffer, signr, signs].join("");
    let pushTransaction = await this.pushTransaction(signedTransaction);

    return {
      response: pushTransaction,
    };
  }
}
