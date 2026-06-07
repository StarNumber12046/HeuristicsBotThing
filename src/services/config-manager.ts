import type { GuildConfig } from '../config/schema.js';
import { DEFAULT_CONFIG, GuildConfigSchema } from '../config/schema.js';
import { redis } from './redis.js';

function configKey(guildId: string): string {
	return `guild:${guildId}:config`;
}

export async function getConfig(guildId: string): Promise<GuildConfig> {
	const raw = await redis.hgetall(configKey(guildId));
	if (!raw || Object.keys(raw).length === 0) {
		return { ...DEFAULT_CONFIG };
	}
	const parsed = GuildConfigSchema.safeParse(raw);
	if (!parsed.success) {
		return { ...DEFAULT_CONFIG };
	}
	return parsed.data;
}

export async function setConfig(
	guildId: string,
	partial: Partial<GuildConfig>,
): Promise<GuildConfig> {
	const current = await getConfig(guildId);
	const updated = { ...current, ...partial };
	const parsed = GuildConfigSchema.parse(updated);
	await redis.hset(configKey(guildId), { ...parsed });
	return parsed;
}

export async function resetConfig(guildId: string): Promise<GuildConfig> {
	await redis.del(configKey(guildId));
	return { ...DEFAULT_CONFIG };
}

export async function getConfigField<K extends keyof GuildConfig>(
	guildId: string,
	key: K,
): Promise<GuildConfig[K]> {
	const config = await getConfig(guildId);
	return config[key];
}
