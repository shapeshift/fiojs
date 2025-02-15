/**
 * @module JS-Sig
 */
// copyright defined in fiojs/LICENSE.txt

import { SignatureProvider, SignatureProviderArgs } from './chain-api-interfaces';
import { convertLegacyPublicKey } from './chain-numeric';

const ecc = require('./ecc');

function hexToUint8Array(hex: string) {
    if (typeof hex !== 'string') {
        throw new Error('Expected string containing hex digits');
    }
    if (hex.length % 2) {
        throw new Error('Odd number of hex digits');
    }
    const l = hex.length / 2;
    const result = new Uint8Array(l);
    for (let i = 0; i < l; ++i) {
        const x = parseInt(hex.substr(i * 2, 2), 16);
        if (Number.isNaN(x)) {
            throw new Error('Expected hex string');
        }
        result[i] = x;
    }
    return result;
}

export interface ExternalPrivateKey {
    publicKey: string;
    sign(signBuf: ArrayBuffer): Promise<string>;
    getSharedSecret(publicKey: any): Promise<Buffer>;
}

export function isExternalPrivateKey(x: any): x is ExternalPrivateKey {
    return (typeof x === "object" || typeof x === "function")
        && "publicKey" in x && typeof x.publicKey === "string"
        && "sign" in x && typeof x.sign === "function"
        && "getSharedSecret" in x && typeof x.getSharedSecret === "function";
}

export type PrivateKey = string | ExternalPrivateKey;

/** Signs transactions using in-process private keys */
export class JsSignatureProvider implements SignatureProvider {
    /** map public to private keys */
    public keys = new Map<string, PrivateKey>();

    /** public keys */
    public availableKeys = [] as string[];

    /** @param privateKeys private keys to sign with */
    constructor(privateKeys: PrivateKey[]) {
        for (const k of privateKeys) {
	    const pub = convertLegacyPublicKey(isExternalPrivateKey(k) ? k.publicKey : ecc.PrivateKey.fromString(k).toPublic().toString());
            this.keys.set(pub, k);
            this.availableKeys.push(pub);
        }
    }

    /** Public keys associated with the private keys that the `SignatureProvider` holds */
    public async getAvailableKeys() {
        return this.availableKeys;
    }

    /** Sign a transaction */
    public async sign(
        { chainId, requiredKeys, serializedTransaction, serializedContextFreeData }: SignatureProviderArgs
    ) {
        const signBuf = Buffer.concat([
            new Buffer(chainId, 'hex'),
            new Buffer(serializedTransaction),
            new Buffer(
                serializedContextFreeData ?
                    hexToUint8Array(ecc.sha256(serializedContextFreeData)) :
                    new Uint8Array(32)
            ),
        ]);
        const signatures = await Promise.all(requiredKeys.map(
            async (pub) => {
                const priv = this.keys.get(convertLegacyPublicKey(pub));
                if (isExternalPrivateKey(priv)) return await priv.sign(signBuf);
                return ecc.Signature.sign(signBuf, priv).toString();
	        },
        ));
        return { signatures, serializedTransaction, serializedContextFreeData };
    }
}
