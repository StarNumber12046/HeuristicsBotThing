import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { glob } from 'glob';

const require = createRequire(import.meta.url);
const { PDQ } = require('pdq-wasm') as typeof import('pdq-wasm');

async function hashImage(filePath: string): Promise<{ file: string; hash: string }> {
	const buffer = await readFile(filePath);
	const { data, info } = await sharp(buffer)
		.toColorspace('srgb')
		.raw()
		.toBuffer({ resolveWithObject: true });

	const result = PDQ.hash({
		data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
		width: info.width,
		height: info.height,
		channels: 3,
	});

	const hash = PDQ.toHex(result.hash);
	return { file: filePath, hash };
}

export const HASH_RE = /'([a-f0-9]{64})'/gi;

function parseExistingHashes(content: string): Set<string> {
	const hashes = new Set<string>();
	for (const [, h] of content.matchAll(HASH_RE)) {
		hashes.add(h);
	}
	return hashes;
}

function formatOutput(entries: { file: string; hash: string }[]): string {
	const lines = entries.map(
		(e) => `\t// ${e.file}\n\t'${e.hash}',`,
	);
	return `export const KNOWN_CASINO_HASHES: string[] = [\n${lines.join('\n')}\n];\n`;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage:
  npx tsx scripts/generate-hashes.ts <patterns...>

  Compute PDQ perceptual hashes for one or more image files.
  Accepts glob patterns, file paths, or directories.

  --append <file>    Append results to an existing TypeScript file
  --tsv              Output tab-separated (file<TAB>hash)

Examples:
  npx tsx scripts/generate-hashes.ts images/*.png
  npx tsx scripts/generate-hashes.ts **/casino-*.jpg --append src/hashes/casino-hashes.ts
`);
		return;
	}

	const appendIndex = args.indexOf('--append');
	let appendTarget: string | null = null;
	const filePatterns: string[] = [];

	if (appendIndex !== -1) {
		appendTarget = resolve(process.cwd(), args[appendIndex + 1]!);
		filePatterns.push(...args.slice(0, appendIndex));
	} else {
		filePatterns.push(...args);
	}

	const useTsv = args.includes('--tsv');

	await PDQ.init();

	const files: string[] = [];
	for (const pattern of filePatterns) {
		if (pattern.startsWith('--')) continue;
		try {
			const s = await stat(pattern);
			if (s.isDirectory()) {
				const dirFiles = await glob(`${pattern.replace(/\\/g, '/')}/**/*.{png,jpg,jpeg,webp,gif,bmp,tiff}`);
				files.push(...dirFiles);
			} else if (s.isFile()) {
				files.push(pattern);
			}
		} catch {
			const matches = await glob(pattern.replace(/\\/g, '/'));
			files.push(...matches);
		}
	}

	if (files.length === 0) {
		console.error('No image files found matching the given patterns.');
		process.exit(1);
	}

	const results: { file: string; hash: string }[] = [];

	for (const file of files) {
		try {
			const result = await hashImage(file);
			results.push(result);
			if (useTsv) {
				console.log(`${result.file}\t${result.hash}`);
			} else {
				console.log(`  ${result.file}  →  ${result.hash}`);
			}
		} catch (err) {
			console.error(`  ${file}  →  ERROR: ${err}`);
		}
	}

	if (appendTarget) {
		let existingContent = '';
		try {
			existingContent = await readFile(appendTarget, 'utf-8');
		} catch {
			// File doesn't exist yet — start fresh.
		}
		const existingHashes = parseExistingHashes(existingContent);
		const seen = new Set(existingHashes);
		const merged = [...existingHashes].map((h) => ({ file: '(existing)', hash: h }));
		for (const r of results) {
			if (!seen.has(r.hash)) {
				seen.add(r.hash);
				merged.push(r);
			}
		}
		const code = formatOutput(merged);
		await writeFile(appendTarget, code, 'utf-8');
		const newCount = results.filter((r) => !existingHashes.has(r.hash)).length;
		console.log(`\nWrote ${merged.length} hash(es) (${newCount} new) to ${appendTarget}`);
	}

	console.log(`\nProcessed ${results.length} image(s).`);
}

await main();
