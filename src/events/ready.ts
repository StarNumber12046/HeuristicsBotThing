import { ActivityType, Events } from 'discord.js';
import type { Event } from './index.js';

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		const guildCount = client.guilds.cache.size;
		client.user.setActivity(`${guildCount} server(s)`, { type: ActivityType.Watching });
		console.log(`Ready! Logged in as ${client.user.tag} — monitoring ${guildCount} guild(s).`);
	},
} satisfies Event<Events.ClientReady>;
