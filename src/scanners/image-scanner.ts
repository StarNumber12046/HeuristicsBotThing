import { createRequire } from 'node:module';
import { Attachment } from 'discord.js';
import sharp from 'sharp';
import { debugLog } from '../utils/debug.js';
import { KNOWN_CASINO_HASHES } from '../hashes/casino-hashes.js';

const require = createRequire(import.meta.url);
const { PDQ } = require('pdq-wasm') as typeof import('pdq-wasm');

const SIMILARITY_THRESHOLD = 31;

export type ImageScanResult = {
	matched: boolean;
	attachmentName: string;
	attachmentUrl: string;
	distance?: number;
};

let pdqInitialized = false;

async function ensurePdq(): Promise<void> {
	if (!pdqInitialized) {
		debugLog('ImageScanner', 'Initializing PDQ WASM module');
		await PDQ.init();
		pdqInitialized = true;
		debugLog('ImageScanner', 'PDQ WASM module ready');
	}
}

function isImageAttachment(attachment: Attachment): boolean {
	if (!attachment.contentType) {
		return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(attachment.name ?? '');
	}
	return attachment.contentType.startsWith('image/');
}

export async function scanImage(attachment: Attachment): Promise<ImageScanResult | null> {
	if (!isImageAttachment(attachment)) {
		debugLog('ImageScanner', 'Attachment %s is not an image — skipping', attachment.name);
		return null;
	}

	debugLog('ImageScanner', 'Processing image %s (%s)', attachment.name, attachment.url);
	await ensurePdq();

	if (KNOWN_CASINO_HASHES.length === 0) {
		debugLog('ImageScanner', 'No known casino hashes configured — skipping comparison');
	}

	try {
		const response = await fetch(attachment.url);
		if (!response.ok) {
			debugLog('ImageScanner', 'Failed to download %s — HTTP %d', attachment.name, response.status);
			return null;
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		debugLog('ImageScanner', 'Downloaded %s — %d bytes', attachment.name, buffer.length);

		let pixelData: Buffer;
		let width: number;
		let height: number;

		try {
			const result = await sharp(buffer)
				.toColorspace('srgb')
				.raw()
				.toBuffer({ resolveWithObject: true });
			pixelData = result.data;
			width = result.info.width;
			height = result.info.height;
		} catch (err) {
			debugLog('ImageScanner', 'sharp decode failed for %s — %s', attachment.name, (err as Error).message);
			return null;
		}

		debugLog('ImageScanner', 'Decoded %s — %dx%d px', attachment.name, width, height);

		const hashResult = PDQ.hash({
			data: new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength),
			width,
			height,
			channels: 3,
		});

		const hashHex = PDQ.toHex(hashResult.hash);
		debugLog('ImageScanner', 'PDQ hash for %s = %s', attachment.name, hashHex);

		for (const knownHash of KNOWN_CASINO_HASHES) {
			const distance = PDQ.hammingDistance(PDQ.fromHex(hashHex), PDQ.fromHex(knownHash));
			debugLog('ImageScanner', 'Compare %s vs known %s…%s = distance %d', attachment.name,
				knownHash.slice(0, 8), knownHash.slice(-8), distance);
			if (distance <= SIMILARITY_THRESHOLD) {
				debugLog('ImageScanner', 'MATCH — %s matches known casino hash at distance %d (threshold %d)',
					attachment.name, distance, SIMILARITY_THRESHOLD);
				return {
					matched: true,
					attachmentName: attachment.name ?? 'unknown',
					attachmentUrl: attachment.url,
					distance,
				};
			}
		}

		debugLog('ImageScanner', 'No match for %s against %d known hash(es)', attachment.name, KNOWN_CASINO_HASHES.length);
		return {
			matched: false,
			attachmentName: attachment.name ?? 'unknown',
			attachmentUrl: attachment.url,
		};
	} catch (err) {
		debugLog('ImageScanner', 'Unexpected error scanning %s — %s', attachment.name, (err as Error).message);
		return null;
	}
}
