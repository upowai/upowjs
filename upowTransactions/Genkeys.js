import bs58 from "bs58";
import ec from "elliptic";
import { Buffer } from "buffer";

const ENDIAN = "le";
const CURVE_NAME = "p256";

const AddressFormat = {
  FULL_HEX: "hex",
  COMPRESSED: "compressed",
};

const ecInstance = new ec.ec(CURVE_NAME);

function bigintToBytes(num, length, endian) {
  if (length < 1 || length > 32) {
    throw new Error("Length must be between 1 and 32");
  }

  const result = new Uint8Array(length);

  if (endian === "le") {
    for (let i = 0; i < length; i++) {
      result[i] = Number(num & 0xffn);
      num >>= 8n;
    }
  } else if (endian === "big") {
    for (let i = length - 1; i >= 0; i--) {
      result[i] = Number(num & 0xffn);
      num >>= 8n;
    }
  } else {
    throw new Error('Invalid endian. Use "little" or "big".');
  }

  if (num !== 0n) {
    throw new Error("Integer too large to convert to bytes");
  }

  return result;
}

function pointToBytes(point, addressFormat = AddressFormat.FULL_HEX) {
  if (addressFormat === AddressFormat.FULL_HEX) {
    return Buffer.concat([
      Buffer.from(point.getX().toArray(ENDIAN, 32)),
      Buffer.from(point.getY().toArray(ENDIAN, 32)),
    ]);
  } else if (addressFormat === AddressFormat.COMPRESSED) {
    return stringToBytes(pointToString(point, AddressFormat.COMPRESSED));
  } else {
    throw new Error("Not Implemented");
  }
}

function pointToString(point, addressFormat = AddressFormat.COMPRESSED) {
  switch (addressFormat) {
    case AddressFormat.FULL_HEX:
      const pointBytes = pointToBytes(point);
      return pointBytes.toString("hex");

    case AddressFormat.COMPRESSED:
      const x = BigInt(point.getX().toString(10, 64));
      const y = BigInt(point.getY().toString(10, 64));
      const specifier = y % 2n === 0n ? 42 : 43;

      const address = bs58.encode(
        Buffer.concat([
          Buffer.from([specifier]),
          Buffer.from(bigintToBytes(x, 32, ENDIAN)),
        ])
      );

      return address;

    default:
      throw new Error("Not Implemented");
  }
}

function generateKeys() {
  const keyPair = ecInstance.genKeyPair();

  const privateKeyBigInteger = keyPair.getPrivate();

  const privateKey = keyPair.getPrivate("hex");
  const publicKey = ecInstance.keyFromPrivate(privateKey).getPublic();
  const address = pointToString(publicKey);
  const publicKeyHex =
    "04" +
    publicKey.getX().toString(16, 64) +
    publicKey.getY().toString(16, 64);

  // Return the keys instead of logging them
  return {
    privateKey,
    address,
  };
}

export {
  generateKeys,
  AddressFormat,
  pointToString,
  pointToBytes,
  bigintToBytes,
};
