import { Events } from 'discord.js';
import { handleMessage } from '../services/scam-detector.js';
import type { Event } from './index.js';

export default {
	name: Events.MessageCreate,
	async execute(message) {
		await handleMessage(message, message.client);
	},
} satisfies Event<Events.MessageCreate>;
