import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	ComponentType,
	EmbedBuilder,
	GuildMember,
	Message,
	TextChannel,
} from 'discord.js';
import { debugLog } from '../utils/debug.js';
import { getConfig } from '../services/config-manager.js';

export type DetectionInfo = {
	reason: string;
	evidence: string;
};

export async function executeActions(
	member: GuildMember,
	detections: DetectionInfo[],
	message: Message,
): Promise<void> {
	const guildId = member.guild.id;
	const config = await getConfig(guildId);

	const reasonText = detections.map((d) => `• ${d.reason}: ${d.evidence}`).join('\n');

	debugLog('ActionExecutor', `[${guildId}] Executing action=%s on %s (%d detection(s))`,
		config.action, member.user.tag, detections.length);
	debugLog('ActionExecutor', `[${guildId}] Reasons:\n%s`, reasonText);

	// 1. Log the offending message to the log channel (if configured)
	if (config.logChannelId) {
		debugLog('ActionExecutor', `[${guildId}] Sending log embed to channel %s`, config.logChannelId);
		const logChannel = member.guild.channels.cache.get(config.logChannelId) as
			| TextChannel
			| undefined;
		if (logChannel?.isTextBased()) {
			const embed = new EmbedBuilder()
				.setColor(Colors.Red)
				.setTitle('🚨 Scam Detection Triggered')
				.setDescription(
					`**User:** ${member.user.tag} (<@${member.id}>)\n**Channel:** <#${message.channelId}>\n**Action:** \`${config.action}\``,
				)
				.addFields(
					{
						name: 'Message Content',
						value: message.content.slice(0, 1024) || '(no text content)',
					},
					...detections.map((d) => ({
						name: d.reason,
						value: d.evidence.slice(0, 1024),
					})),
				)
				.setTimestamp();

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`clear_${member.id}`)
					.setLabel('Clear — False Positive')
					.setStyle(ButtonStyle.Secondary),
			);

			const logMsg = await logChannel.send({ embeds: [embed], components: [row] });
			debugLog('ActionExecutor', `[${guildId}] Log embed sent (message %s)`, logMsg.id);

			const collector = logMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 86_400_000,
				filter: (i) => i.customId === `clear_${member.id}`,
			});

			collector.on('collect', async (i) => {
				if (!i.memberPermissions?.has('ModerateMembers')) {
					await i.reply({ content: 'You need `Moderate Members` permission.', ephemeral: true });
					return;
				}
				await i.update({ components: [] });
				await i.followUp({
					content: `False-positive flag cleared for ${member.user.tag} by ${i.user.tag}.`,
				});
				debugLog('ActionExecutor', `[${guildId}] False-positive cleared for %s by %s`, member.user.tag, i.user.tag);
			});
		} else {
			debugLog('ActionExecutor', `[${guildId}] Log channel %s not found or not text-based`, config.logChannelId);
		}
	} else {
		debugLog('ActionExecutor', `[${guildId}] No log channel configured — skipping log embed`);
	}

	// 2. DM the user unless dmMessage is null
	if (config.dmMessage) {
		try {
			await member.send(config.dmMessage);
			debugLog('ActionExecutor', `[${guildId}] DM sent to %s`, member.user.tag);
		} catch (err) {
			debugLog('ActionExecutor', `[${guildId}] DM to %s failed — %s`, member.user.tag, (err as Error).message);
		}
	} else {
		debugLog('ActionExecutor', `[${guildId}] DM disabled for %s (dmMessage is null)`, member.user.tag);
	}

	// 3. Delete the offending message (best-effort)
	try {
		await message.delete();
		debugLog('ActionExecutor', `[${guildId}] Deleted message %s from %s`, message.id, member.user.tag);
	} catch (err) {
		debugLog('ActionExecutor', `[${guildId}] Could not delete message %s — %s`, message.id, (err as Error).message);
	}

	// 4. Execute the configured moderation action
	switch (config.action) {
		case 'timeout': {
			if (member.moderatable) {
				await member.timeout(config.timeoutDuration * 60_000, reasonText);
				debugLog('ActionExecutor', `[${guildId}] Timed out %s for %d minutes`, member.user.tag, config.timeoutDuration);
			} else {
				debugLog('ActionExecutor', `[${guildId}] Cannot timeout %s — not moderatable`, member.user.tag);
			}
			break;
		}
		case 'kick': {
			if (member.kickable) {
				await member.kick(reasonText);
				debugLog('ActionExecutor', `[${guildId}] Kicked %s`, member.user.tag);
			} else {
				debugLog('ActionExecutor', `[${guildId}] Cannot kick %s — not kickable`, member.user.tag);
			}
			break;
		}
		case 'ban': {
			if (member.bannable) {
				await member.ban({ reason: reasonText });
				debugLog('ActionExecutor', `[${guildId}] Banned %s`, member.user.tag);
			} else {
				debugLog('ActionExecutor', `[${guildId}] Cannot ban %s — not bannable`, member.user.tag);
			}
			break;
		}
		case 'log': {
			debugLog('ActionExecutor', `[${guildId}] Action=log — no moderation taken for %s`, member.user.tag);
			break;
		}
	}

	debugLog('ActionExecutor', `[${guildId}] Finished processing %s`, member.user.tag);
}

export async function getLogChannel(
	guildId: string,
): Promise<TextChannel | null> {
	const config = await getConfig(guildId);
	if (!config.logChannelId) {
		return null;
	}
	return null;
}
