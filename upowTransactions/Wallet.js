import BN from "bn.js";
import { Buffer } from "buffer";
import walletHelper from "./WalletHelper.js";

const MAX_INODES = 12;

class Wallet extends walletHelper {
  constructor(privateKey, endpoint) {
    super(privateKey, endpoint);
  }

  async checkBalance() {
    let a = await this.getBalanceInfo(this.address);
    return a;
  }

  async checkBalancePublicKey(address) {
    let a = await this.getBalanceInfo(address);
    return a;
  }

  getAddressFromPrivateKey() {
    return this.getAddressFromPrivate();
  }

  async getTxhash(hash) {
    let a = await this.getTransactionDetails(hash);
    return a;
  }

  async getUTXOs(maxAmount = null, maxCount = null) {
    const addressInfo = await this.getAddressInfo(this.address, 0);
    let addressInputs = this.getAddressInputFromJson(addressInfo);

    // If maxAmount is provided, filter UTXOs to only include those with amount <= maxAmount
    if (maxAmount !== null) {
      addressInputs = addressInputs.filter(
        (input) => parseFloat(input.amount) <= maxAmount
      );
    }

    // Sort by amount (smallest first) to prioritize consolidating smaller UTXOs
    addressInputs.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));

    // If maxCount is provided, limit the number of UTXOs returned
    if (maxCount !== null && addressInputs.length > maxCount) {
      console.log(`Limiting UTXOs from ${addressInputs.length} to ${maxCount}`);
      addressInputs = addressInputs.slice(0, maxCount);
    }

    return addressInputs;
  }

  async transaction(beneficiaries, message = undefined) {
    const addressInfo = await this.getAddressInfo(this.address, 0);
    let amount = new BN("0", 10);
    beneficiaries = beneficiaries.map((output) => {
      return {
        address: output.address,
        amount: this.amountInSmallestUnit(output.amount),
        type: output.type ?? "0",
      };
    });
    beneficiaries.forEach((output) => {
      amount = amount.add(output.amount);
    });
    let addressInputs = this.getAddressInputFromJson(addressInfo);
    addressInputs.sort((a, b) => a.amount - b.amount);
    let inputs = [];
    let inputsAmount = new BN("0", 10);
    const MAX_INPUTS = 255; // Maximum number of inputs allowed in a transaction

    for (const txInput of addressInputs) {
      // Enforce maximum input limit
      if (inputs.length >= MAX_INPUTS) {
        throw new Error(
          `Reached maximum input limit (${MAX_INPUTS}). Please consolidate your UTXOs using a smaller transaction first, or reduce the amount you are trying to send.`
        );
      }

      inputs.push(this.getInput(txInput.tx_hash, txInput.index));
      inputsAmount = inputsAmount.add(
        this.amountInSmallestUnit(parseFloat(txInput.amount))
      );
      if (inputsAmount.gte(amount)) {
        break;
      }
    }

    if (inputsAmount.lt(amount)) {
      throw new Error("Not enough funds");
    }

    if (inputsAmount.gt(amount)) {
      beneficiaries.push({
        address: this.address,
        amount: inputsAmount.sub(amount),
        type: "0",
      });
    }
    let outputs = [];
    beneficiaries.forEach((beneficiary) => {
      outputs.push(
        this.getOutput(
          beneficiary.address,
          beneficiary.amount,
          beneficiary.type
        )
      );
    });

    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    inputs.forEach((input) => transactionData.push(input));
    transactionData.push(new Buffer.from(this.indexToByte(outputs.length, 1)));
    outputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return await this.completeTransaction({
      message,
      transactionData,
    });
  }

  async stakeTransaction(amount) {
    amount = this.amountInSmallestUnit(amount);
    const addressInfo = await this.get_address_info(
      this.address,
      true,
      true,
      true
    );

    let inputs = [];
    let inputsAmount = new BN("0", 10);

    addressInfo.spendable_outputs = addressInfo.spendable_outputs.sort(
      (a, b) => a.amount - b.amount
    );
    let i = 0;
    while (inputsAmount.lt(amount)) {
      let output = addressInfo.spendable_outputs[i];

      i++;

      if (typeof output === "undefined") break;

      if (addressInfo.pending_spent_outputs.includes(output.tx_hash)) {
        continue;
      }

      inputsAmount = inputsAmount.add(
        new BN(parseFloat(output.amount) * 100000000)
      );
      inputs.push(this.getInput(output.tx_hash, output.index));
    }

    if (inputs.length == 0) {
      throw new Error("No spendable outputs");
    }

    if (inputsAmount.lt(amount)) {
      throw new Error("Not enough funds");
    }

    let stake_inputs = [];
    let pending_hash = addressInfo.pending_spent_outputs.map((c) => {
      return c.tx_hash;
    });
    let pending_index = addressInfo.pending_spent_outputs.map((c) => {
      return c.index;
    });
    for (let so of addressInfo.stake_outputs) {
      if (pending_hash.includes(so.tx_hash) && pending_index.includes(so.index))
        continue;
      stake_inputs.push(this.getInput(so.tx_hash, so.index));
    }
    if (stake_inputs.length != 0) {
      throw new Error("Already staked");
    }

    let outputs = [this.getOutput(this.address, amount, "1")];

    if (inputsAmount.gt(amount)) {
      outputs.push(this.getOutput(this.address, inputsAmount.sub(amount), "0"));
    }

    let delegateAllPower = this.getDelegatesAllPower(addressInfo);

    if (!delegateAllPower.length) {
      outputs.push(
        this.getOutput(this.address, this.amountInSmallestUnit(10), "9")
      );
    }

    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    inputs.forEach((input) => transactionData.push(input));
    transactionData.push(new Buffer.from(this.indexToByte(outputs.length, 1)));
    outputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return await this.completeTransaction({ transactionData });
  }

  async unstakeTransaction() {
    const addressInfo = await this.get_address_info(
      this.address,
      true,
      true,
      true
    );
    let stake_inputs = [];
    let pending_hash = addressInfo.pending_spent_outputs.map((c) => {
      return c.tx_hash;
    });
    let pending_index = addressInfo.pending_spent_outputs.map((c) => {
      return c.index;
    });
    let amount;
    for (let so of addressInfo.stake_outputs) {
      if (pending_hash.includes(so.tx_hash) && pending_index.includes(so.index))
        continue;
      if (stake_inputs.length == 0) {
        amount = so.amount;
      }
      stake_inputs.push(this.getInput(so.tx_hash, so.index));
    }
    if (stake_inputs.length == 0) {
      throw new Error("No stake inputs");
    }

    let delegateSpentVotes = this.getDelegateSpentVotesFromJson(
      addressInfo,
      false
    );
    if (delegateSpentVotes.length != 0) {
      throw new Error("Kindly release the vote");
    }

    let pendingVoteAsDelegateTransaction =
      this.getPendingVoteAsDelegateTransactionFromJson(addressInfo);
    if (pendingVoteAsDelegateTransaction.length != 0) {
      throw new Error("Kindle release the vote vote transaction is in pending");
    }

    let inputs = [stake_inputs[0]];

    let outputs = [
      this.getOutput(this.address, this.amountInSmallestUnit(amount), 2),
    ];

    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    inputs.forEach((input) => transactionData.push(input));
    transactionData.push(new Buffer.from(this.indexToByte(outputs.length, 1)));
    outputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return await this.completeTransaction({ transactionData });
  }

  async registerInode() {
    let amount = this.amountInSmallestUnit(1000);
    let resultJson = await this.get_address_info(
      this.address,
      true,
      false,
      false,
      true,
      true,
      true
    );
    let inputs = this.getAddressInputFromJson(resultJson);
    if (inputs.length == 0) {
      throw new Error("No spendable outputs");
    }
    let totalAmount = this.amountInSmallestUnit(0);
    inputs.forEach((i) => {
      totalAmount = totalAmount.add(this.amountInSmallestUnit(i.amount));
    });
    if (totalAmount.lt(amount)) {
      throw new Error("You dont have enough funds");
    }
    let stakeInputs = this.getStakeInputFromJson(resultJson);
    if (stakeInputs.length == 0) {
      throw new Error("You are not a delegate . Become a delegate by staking");
    }

    let is_inode_registered = resultJson.is_inode_registered;
    if (is_inode_registered) {
      throw new Error("This address is already registered as inode");
    }

    if (resultJson.is_validator) {
      throw new Error(
        "This address is already registered as vallidator and can not be inode"
      );
    }

    let inode_addressess = await this.getDobbyInfo();
    if (inode_addressess.length >= MAX_INODES) {
      throw new Error(`${MAX_INODES} already registered`);
    }

    let transactionInputs = [];
    let transactionAmount = this.amountInSmallestUnit(0);
    for (let txInput of inputs.sort((a, b) => b.amount - a.amount)) {
      if (transactionAmount.gt(amount)) {
        transactionAmount = transactionAmount.add(
          this.amountInSmallestUnit(txInput.amount)
        );
        transactionInputs.push(this.getInput(txInput.tx_hash, txInput.index));
        break;
      }
    }
    if (transactionInputs.length == 0) {
      for (let txInput of inputs.sort((a, b) => a.amount - b.amount)) {
        transactionAmount = transactionAmount.add(
          this.amountInSmallestUnit(txInput.amount)
        );
        transactionInputs.push(this.getInput(txInput.tx_hash, txInput.index));
      }
    }
    let transactionOutputs = [];
    transactionOutputs.push(this.getOutput(this.address, amount, 3));
    if (transactionAmount.gt(amount)) {
      transactionOutputs.push(
        this.getOutput(this.address, transactionAmount.sub(amount), 0)
      );
    }

    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    transactionInputs.forEach((input) => transactionData.push(input));
    transactionData.push(
      new Buffer.from(this.indexToByte(transactionOutputs.length, 1))
    );
    transactionOutputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return await this.completeTransaction({ transactionData });
  }

  async deRegisterInode() {
    let result_json = await this.get_address_info(
      this.address,
      false,
      false,
      false,
      false,
      true
    );

    let inputs = this.getInodeRegistrationInputFromJson(result_json);
    if (inputs.length == 0) {
      throw new Error("This address is not registered as an inode.");
    }
    let activeInodeAddresses = await this.getDobbyInfo();
    const isNodeActive = activeInodeAddresses.some(
      (entry) => entry.wallet === this.address
    );
    if (isNodeActive) {
      throw new Error("This address is an active inode. Cannot de-register.");
    }
    let amount = inputs[0].amount;
    let outputs = [this.getOutput(this.address, amount, 4)];
    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
    ];
    inputs.forEach((input) => transactionData.push(input));
    transactionData.push(new Buffer.from(this.indexToByte(outputs.length, 1)));
    outputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return this.completeTransaction({ transactionData });
  }

  async registerValidator() {
    let amount = this.amountInSmallestUnit(100);
    let resultJson = await this.get_address_info(
      this.address,
      true,
      false,
      false,
      true
    );
    let inputs = this.getAddressInputFromJson(resultJson);
    if (inputs.length == 0) {
      throw new Error(" NO spendable outputs");
    }
    let totalAmount = this.amountInSmallestUnit(0);
    inputs.forEach((i) => {
      totalAmount = totalAmount.add(this.amountInSmallestUnit(i.amount));
    });
    if (totalAmount.lt(amount)) {
      throw new Error("You dont have enough funds");
    }
    let stakeInputs = this.getStakeInputFromJson(resultJson);
    if (stakeInputs.length == 0) {
      throw new Error("You are not a delegate . Become a delegate by staking");
    }
    let is_inode_registered = resultJson.is_inode_registered;
    if (is_inode_registered) {
      throw new Error(
        " This address is already registered as inode cannot be a validator"
      );
    }

    if (resultJson.is_validator) {
      throw new Error("This address is already registered as vallidator ");
    }

    let transactionInputs = [];
    let transactionAmount = this.amountInSmallestUnit(0);
    for (let txInput of inputs.sort((a, b) => b.amount - a.amount)) {
      if (transactionAmount.gt(amount)) {
        transactionAmount = transactionAmount.add(
          this.amountInSmallestUnit(txInput.amount)
        );
        transactionInputs.push(this.getInput(txInput.tx_hash, txInput.index));
        break;
      }
    }
    if (transactionInputs.length == 0) {
      for (let txInput of inputs.sort((a, b) => a.amount - b.amount)) {
        transactionAmount = transactionAmount.add(
          this.amountInSmallestUnit(txInput.amount)
        );
        transactionInputs.push(this.getInput(txInput.tx_hash, txInput.index));
      }
    }
    let transactionOutputs = [];
    transactionOutputs.push(this.getOutput(this.address, amount, 5));
    transactionOutputs.push(
      this.getOutput(this.address, this.amountInSmallestUnit(10), 8)
    );

    if (transactionAmount.gt(amount)) {
      transactionOutputs.push(
        this.getOutput(this.address, transactionAmount.sub(amount), 0)
      );
    }

    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    transactionInputs.forEach((input) => transactionData.push(input));
    transactionData.push(
      new Buffer.from(this.indexToByte(transactionOutputs.length, 1))
    );
    transactionOutputs.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    return await this.completeTransaction({ transactionData, message: "5" });
  }

  async vote(votingRange, receipent) {
    if (votingRange > 10) {
      throw new Error(
        "Invalid voting range voting range should be less than 10"
      );
    }
    if (votingRange <= 0) {
      throw new Error(
        "Invalid voting range voting range should be greater than 0"
      );
    }
    let resultJson = await this.get_address_info(
      this.address,
      true,
      true,
      true,
      true,
      true,
      true
    );

    let is_inode_registered = resultJson.is_inode_registered;
    if (is_inode_registered) {
      throw new Error("This address registered as inode cannot vote");
    }

    votingRange = this.amountInSmallestUnit(votingRange);
    let inputs;
    if (resultJson.is_validator) {
      inputs = this.getValidatorUnspentVotesFromJson(resultJson);
    } else {
      inputs = this.getDelegateUnspentVotesFromJson(resultJson);
    }
    if (inputs.length == 0) {
      throw new Error("No voting outputs");
    }
    let totalAmount = this.amountInSmallestUnit(0);
    inputs.forEach((i) => {
      totalAmount = totalAmount.add(this.amountInSmallestUnit(i.amount));
    });
    if (totalAmount.lt(votingRange)) {
      throw new Error(
        "Error: You don't have enough voting power left. Kindly release some voting power."
      );
    }
    let transactionInput = this.selectTransactionInput(inputs, votingRange);
    let transactionVoteRange = this.amountInSmallestUnit(0);
    transactionInput.forEach((t) => {
      transactionVoteRange = transactionVoteRange.add(
        this.amountInSmallestUnit(t.amount)
      );
    });
    transactionInput = transactionInput.map((i) =>
      this.getInput(i.tx_hash, i.index)
    );
    let transactionOutput = [
      this.getOutput(receipent, votingRange, resultJson.is_validator ? 6 : 7),
    ];
    if (transactionVoteRange.gt(votingRange)) {
      transactionOutput.push(
        this.getOutput(
          this.address,
          transactionVoteRange.sub(votingRange),
          resultJson.is_validator ? 8 : 9
        )
      );
    }
    let transactionData = [
      new Buffer.from(this.indexToByte(this.version, 1)),
      new Buffer.from(this.indexToByte(inputs.length, 1)),
      // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
    ];
    transactionInput.forEach((input) => transactionData.push(input));
    transactionData.push(
      new Buffer.from(this.indexToByte(transactionOutput.length, 1))
    );
    transactionOutput.forEach((output) => transactionData.push(output));
    transactionData = transactionData.map((t) => {
      return t.toString("hex");
    });
    let message = resultJson.is_validator ? "6" : "7";
    return this.completeTransaction({ transactionData, message });
  }

  async revoke(revokeFrom) {
    let resultJson = await this.get_address_info(
      this.address,
      true,
      true,
      true,
      true,
      true,
      true
    );
    let isValidatorRegistered = resultJson.is_validator;
    if (isValidatorRegistered) {
      let inodeBallot = await this.getValidatorsInfo(revokeFrom);
      let inodeBallotInputs = this.getInodeBallotInputByAddressFromJson(
        inodeBallot,
        revokeFrom,
        resultJson.pending_spent_outputs
      );
      if (inodeBallotInputs.length == 0) {
        throw new Error("You have not voted");
      }
      let message = "8";
      let sumOfVotes = new BN("0", 10);
      inodeBallotInputs.forEach((i) => {
        sumOfVotes = sumOfVotes.add(this.amountInSmallestUnit(i.amount));
      });
      inodeBallotInputs = inodeBallotInputs.map((i) => {
        return this.getInput(i.tx_hash, i.index);
      });
      let inodeBallotOutputs = [this.getOutput(this.address, sumOfVotes, "8")];
      let transactionData = [
        new Buffer.from(this.indexToByte(this.version, 1)),
        new Buffer.from(this.indexToByte(inodeBallotInputs.length, 1)),
        // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
      ];
      inodeBallotInputs.forEach((input) => transactionData.push(input));
      transactionData.push(
        new Buffer.from(this.indexToByte(inodeBallotOutputs.length, 1))
      );
      inodeBallotOutputs.forEach((output) => transactionData.push(output));
      transactionData = transactionData.map((t) => {
        return t.toString("hex");
      });
      return this.completeTransaction({ message, transactionData });
    } else {
      let validatorBallot = await this.getDelegatesInfo(revokeFrom);
      let validatorBallotInputs = this.getValidatorBallotInputByAddressFromJson(
        validatorBallot,
        revokeFrom,
        resultJson.pending_spent_outputs
      );
      if (validatorBallotInputs.length == 0) {
        throw new Error("You have not voted");
      }
      let message = "9";
      let sumOfVotes = 0;
      validatorBallotInputs.forEach((i) => {
        sumOfVotes += i.amount;
      });
      validatorBallotInputs = validatorBallotInputs.map((i) => {
        return this.getInput(i.tx_hash, i.index);
      });
      let validatorBallotOutputs = [
        this.getOutput(
          this.address,
          this.amountInSmallestUnit(sumOfVotes),
          "9"
        ),
      ];
      let transactionData = [
        new Buffer.from(this.indexToByte(this.version, 1)),
        new Buffer.from(this.indexToByte(validatorBallotInputs.length, 1)),
        // new Buffer.from(this.indexToByte(this.transaction_type, 1)),
      ];
      validatorBallotInputs.forEach((input) => transactionData.push(input));
      transactionData.push(
        new Buffer.from(this.indexToByte(validatorBallotOutputs.length, 1))
      );
      validatorBallotOutputs.forEach((output) => transactionData.push(output));
      console.log(
        transactionData,
        validatorBallotInputs,
        validatorBallotOutputs
      );
      transactionData = transactionData.map((t) => {
        return t.toString("hex");
      });
      return this.completeTransaction({ message, transactionData });
    }
  }
}

export default Wallet;
