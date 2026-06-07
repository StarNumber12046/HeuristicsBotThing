import { Client, GuildNSFWLevel } from 'discord.js';
import { debugLog } from '../utils/debug.js';

const INVITE_REGEX = /discord(?:app)?\.(?:gg|com\/invite)\/([\w-]+)/gi;

export type InviteScanResult = {
	matched: boolean;
	code?: string;
	nsfwLevel?: GuildNSFWLevel;
	guildName?: string;
};

export async function scanInvites(
	content: string,
	client: Client,
): Promise<InviteScanResult[]> {
	const results: InviteScanResult[] = [];
	const matches = [...content.matchAll(INVITE_REGEX)];

	if (matches.length > 0) {
		debugLog('InviteScanner', 'Found %d invite link(s) in content', matches.length);
	}

	for (const match of matches) {
		const code = match[1]!;
		debugLog('InviteScanner', 'Resolving invite code=%s', code);
		try {
			const invite = await client.fetchInvite(code);
			const guild = invite.guild;

			if (guild) {
				debugLog('InviteScanner', 'Invite code=%s → guild=%s nsfwLevel=%s',
					code, guild.name, guild.nsfwLevel);
				if (guild.nsfwLevel !== GuildNSFWLevel.Default) {
					results.push({
						matched: true,
						code,
						nsfwLevel: guild.nsfwLevel,
						guildName: guild.name,
					});
				} else {
					debugLog('InviteScanner', 'Invite code=%s guild=%s is safe (NSFW=Default) — skipping', code, guild.name);
				}
			} else {
				debugLog('InviteScanner', 'Invite code=%s has no guild data — skipping', code);
			}
		} catch (err) {
			debugLog('InviteScanner', 'Invite code=%s could not be resolved — %s', code, (err as Error).message);
		}
	}

	return results;
}
