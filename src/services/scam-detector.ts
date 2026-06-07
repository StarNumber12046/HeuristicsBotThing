import { Client, Message } from 'discord.js';
import { debugLog } from '../utils/debug.js';
import { getConfig } from './config-manager.js';
import { scanInvites } from '../scanners/invite-scanner.js';
import { scanImage } from '../scanners/image-scanner.js';
import { executeActions } from '../actions/action-executor.js';
import type { DetectionInfo } from '../actions/action-executor.js';

export async function handleMessage(message: Message, client: Client): Promise<void> {
	if (message.author.bot || !message.inGuild()) {
		debugLog('Detector', 'Skipped — bot=%s inGuild=%s', message.author.bot, message.inGuild());
		return;
	}

	const guildId = message.guildId!;
	const tag = `${message.author.username} (${message.channelId})`;

	debugLog('Detector', `[${guildId}] Incoming message from ${tag}: content_len=%d attachments=%d`,
		message.content.length, message.attachments.size);
	debugLog('Detector', `[${guildId}] Content preview: ${message.content.slice(0, 200)}`);

	const config = await getConfig(guildId);

	if (config.excludedChannelIds.includes(message.channelId)) {
		debugLog('Detector', `[${guildId}] Channel ${message.channelId} is excluded — skipping`);
		return;
	}

	const detections: DetectionInfo[] = [];

	const inviteResults = await scanInvites(message.content, client);
	for (const result of inviteResults) {
		debugLog('Detector', `[${guildId}] Invite scan — code=%s matched=%s guild=%s nsfwLevel=%s`,
			result.code, result.matched, result.guildName ?? '?', result.nsfwLevel);
		if (result.matched) {
			detections.push({
				reason: 'NSFW Invite Link',
				evidence: `discord.gg/${result.code} → ${result.guildName ?? 'Unknown Server'} (NSFW level: ${result.nsfwLevel})`,
			});
		}
	}

	for (const [, attachment] of message.attachments) {
		debugLog('Detector', `[${guildId}] Scanning attachment — name=%s type=%s size=%d`,
			attachment.name, attachment.contentType, attachment.size);
		const imageResult = await scanImage(attachment);
		if (imageResult) {
			debugLog('Detector', `[${guildId}] Image scan — name=%s matched=%s distance=%s`,
				attachment.name, imageResult.matched, imageResult.distance ?? 'N/A');
		}
		if (imageResult?.matched) {
			detections.push({
				reason: 'Suspicious Casino Image',
				evidence: `\`${imageResult.attachmentName}\` (Hamming distance: ${imageResult.distance}) — ${imageResult.attachmentUrl}`,
			});
		}
	}

	if (detections.length === 0) {
		debugLog('Detector', `[${guildId}] No detections for ${tag}`);
		return;
	}

	debugLog('Detector', `[${guildId}] DETECTED %d issue(s) for ${tag}`, detections.length);

	const member = message.member;
	if (!member) {
		debugLog('Detector', `[${guildId}] No cached member for ${tag} — cannot execute actions`);
		return;
	}

	await executeActions(member, detections, message);
}
