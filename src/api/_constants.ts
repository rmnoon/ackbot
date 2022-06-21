// import { Redis } from '@upstash/redis';
import { WebClient } from '@slack/web-api';
import postgres from 'postgres';

export const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// export const redis = new Redis({
// 	automaticDeserialization: false,
// 	url: process.env.UPSTASH_REDIS_REST_URL,
// 	token: process.env.UPSTASH_REDIS_REST_TOKEN,
// });

export const sql = postgres({
	host: process.env.PGHOST,
	database: process.env.PGDATABASE,
	username: process.env.PGUSER,
	password: process.env.PGPASSWORD,
	ssl: { rejectUnauthorized: false }
});

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
