import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { getConfig, setConfig, resetConfig } from '../services/config-manager.js';
import { ActionType, GuildConfigSchema } from '../config/schema.js';
import type { Command } from './index.js';

const subcommands = ['view', 'set', 'reset'] as const;

const validKeys = Object.keys(GuildConfigSchema.shape) as (keyof typeof GuildConfigSchema.shape)[];

export default {
	data: {
		name: 'config',
		description: 'View or change the anti-scam configuration for this server.',
		default_member_permissions: PermissionFlagsBits.Administrator.toString(),
		options: [
			{
				name: 'view',
				description: 'View the current config.',
				type: 1,
			},
			{
				name: 'set',
				description: 'Set a config value.',
				type: 1,
				options: [
					{
						name: 'key',
						description: 'The config key to set.',
						type: 3,
						required: true,
						choices: validKeys.map((k) => ({ name: k, value: k })),
					},
					{
						name: 'value',
						description: 'The value to set.',
						type: 3,
						required: true,
					},
				],
			},
			{
				name: 'reset',
				description: 'Reset the config to defaults.',
				type: 1,
			},
		],
	},
	async execute(interaction: ChatInputCommandInteraction<'cached'>) {
		const sub = interaction.options.getSubcommand(true) as (typeof subcommands)[number];

		switch (sub) {
			case 'view': {
				const config = await getConfig(interaction.guildId);
				const lines = Object.entries(config)
					.map(([k, v]) => `**${k}:** \`${JSON.stringify(v)}\``)
					.join('\n');
				await interaction.reply({ content: `### Current Config\n${lines}`, ephemeral: true });
				break;
			}
			case 'set': {
		const key = interaction.options.getString('key', true) as keyof typeof GuildConfigSchema.shape;
		const rawValue = interaction.options.getString('value', true);

		let parsedValue: unknown = rawValue;
		if (key === 'excludedChannelIds') {
			parsedValue = rawValue.split(',').map((s: string) => s.trim());
		} else if (key === 'action') {
					const result = ActionType.safeParse(rawValue);
					if (!result.success) {
						await interaction.reply({
							content: `Invalid action. Must be one of: ${ActionType.options.join(', ')}`,
							ephemeral: true,
						});
						return;
					}
					parsedValue = result.data;
				} else if (key === 'timeoutDuration') {
					const num = Number(rawValue);
					if (!Number.isInteger(num) || num <= 0) {
						await interaction.reply({
							content: 'timeoutDuration must be a positive integer (minutes).',
							ephemeral: true,
						});
						return;
					}
					parsedValue = num;
				} else if (key === 'logChannelId') {
					const match = rawValue.match(/^<#(\d+)>$/);
					if (match) {
						parsedValue = match[1]!;
					}
				}

				await setConfig(interaction.guildId, { [key]: parsedValue });
				await interaction.reply({
					content: `**${key}** has been set to \`${JSON.stringify(parsedValue)}\`.`,
					ephemeral: true,
				});
				break;
			}
			case 'reset': {
				await resetConfig(interaction.guildId);
				await interaction.reply({ content: 'Config has been reset to defaults.', ephemeral: true });
				break;
			}
		}
	},
} satisfies Command;
