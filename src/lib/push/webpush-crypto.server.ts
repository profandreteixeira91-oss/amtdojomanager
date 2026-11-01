// Web Push no padrão atual, só com Web Crypto (roda no Cloudflare Workers):
// - criptografia do conteúdo: RFC 8291 (Content-Encoding: aes128gcm), exigida
//   pelo push da Apple e aceita por Google (FCM) e Mozilla;
// - identificação do servidor: VAPID, RFC 8292 (Authorization: vapid t=…, k=…).

export type VapidConfig = {
  subject: string;
  /** Chave pública P-256 sem compressão (65 bytes), base64url. */
  publicKey: string;
  /** Chave privada P-256 (32 bytes, "d"), base64url. */
  privateKey: string;
};

export type BrowserSubscription = {
  endpoint: string;
  /** Chave pública do navegador (65 bytes), base64url. */
  p256dh: string;
  /** Segredo de autenticação do navegador (16 bytes), base64url. */
  auth: string;
};

/** Bytes sobre ArrayBuffer comum (o que Web Crypto e fetch aceitam). */
type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Bytes): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Bytes {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** HKDF-SHA-256 com saída de até 32 bytes (um bloco), como no RFC 8291. */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/** Cifra o conteúdo para um navegador (RFC 8291, um único registro aes128gcm). */
export async function encryptPayload(sub: BrowserSubscription, plaintext: Bytes): Promise<Bytes> {
  const uaPublic = base64UrlDecode(sub.p256dh);
  const authSecret = base64UrlDecode(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) {
    throw new Error("Inscrição de push inválida (p256dh/auth)");
  }

  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as EcdhKeyDeriveParams, asKeys.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // Registro único: conteúdo + delimitador 0x02 (último registro), sem preenchimento.
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** Cabeçalho Authorization VAPID (JWT ES256) para a origem do endpoint. */
export async function vapidAuthorization(endpoint: string, vapid: VapidConfig): Promise<string> {
  const publicKey = base64UrlDecode(vapid.publicKey);
  if (publicKey.length !== 65) throw new Error("VAPID_PUBLIC_KEY inválida");
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: vapid.privateKey,
      x: base64UrlEncode(publicKey.slice(1, 33)),
      y: base64UrlEncode(publicKey.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, encoder.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

/** Monta a requisição HTTP de envio de um push para um navegador. */
export async function buildWebPushRequest(
  sub: BrowserSubscription,
  payload: string,
  vapid: VapidConfig,
  ttlSeconds: number,
): Promise<{ method: "POST"; headers: Record<string, string>; body: Bytes }> {
  const body = await encryptPayload(sub, encoder.encode(payload));
  return {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body,
  };
}
