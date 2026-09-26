// The archive the single-file binary carries its engine in: written by
// scripts/build-binary.mjs, unpacked on first run by bin/teaman-binary.mjs
// (which the Bun bundler compiles this module into).
//
// A stream of records, each a 4-byte big-endian header length, a JSON header
// { p: path, t: 'f' | 'd', m: mode, s: size }, and, for a file, `s` bytes of
// content. There are no symlinks — Windows cannot create them unprivileged —
// and the packer refuses any it meets.

import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';

// Left out of the archive: `.bin` shim dirs are symlinks nothing in the engine
// runs through (it resolves each tool's JS entry itself), and source maps are
// dead weight at runtime.
const skip = (name, isDir) => (isDir ? name === '.bin' : name.endsWith('.map'));

function* record(header, data) {
  const json = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(json.length);
  yield size;
  yield json;
  if (data) yield data;
}

/**
 * Serialize a directory tree as archive chunks, parents before children.
 * @param {string} root
 * @returns {Generator<Buffer>}
 */
export function* archiveEntries(root) {
  const stack = [''];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(join(root, dir)).sort()) {
      const rel = dir ? `${dir}/${name}` : name;
      const stat = lstatSync(join(root, rel));
      if (stat.isSymbolicLink()) {
        if (skip(name, true)) continue;
        throw new Error(`cannot pack symlink ${rel} (the archive has no symlinks)`);
      }
      if (skip(name, stat.isDirectory())) continue;
      const mode = stat.mode & 0o777;
      if (stat.isDirectory()) {
        yield* record({ p: rel, t: 'd', m: mode });
        stack.push(rel);
      } else {
        yield* record({ p: rel, t: 'f', m: mode, s: stat.size }, readFileSync(join(root, rel)));
      }
    }
  }
}

/** Reads exact byte counts off an async iterable of Buffers. */
function byteReader(chunks) {
  const iterator = chunks[Symbol.asyncIterator]();
  let buffered = [];
  let length = 0;
  return async function read(n) {
    while (length < n) {
      const { value, done } = await iterator.next();
      if (done) {
        if (length === 0) return null;
        throw new Error('teaman archive is truncated');
      }
      buffered.push(value);
      length += value.length;
    }
    const all = buffered.length === 1 ? buffered[0] : Buffer.concat(buffered, length);
    buffered = n < all.length ? [all.subarray(n)] : [];
    length -= n;
    return all.subarray(0, n);
  };
}

/** Resolve an archive path under `dest`, refusing anything that escapes it. */
function entryPath(dest, relative) {
  const target = resolve(dest, relative);
  if (isAbsolute(relative) || !target.startsWith(dest + sep)) {
    throw new Error(`teaman archive entry escapes its root: ${relative}`);
  }
  return target;
}

/**
 * Unpack a (decompressed) archive stream into `dest`.
 * @param {AsyncIterable<Buffer>} stream
 * @param {string} dest
 */
export async function extractArchive(stream, dest) {
  dest = resolve(dest);
  const read = byteReader(stream);
  for (;;) {
    const size = await read(4);
    if (size === null) return;
    const header = JSON.parse((await read(size.readUInt32BE(0))).toString('utf8'));
    const target = entryPath(dest, header.p);
    if (header.t === 'd') {
      mkdirSync(target, { recursive: true, mode: header.m });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, header.s === 0 ? Buffer.alloc(0) : await read(header.s), { mode: header.m });
    }
  }
}
