import { sql, slack, redis } from './_constants';
import { log } from './_Slack';
import { Block } from './_SlackJson';
import { map } from './_util';

const DEFAULT_CONCURRENCY = 3;

const REDIS_ACK_KEY = 'acks';

const REMINDER_FREQUENCY_MIN = 5;

const REMINDER_FREQUENCY_MS = REMINDER_FREQUENCY_MIN * 60 * 1000;

export async function checkForRemindersSql() {
	const now = new Date().getTime();
	const test = await sql`
    insert into ackbot
      (checktime, channel, ts)
    values
      (${now}, ${'lolchannel'}, ${'lolts'})
    returning name, age
	`;

	console.log('test: ', { test });
	return test;
	// get k items with a check time earlier than a day ago

	// check each of them

	// for any not done yet enqueue them with their most recent check time
}

export async function checkForReminders() {
	const now = new Date().getTime();
	console.log('checkForReminders: ', { now });

	// get k items with a check time eligible for a reminder
	const vals = await redis.zrange(REDIS_ACK_KEY, '-inf', now - REMINDER_FREQUENCY_MS, { byScore: true }) as string[];

	console.log('checkForReminders: ', { now, vals });
	// const complete: string[] = [];

	// check each of them
	// map(vals, async val => {
	// 	const [channel, ts] = val.split(':');
	// 	try {
	// 		const { isComplete } = await checkMessageAcks(channel, ts);
	// 		if (isComplete) {
	// 			complete.push(val);
	// 		}
	// 	} catch (e) {
	// 		console.error('checkForReminders error: ', { error: e, val });
	// 	}
	// }, DEFAULT_CONCURRENCY);

	// remove any that are now complete
	// await redis.zrem(REDIS_ACK_KEY, ...complete);

	return { vals };
}

async function saveReminder(channel: string, ts: string): Promise<void> {
	console.log('saving reminder: ', { channel, ts });
	await redis.zadd(REDIS_ACK_KEY, { score: new Date().getTime(), member: `${channel}:${ts}` });
	console.log('reminder saved: ', { channel, ts });
}

export async function checkMessageAcks(channel: string, ts: string): Promise<{ isComplete: boolean }> {

	const thisBotId = (await slack.auth.test({})).user_id;

	const history = await slack.conversations.history({
		channel: channel,
		latest: ts,
		limit: 1,
		inclusive: true
	});
	await log({ channel, threadTs: ts }, 'checking message', { history, thisBotId });
	const message = history.messages[0];
	if (!message) {
		await log({ channel, threadTs: ts }, 'missing message, deleted?', { history, thisBotId });
		return { isComplete: true };
	}
	const mentions = getUsersAndGroupMentions(message.blocks as Block[]);
	const reactions = message.reactions || [];

	const usersDidReact = new Set<string>();
	for (const r of reactions) {
		for (const u of r.users) {
			usersDidReact.add(u);
		}
	}

	const usersShouldReact = new Set(mentions.userIds);

	map(mentions.userGroupIds, async groupId => {
		const groupResp = await slack.usergroups.users.list({
			usergroup: groupId
		});
		for (const user of groupResp.users || []) {
			usersShouldReact.add(user);
		}
	}, DEFAULT_CONCURRENCY);

	if (usersShouldReact.has(thisBotId)) {
		// react from the bot to acknowledge the request and to prevent us from DM'ing ourselves
		try {
			await slack.reactions.add({
				channel: channel,
				timestamp: ts,
				name: 'thumbsup',
			});
		} catch (e) {
			// ok to silently fail here, slack reactions aren't super consistent so we'll get "aleady reacted" from them pretty commonly
		}
		usersDidReact.add(thisBotId);
		usersShouldReact.delete(thisBotId);
	}

	const usersToPing = [...usersShouldReact].filter(u => !usersDidReact.has(u));

	const permalink = (await slack.chat.getPermalink({
		channel: channel,
		message_ts: ts,
	})).permalink;

	await log({ channel, threadTs: ts }, 'ready to send reminders', { message, mentions, reactions, usersDidReact: [...usersDidReact], usersShouldReact: [...usersShouldReact], usersToPing });

	map(usersToPing, async userToPing => {
		await slack.chat.postMessage({
			channel: userToPing,
			text: `Hey <@${userToPing}>! Heads up that <@${message.user}> requested you acknowledge their message by reacting to it: ${permalink}`
		});
	}, DEFAULT_CONCURRENCY);

	const isComplete = usersToPing.length === 0;
	if (!isComplete) {
		await saveReminder(channel, ts);
	}
	return { isComplete };
}

function getUsersAndGroupMentions(blocks: Block[]): { userIds: string[], userGroupIds: string[] } {
	let userIds: string[] = [];
	let userGroupIds: string[] = [];

	for (const block of blocks || []) {
		if (!block || !block.type) continue;

		switch (block.type) {
			case 'user':
				userIds.push(block.user_id);
				break;
			case 'usergroup':
				userGroupIds.push(block.usergroup_id);
				break;
			default:
				// don't have complete typings so let's just take a shortcut on element arrays
				const elements = (block as any).elements;
				if (Array.isArray(elements)) {
					const recursed = getUsersAndGroupMentions(elements);
					userIds = [...new Set([...userIds, ...recursed.userIds])];
					userGroupIds = [...new Set([...userGroupIds, ...recursed.userGroupIds])];
				}
				break;
		}
	}

	return { userIds, userGroupIds };
}
