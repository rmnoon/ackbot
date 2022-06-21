import { Redis } from '@upstash/redis/with-fetch';
import { WebClient } from '@slack/web-api';

export const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

export const ACKBOT_VERIFY = process.env.ACKBOT_VERIFY;

export const redis = new Redis({
	automaticDeserialization: false,
	url: process.env.UPSTASH_REDIS_REST_URL,
	token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
