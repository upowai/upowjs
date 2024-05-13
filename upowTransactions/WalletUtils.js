import { Buffer } from "buffer";
import { binary_to_base58, base58_to_binary } from "base58-js";
import elliptic from "elliptic";
import BN from "bn.js";
import BigNumber from "bignumber.js";

export default class WalletUtil {
  constructor(privateKey, endpoint) {
    this.version = 3;
    this.transaction_type = 0;
    this.inputType = "0";

    this.endpoint = endpoint;

    if (privateKey !== "") {
      this.privateKey = privateKey;
      this.address = this.getAddressFromPrivate(privateKey);
    }
  }

  getAddressFromPrivate(privateKey = this.privateKey) {
    let elp = elliptic.ec("p256");
    const pkey = new BN(new BigNumber(privateKey, 16).toString(10));
    let key = elp.keyFromPrivate(pkey);
    let publicKey = key.getPublic();

    let y = this.indexToByte(publicKey.getY().isEven() ? 42 : 43, 1);
    let x = publicKey.getX().toArray().reverse();

    return binary_to_base58([].concat(y).concat(x));
  }

  getInput(tx, index) {
    let bf1 = new Buffer.from(tx, "hex");
    let bf2 = new Buffer.from(this.indexToByte(index, 1));
    let bf3 = new Buffer.from(this.indexToByte(0, 1));
    let result = Buffer.concat([bf1, bf2, bf3]);

    return result;
  }

  getOutput(address, amount, type) {
    let addressBuffer = this.getBase58Address(address);
    let bytes_count = this.bytes_needed(amount);
    let bf1 = Buffer.from([bytes_count]);
    let bf2 = Buffer.from(this.numberToBytes(amount, bytes_count));
    let typeBuffer = Buffer.from(this.indexToByte(parseInt(type), 1));
    let result = Buffer.concat([addressBuffer, bf1, bf2, typeBuffer]);
    return result;
  }

  getBase58Address(address) {
    return base58_to_binary(address);
  }

  stringToPoint(s) {
    return this.bytesToPoint(Buffer.from(s));
  }

  bytesToPoint(pointBytes) {
    const x = BigInt("0x" + pointBytes.slice(0, 32).reverse().toString("hex"));
    const y = BigInt("0x" + pointBytes.slice(32).reverse().toString("hex"));
    return { x, y };
  }

  indexToByte(index, b) {
    let bytes = [];
    let i = b;
    do {
      bytes[--i] = index & 255;
      index = index >> 8;
    } while (i);
    return bytes.reverse();
  }

  numberToBytes(number) {
    const len = Math.ceil(Math.log2(number) / 8);
    const byteArray = new Uint8Array(len);

    for (let index = 0; index < byteArray.length; index++) {
      const byte = number & 0xff;
      byteArray[index] = byte;
      number = (number - byte) / 256;
    }

    return byteArray;
  }

  bytes_needed(n) {
    if (n === 0) return 1;
    return Math.ceil(Math.log(n) / Math.log(256));
  }

  amountInSmallestUnit(amount) {
    return new BN(amount).mul(new BN(100000000));
  }

  getPublickey(publicKey) {
    let y = this.indexToByte(publicKey.getY().isEven() ? 42 : 43, 1);
    let x = publicKey.getX().toArray().reverse();

    return binary_to_base58([].concat(y).concat(x));
  }
}
