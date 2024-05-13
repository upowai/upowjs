import WalletRepo from "./WalletRepo.js";

export default class walletHelper extends WalletRepo {
  constructor(privateKey, endpoint) {
    super(privateKey, endpoint);
  }

  getInodeBallotInputByAddressFromJson(
    json,
    inodeAddress,
    pendingSpentOutputs = [],
    checkPendingTxs = true
  ) {
    const address = this.address;
    const inodeBallotInputs = [];

    // Convert pendingSpentOutputs to array of tuples if checkPendingTxs is true
    if (checkPendingTxs) {
      pendingSpentOutputs = pendingSpentOutputs.map((output) => [
        output.tx_hash,
        output.index,
      ]);
    } else {
      pendingSpentOutputs = [];
    }

    for (const validatorInfo of json) {
      if (validatorInfo.validator === address) {
        for (const validatorVotedFor of validatorInfo.vote) {
          if (
            pendingSpentOutputs.some(
              (output) =>
                output[0] === validatorVotedFor.tx_hash &&
                output[1] === validatorVotedFor.index
            )
          ) {
            continue;
          }
          if (validatorVotedFor.wallet !== inodeAddress) {
            continue;
          }
          const txInput = {
            tx_hash: validatorVotedFor.tx_hash,
            index: validatorVotedFor.index,
            amount: parseFloat(validatorVotedFor.vote_count),
            public_key: this.stringToPoint(address),
          };
          inodeBallotInputs.push(txInput);
        }
      }
    }
    return inodeBallotInputs;
  }

  getValidatorBallotInputByAddressFromJson(
    json,
    validatorAddress,
    pendingSpentOutputs = [],
    checkPendingTxs = true
  ) {
    let address = this.address;
    const validatorBallotInputs = [];

    // Convert pendingSpentOutputs to array of tuples if checkPendingTxs is true
    if (checkPendingTxs) {
      pendingSpentOutputs = pendingSpentOutputs.map((output) => [
        output.tx_hash,
        output.index,
      ]);
    } else {
      pendingSpentOutputs = [];
    }

    for (const delegateInfo of json) {
      if (delegateInfo.delegate === address) {
        for (const delegateVotedFor of delegateInfo.vote) {
          if (
            pendingSpentOutputs.some(
              (output) =>
                output[0] === delegateVotedFor.tx_hash &&
                output[1] === delegateVotedFor.index
            )
          ) {
            continue;
          }
          if (delegateVotedFor.wallet !== validatorAddress) {
            continue;
          }
          const txInput = {
            tx_hash: delegateVotedFor.tx_hash,
            index: delegateVotedFor.index,
            amount: parseFloat(delegateVotedFor.vote_count),
            public_key: this.stringToPoint(address), // Assuming stringToPoint is defined elsewhere
          };
          validatorBallotInputs.push(txInput);
        }
      }
    }
    return validatorBallotInputs;
  }

  getAddressInputsFromJson(result) {
    const pendingSpentOutputs = result.pending_spent_outputs.map((output) => ({
      txHash: output.tx_hash,
      index: output.index,
    }));

    const txInputs = [];
    for (const spendableTxInput of result.spendable_outputs) {
      const key = {
        txHash: spendableTxInput.tx_hash,
        index: spendableTxInput.index,
      };

      if (
        pendingSpentOutputs.some(
          (output) => output.txHash === key.txHash && output.index === key.index
        )
      ) {
        continue;
      }

      const txInput = {
        txHash: spendableTxInput.tx_hash,
        index: spendableTxInput.index,
        amount: parseFloat(spendableTxInput.amount),
      };
      txInputs.push(txInput);
    }

    return txInputs;
  }

  selectTransactionInput(inputs, amount) {
    const sortedInputsAsc = inputs.sort((a, b) => a.amount - b.amount);
    const sortedInputsDesc = inputs.sort((a, b) => b.amount - a.amount);
    const transactionInputs = [];

    // Select inputs with amount >= required amount
    for (const txInput of sortedInputsAsc) {
      if (txInput.amount >= amount) {
        transactionInputs.push(txInput);
        break;
      }
    }

    // If the sum of selected inputs is still less than required amount, select inputs in descending order until it's sufficient
    for (const txInput of sortedInputsDesc) {
      if (
        transactionInputs.reduce((sum, input) => sum + input.amount, 0) >=
        amount
      ) {
        break;
      }
      transactionInputs.push(txInput);
    }

    return transactionInputs;
  }

  getAddressInputFromJson(result) {
    const pendingSpentOutputs = result.pending_spent_outputs.map((output) => [
      output.tx_hash,
      output.index,
    ]);
    const txInputs = [];

    for (const spendableTxInput of result.spendable_outputs) {
      const txHash = spendableTxInput.tx_hash;
      const index = spendableTxInput.index;

      if (
        pendingSpentOutputs.some(
          ([hash, idx]) => hash === txHash && idx === index
        )
      ) {
        continue;
      }

      const txInput = {
        tx_hash: txHash,
        index: index,
        amount: parseFloat(spendableTxInput.amount),
      };
      txInputs.push(txInput);
    }

    return txInputs;
  }

  getStakeInputFromJson(result, checkPendingTxs = true) {
    const address = this.address;
    const pendingSpentOutputs = checkPendingTxs
      ? result.pending_spent_outputs.map((output) => [
          output.tx_hash,
          output.index,
        ])
      : [];
    const stakeTxInput = [];

    if (result.stake_outputs) {
      for (const stakeTxOutput of result.stake_outputs) {
        const txHash = stakeTxOutput.tx_hash;
        const index = stakeTxOutput.index;

        if (
          !checkPendingTxs ||
          !pendingSpentOutputs.some(
            ([hash, idx]) => hash === txHash && idx === index
          )
        ) {
          const txInput = {
            tx_hash: txHash,
            index: index,
            amount: parseFloat(stakeTxOutput.amount),
            public_key: this.stringToPoint(address),
          };
          stakeTxInput.push(txInput);
        }
      }
    }

    return stakeTxInput;
  }

  getDelegateUnspentVotesFromJson(json, checkPendingTxs = true) {
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map((output) => [
          output.tx_hash,
          output.index,
        ])
      : [];
    const delegateVoteTxInput = [];

    if (json.delegate_unspent_votes) {
      for (const delegateUnspentVotes of json.delegate_unspent_votes) {
        const { tx_hash, index } = delegateUnspentVotes;

        if (
          pendingSpentOutputs.some(
            ([hash, idx]) => hash === tx_hash && idx === index
          )
        ) {
          continue;
        }

        const txInput = {
          tx_hash,
          index,
          amount: parseFloat(delegateUnspentVotes.amount),
        };

        delegateVoteTxInput.push(txInput);
      }
    }

    return delegateVoteTxInput;
  }

  getDelegateSpentVotesFromJson(json, checkPendingTxs = true) {
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map((output) => [
          output.tx_hash,
          output.index,
        ])
      : [];
    const delegateVoteTxInput = [];

    if (json.delegate_spent_votes) {
      for (const delegateSpentVote of json.delegate_spent_votes) {
        const { tx_hash, index } = delegateSpentVote;

        if (
          pendingSpentOutputs.some(
            ([hash, idx]) => hash === tx_hash && idx === index
          )
        ) {
          continue;
        }

        const txInput = {
          tx_hash,
          index,
          amount: parseFloat(delegateSpentVote.amount),
        };

        delegateVoteTxInput.push(txInput);
      }
    }

    return delegateVoteTxInput;
  }

  getValidatorUnspentVotesFromJson(json, checkPendingTxs = true) {
    let address = this.address;
    const pendingSpentOutputs = checkPendingTxs
      ? json.pending_spent_outputs.map((output) => [
          output.tx_hash,
          output.index,
        ])
      : [];
    const validatorVoteTxInput = [];

    if (json.validator_unspent_votes) {
      for (const validatorUnspentVotes of json.validator_unspent_votes) {
        const { tx_hash, index } = validatorUnspentVotes;

        if (
          pendingSpentOutputs.some(
            ([hash, idx]) => hash === tx_hash && idx === index
          )
        ) {
          continue;
        }

        const txInput = {
          tx_hash,
          index,
          amount: parseFloat(validatorUnspentVotes.amount),
          public_key: this.stringToPoint(address),
        };

        validatorVoteTxInput.push(txInput);
      }
    }

    return validatorVoteTxInput;
  }

  getDelegatesAllPower(json) {
    let delegatesUnspentVotes = this.getDelegateUnspentVotesFromJson(
      json,
      false
    );
    let delegatesSpentVotes = this.getDelegateSpentVotesFromJson(json, false);
    delegatesUnspentVotes.push(...delegatesSpentVotes);

    let totalVotes = delegatesUnspentVotes.reduce(
      (total, delegateVotes) => total + delegateVotes.amount,
      0
    );
    if (totalVotes > 10) {
      throw new Error("Total votes exceed the limit of 10.");
    }

    return delegatesUnspentVotes;
  }

  getPendingVoteAsDelegateTransactionFromJson(json) {
    let address = this.address;
    const pendingTransactions = json.pending_transactions;
    const pendingVoteAsDelegateTransaction = [];

    for (const tx of pendingTransactions) {
      if (
        tx.transaction_type === "VOTE_AS_DELEGATE" &&
        tx.inputs[0].address === address
      ) {
        pendingVoteAsDelegateTransaction.push(tx);
      }
    }

    return pendingVoteAsDelegateTransaction;
  }

  getInodeRegistrationInputFromJson(json) {
    const address = this.address;

    const pendingSpentOutputs = json.pending_spent_outputs.map((output) => [
      output.tx_hash,
      output.index,
    ]);
    const inodeRegistrationInput = [];

    if (json.inode_registration_outputs) {
      for (const inodeRegOutput of json.inode_registration_outputs) {
        const txHash = inodeRegOutput.tx_hash;
        const index = inodeRegOutput.index;

        if (
          pendingSpentOutputs.some(
            ([hash, idx]) => hash === txHash && idx === index
          )
        ) {
          continue;
        }

        const txInput = {
          tx_hash: txHash,
          index: index,
          amount: parseFloat(inodeRegOutput.amount),
          public_key: this.stringToPoint(address),
        };
        inodeRegistrationInput.push(txInput);
      }
    }

    return inodeRegistrationInput;
  }
}
