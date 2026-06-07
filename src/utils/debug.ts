import process from 'node:process';

const ENABLED = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

function timestamp(): string {
	return new Date().toISOString().slice(11, 23);
}

export function debugLog(context: string, message: string, ...extras: unknown[]): void {
	if (!ENABLED) return;
	const line = [`[${timestamp()}]`, `[${context}]`, message, ...extras.map((e) => JSON.stringify(e))].join(' ');
	console.log(line);
}
