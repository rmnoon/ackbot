import { Redis } from '@upstash/redis';
import { WebClient } from '@slack/web-api';

export const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

export const redis = new Redis({
	url: process.env.UPSTASH_REDIS_REST_URL,
	token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
