# uPowjs

A `upowjs` JavaScript library for interacting with the blockchain, designed specifically for uPow blockchain networks. This library provides functionalities for wallet management, transaction processing, and more.

## Installation

Install `upowjs` using npm:

```bash
npm install upowjs
```

## Usage

### Creating a Wallet

```javascript
import { upowjs } from "upowjs";

async function createWallet() {
  try {
    const walletInfo = await upowjs.uPowKeys();
    console.log("Wallet created:", walletInfo);
  } catch (error) {
    console.error("Error during wallet creation:", error.message);
  }
}

createWallet();
```

### Sending a Transaction

```javascript
import { upowjs } from "upowjs";

const KEY = "your_private_key_here";
const TO = "recipient_wallet_address";
const AMOUNT = "amount_to_send";
const ENDPOINT = "https://api.upow.ai/";

async function sendTransaction() {
  const myWallet = new upowjs.Wallet(KEY, ENDPOINT);
  try {
    const transactionInfo = await upowjs.sendTransaction(myWallet, TO, AMOUNT);
    console.log("Transaction successful:", transactionInfo);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

sendTransaction();
```

### Stake uPow coins

```javascript
import { upowjs } from "upowjs";

async function stakeTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.stakeTransaction(myWallet, AMOUNT);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

stakeTransactionPush();
```

### unStake uPow coins

```javascript
import { upowjs } from "upowjs";

async function unstakeTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.unStakeTransaction(myWallet);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

unstakeTransactionPush();
```

### Register as a iNode

```javascript
import { upowjs } from "upowjs";

async function registerInodeTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.registerInodeTransaction(myWallet);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

registerInodeTransactionPush();
```

### deRegister as a iNode

```javascript
import { upowjs } from "upowjs";

async function deRegisterInodeTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.deRegisterInodeTransaction(myWallet);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

deRegisterInodeTransactionPush();
```

### Register as a validator

```javascript
import { upowjs } from "upowjs";

async function registerValidatorTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.registerValidatorTransaction(myWallet);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

registerValidatorTransactionPush();
```

### Vote

```javascript
import { upowjs } from "upowjs";

async function voteTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.voteTransaction(myWallet, VOTING_RANGE, VOTE_TO);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

voteTransactionPush();
```

### Revoke vote

```javascript
import { upowjs } from "upowjs";

async function revokeTransactionPush() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const info = await upowjs.revokeTransaction(myWallet, REVOKE_FROM);
    console.log("Transaction successful:", info);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

revokeTransactionPush();
```

### Get user balance

```javascript
import { upowjs } from "upowjs";

async function checkUserBalance() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const bal = await upowjs.uPowBalance(myWallet, WALLET);
    console.log("Balance:", bal);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

checkUserBalance();
```

### Get tx hash

```javascript
import { upowjs } from "upowjs";

async function checkTx() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const txhash = await upowjs.uPowTxHash(myWallet, txhashval);
    console.log(JSON.stringify(txhash, null, 2));
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

checkTx();
```

### Get address

```javascript
import { upowjs } from "upowjs";

async function getAddress() {
  const endpoint = ENDPOINT;
  const myWallet = new upowjs.Wallet(KEY, endpoint);

  try {
    const address = await upowjs.uPowGetAdress(myWallet);
    console.log(address);
  } catch (error) {
    console.error("Error during transaction:", error.message);
  }
}

getAddress();
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
