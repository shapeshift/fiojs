import {checkEncrypt, checkDecrypt} from './encryption-check';
import * as ser from './chain-serialize';
import { PrivateKey, isExternalPrivateKey } from './chain-jssig';

const {PublicKey, PrivateKey: EccPrivateKey} = require('./ecc');
const fioAbi = require('../src/encryption-fio.abi.json');
const createHmac = require('create-hmac')

const fioTypes = ser.getTypesFromAbi(ser.createInitialTypes(), fioAbi);

/** Convert `value` to binary form. `type` must be a built-in abi type. */
export function serialize(serialBuffer : ser.SerialBuffer, type: string, value: any) : void {
    fioTypes.get(type).serialize(serialBuffer, value);
}

/** Convert data in `buffer` to structured form. `type` must be a built-in abi type. */
export function deserialize(serialBuffer: ser.SerialBuffer, type: string): any {
    return fioTypes.get(type).deserialize(serialBuffer);
}

export async function createSharedCipher({privateKey, publicKey, textEncoder, textDecoder} = {} as {privateKey: PrivateKey, publicKey: any, textEncoder? : TextEncoder, textDecoder? : TextDecoder}) : Promise<SharedCipher> {
    publicKey = PublicKey(publicKey);

    let sharedSecret: Buffer;
    if (isExternalPrivateKey(privateKey)) {
        sharedSecret = await privateKey.getSharedSecret(publicKey);
    } else {
        sharedSecret = EccPrivateKey(privateKey).getSharedSecret(publicKey);
    }
    return new SharedCipher({sharedSecret, textEncoder, textDecoder});
}

class SharedCipher {
    sharedSecret : Buffer;
    textEncoder? : TextEncoder;
    textDecoder? : TextDecoder;

    constructor({sharedSecret, textEncoder, textDecoder} = {} as {sharedSecret : Buffer, textEncoder? : TextEncoder, textDecoder? : TextDecoder}) {
        this.sharedSecret = sharedSecret;
        this.textEncoder = textEncoder;
        this.textDecoder = textDecoder;
    }

    /**
        Encrypt the content of a FIO message.

        @arg {string} fioContentType - `new_funds_content`, etc
        @arg {object} content
        @arg {Buffer} [IV = randomBytes(16)] - An unpredictable strong random value
            is required and supplied by default.  Unit tests may provide a static value
            to achieve predictable results.
        @return {string} cipher base64
    */
    encrypt(fioContentType: string, content: any, IV? : Buffer) : string {
        const buffer = new ser.SerialBuffer({ textEncoder: this.textEncoder, textDecoder: this.textDecoder });
        serialize(buffer, fioContentType, content);
        const message = Buffer.from(buffer.asUint8Array());
        const cipherbuffer = checkEncrypt(this.sharedSecret, message, IV);
        // checkDecrypt(this.sharedSecret, cipherbuffer);
        return cipherbuffer.toString('base64')
    }

    /**
        Decrypt the content of a FIO message.

        @arg {string} fioContentType - `new_funds_content`, etc
        @arg {object} content - cipher base64
        @return {object} decrypted FIO object
    */
    decrypt(fioContentType: string, content: string) : any {
        const message = checkDecrypt(this.sharedSecret, Buffer.from(content, 'base64'));
        const messageArray = Uint8Array.from(message);
        const buffer = new ser.SerialBuffer({ array: messageArray, textEncoder: this.textEncoder, textDecoder: this.textDecoder });
        return deserialize(buffer, fioContentType);
    }

    /**
        @example hashA(PublicKey.toBuffer())
        @arg {string|Buffer} key buffer
        @return {string} hex, one-way hash unique to this SharedCipher and key
    */
    hashA(key: Buffer) : String {
        const hash = createHmac('sha1', this.sharedSecret).update(key).digest()
        return '0x' + hash.slice(0, 16).toString('hex')
    }
}
