import { z } from 'zod';

export const ActionType = z.enum(['timeout', 'kick', 'ban', 'log']);

export type ActionType = z.infer<typeof ActionType>;

export const GuildConfigSchema = z.object({
	logChannelId: z.string().nullable().default(null),
	dmMessage: z
		.string()
		.default('⚠️ Your account may have been compromised. If you did not send that message, please change your password and enable 2FA immediately.')
		.nullable(),
	excludedChannelIds: z.array(z.string()).default([]),
	action: ActionType.default('log'),
	timeoutDuration: z.number().int().positive().default(60),
});

export type GuildConfig = z.infer<typeof GuildConfigSchema>;

export const DEFAULT_CONFIG: GuildConfig = {
	logChannelId: null,
	dmMessage: '⚠️ Your account may have been compromised. If you did not send that message, please change your password and enable 2FA immediately.',
	excludedChannelIds: [],
	action: 'log',
	timeoutDuration: 60,
};
