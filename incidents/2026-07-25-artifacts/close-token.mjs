// close-token.mjs — retire the compromised $ATTEST mint, atomically.
//
// ONE transaction, two instructions:
//   1. UpdateMetadataAccountV2  — repoint the URI off the abandoned *.pages.dev host
//   2. SetAuthority(MintTokens) → None — permanently cap the supply
//
// Instruction 2 is IRREVERSIBLE. Once the mint authority is null, the SPL Token
// program will never let it be re-established — the same rule that already makes
// the freeze authority unrecoverable. After this runs, no further $ATTEST can ever
// be created by anyone, including us.
//
// Deliberately NOT done: updateAuthority is left in place and isMutable stays true,
// so the metadata record can still be corrected later. Retiring the token should not
// mean losing the ability to keep its description accurate.
//
//   Dry run :  KEYPAIR=~/ruta/al/wallet.json NEW_URI=https://… node close-token.mjs
//   Execute :  KEYPAIR=~/ruta/al/wallet.json NEW_URI=https://… CONFIRM=CLOSE node close-token.mjs
//
// KEYPAIR apunta a un archivo de keypair de la CLI de Solana (arreglo de 64 bytes).
// Se prefiere sobre pegar la llave: una llave en la línea de comandos queda en el
// historial del shell en texto plano, es visible en `ps` para cualquier proceso de
// la máquina, y sobrevive en el scrollback de la terminal. KEY=<base58> sigue
// funcionando por compatibilidad, pero avisa.
//
// Publish the JSON at NEW_URI BEFORE running this — wallets cache aggressively, and
// this script refuses to proceed if the URI is not already serving valid JSON.

import {
    Connection, Keypair, Transaction, TransactionInstruction,
    PublicKey, LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
    createSetAuthorityInstruction, AuthorityType, TOKEN_PROGRAM_ID, getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'node:fs';
import os from 'node:os';

// ─── configuration ───────────────────────────────────────────────────────────
const NAME   = 'Attestto Governance Token';   // unchanged — Metaplex needs the whole struct
const SYMBOL = 'ATTEST';                      // unchanged
const NEW_URI = process.env.NEW_URI;
const EXPECTED_AUTHORITY = 'CKANe7hZJxzN1TPazXfEiYd2nDdEetmjQdxi9NB31jVS';
const MINT = new PublicKey('91Zh1Nh5Leuktcn878HACDGtTnEwXXpTdDXEMp18rMbU');
const TMP  = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
// ─────────────────────────────────────────────────────────────────────────────

const c = new Connection(process.env.RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
if (!process.env.KEYPAIR && !process.env.KEY) {
    console.error('Set KEYPAIR=/ruta/al/wallet.json   (o KEY=<base58>, desaconsejado)');
    process.exit(2);
}
if (!NEW_URI)         { console.error('Set NEW_URI=https://…'); process.exit(2); }
if (/pages\.dev/.test(NEW_URI)) {
    console.error('✗ NEW_URI still points at *.pages.dev — that is the problem we are fixing.');
    process.exit(2);
}

// ── carga de la llave ────────────────────────────────────────────────────────
// Preferido: archivo. La llave nunca toca la línea de comandos, el historial
// del shell ni la tabla de procesos.
function cargarKeypair() {
    if (process.env.KEYPAIR) {
        const ruta = process.env.KEYPAIR.replace(/^~(?=$|\/)/, os.homedir());
        let crudo;
        try { crudo = fs.readFileSync(ruta, 'utf8'); }
        catch (e) { console.error(`✗ no se pudo leer KEYPAIR: ${e.message}`); process.exit(2); }

        // Aviso, no bloqueo: el permiso del archivo es del operador, no nuestro.
        try {
            const m = fs.statSync(ruta).mode & 0o777;
            if (m & 0o077) console.warn(`  ⚠ ${ruta} es legible por otros (modo ${m.toString(8)}). chmod 600.`);
        } catch { /* no crítico */ }

        let arr;
        try { arr = JSON.parse(crudo); }
        catch { console.error('✗ KEYPAIR no es JSON. Se espera el formato de solana-keygen: arreglo de 64 bytes.'); process.exit(2); }
        if (!Array.isArray(arr) || arr.length !== 64) {
            console.error(`✗ KEYPAIR debe ser un arreglo de 64 bytes; se leyeron ${Array.isArray(arr) ? arr.length : typeof arr}.`);
            process.exit(2);
        }
        return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    console.warn('  ⚠ KEY=<base58> queda en el historial del shell y en `ps`. Preferí KEYPAIR=/ruta/al/wallet.json');
    return Keypair.fromSecretKey(bs58.decode(process.env.KEY.trim()));
}
const kp = cargarKeypair();
const b58 = (b) => bs58.encode(Buffer.from(b));

console.log('═'.repeat(78));
console.log(`signer  : ${kp.publicKey.toBase58()}`);
if (kp.publicKey.toBase58() !== EXPECTED_AUTHORITY) {
    console.error(`✗ ABORT — expected ${EXPECTED_AUTHORITY}`); process.exit(1);
}

// ── read current on-chain state ──────────────────────────────────────────────
const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TMP.toBuffer(), MINT.toBuffer()], TMP);
const info = await c.getAccountInfo(pda);
if (!info) { console.error('✗ metadata account not found'); process.exit(1); }

const onChainUpdateAuth = b58(info.data.subarray(1, 33));
const mint = await getMint(c, MINT);

console.log(`mint    : ${MINT.toBase58()}`);
console.log(`metadata: ${pda.toBase58()}`);
console.log(`\n── current state ──`);
console.log(`  supply           : ${mint.supply}`);
console.log(`  decimals         : ${mint.decimals}`);
console.log(`  mint authority   : ${mint.mintAuthority?.toBase58() ?? 'null (already revoked)'}`);
console.log(`  freeze authority : ${mint.freezeAuthority?.toBase58() ?? 'null (unrecoverable)'}`);
console.log(`  update authority : ${onChainUpdateAuth}`);

if (onChainUpdateAuth !== kp.publicKey.toBase58()) {
    console.error('\n✗ ABORT — signer is not the on-chain metadata update authority'); process.exit(1);
}

let p = 65;
const rd = () => { const n = info.data.readUInt32LE(p); p += 4;
                   const s = info.data.subarray(p, p + n).toString('utf8').replace(/\0+$/, '');
                   p += n; return s; };
rd(); rd();
const curUri = rd();
console.log(`  metadata uri     : ${curUri}`);

// ── verify the new URI is actually live before we point at it ────────────────
process.stdout.write('\n── checking NEW_URI ── ');
try {
    const r = await fetch(NEW_URI, { redirect: 'follow' });
    const body = await r.text();
    console.log(`HTTP ${r.status}, ${body.length} bytes`);
    if (!r.ok) { console.error('✗ ABORT — NEW_URI is not returning 200. Publish the JSON first.'); process.exit(1); }
    const j = JSON.parse(body);
    console.log(`  ✓ valid JSON — name="${j.name}" symbol="${j.symbol}"`);
    if (j.symbol !== SYMBOL) console.log(`  ⚠ symbol in JSON ("${j.symbol}") differs from on-chain ("${SYMBOL}")`);
} catch (e) {
    console.error(`✗ ABORT — ${e.message}\n  Publish the JSON at NEW_URI before running this.`);
    process.exit(1);
}

// ── build ────────────────────────────────────────────────────────────────────
const str = (s) => { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(4);
                     l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const dataV2 = Buffer.concat([
    str(NAME), str(SYMBOL), str(NEW_URI),
    Buffer.from([0, 0]),   // sellerFeeBasisPoints
    Buffer.from([0]),      // creators:   None
    Buffer.from([0]),      // collection: None
    Buffer.from([0]),      // uses:       None
]);
const ixData = Buffer.concat([
    Buffer.from([15]),           // UpdateMetadataAccountV2
    Buffer.from([1]), dataV2,    // data: Some(DataV2)
    Buffer.from([0]),            // updateAuthority:     None → unchanged
    Buffer.from([0]),            // primarySaleHappened: None → unchanged
    Buffer.from([0]),            // isMutable:           None → stays true
]);

const tx = new Transaction();
tx.add(new TransactionInstruction({
    programId: TMP,
    keys: [
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: kp.publicKey, isSigner: true, isWritable: false },
    ],
    data: ixData,
}));

const willRevoke = mint.mintAuthority !== null;
if (willRevoke) {
    tx.add(createSetAuthorityInstruction(
        MINT, kp.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID));
} else {
    console.log('\n  (mint authority already null — skipping revocation)');
}

tx.feePayer = kp.publicKey;
tx.recentBlockhash = (await c.getLatestBlockhash('finalized')).blockhash;

console.log('\n── what this transaction does ──');
console.log(`  1. metadata uri : ${curUri}`);
console.log(`                  → ${NEW_URI}`);
if (willRevoke) {
    console.log(`  2. mint authority: ${mint.mintAuthority.toBase58()}`);
    console.log(`                   → null   ⚠ PERMANENT — supply capped at ${mint.supply} forever`);
}
console.log('\n  unchanged: updateAuthority, isMutable (true), freeze authority (already null),');
console.log('             supply, and all existing token balances.');

console.log(`\ntx size : ${tx.serialize({ requireAllSignatures: false }).length} / 1232 bytes`);
console.log(`fee from: ${kp.publicKey.toBase58()} (${(await c.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL} SOL)`);

console.log('\n── simulating ──');
tx.sign(kp);
const sim = await c.simulateTransaction(tx);
if (sim.value.err) {
    console.log(`✗ SIMULATION FAILED: ${JSON.stringify(sim.value.err)}`);
    (sim.value.logs || []).forEach(l => console.log('   ', l));
    process.exit(1);
}
console.log(`✓ simulation OK — ${sim.value.unitsConsumed} CU`);

if (process.env.CONFIRM !== 'CLOSE') {
    console.log('\n' + '═'.repeat(78));
    console.log('DRY RUN — nothing sent.');
    if (willRevoke) console.log('Revoking the mint authority CANNOT be undone. Re-read the summary above.');
    console.log('Re-run with CONFIRM=CLOSE to execute.');
    process.exit(0);
}

console.log('\n── sending ──');
const sig = await sendAndConfirmTransaction(c, tx, [kp], { commitment: 'confirmed' });
console.log(`✓ CONFIRMED  ${sig}`);
console.log(`  https://solscan.io/tx/${sig}`);

// ── verify ───────────────────────────────────────────────────────────────────
const after = await c.getAccountInfo(pda);
let q = 65;
const rd2 = () => { const n = after.data.readUInt32LE(q); q += 4;
                    const s = after.data.subarray(q, q + n).toString('utf8').replace(/\0+$/, '');
                    q += n; return s; };
rd2(); rd2();
const mintAfter = await getMint(c, MINT);
console.log('\n── verified on chain ──');
console.log(`  metadata uri   : ${rd2()}`);
console.log(`  mint authority : ${mintAfter.mintAuthority?.toBase58() ?? 'null ✓ revoked'}`);
console.log(`  supply         : ${mintAfter.supply} (final)`);
