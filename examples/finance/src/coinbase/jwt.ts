import { randomBytes, sign as cryptoSign } from "node:crypto";

const base64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export const signCoinbaseWebSocketJwt = (input: {
  keyName: string;
  privateKey: string;
  nowSeconds?: number;
}) => {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = {
    typ: "JWT",
    alg: "ES256",
    kid: input.keyName,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload = {
    iss: "cdp",
    nbf: nowSeconds,
    exp: nowSeconds + 120,
    sub: input.keyName,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: input.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64Url(signature)}`;
};
