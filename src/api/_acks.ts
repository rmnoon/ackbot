import { sql, slack, redis } from './_constants';
import { log } from './_Slack';
import { Block } from './_SlackJson';
import { map } from './_util';

const DEFAULT_CONCURRENCY = 3;

const REDIS_ACK_KEY = 'acks';

const REMINDER_FREQUENCY_MIN = 1;

const REMINDER_FREQUENCY_MS = REMINDER_FREQUENCY_MIN * 60 * 1000;

const DEBUG_CHECK_ALL = false;

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
	const upperBound = DEBUG_CHECK_ALL ? '+inf' : now - REMINDER_FREQUENCY_MS;
	console.log('checkForReminders started: ', { now, upperBound });

	const vals = await redis.zrange(REDIS_ACK_KEY, '-inf', upperBound, { byScore: true }) as string[];
	console.log('checkForReminders got reminders: ', { now, vals });

	const complete: { channel: string, ts: string }[] = [];
	const incomplete: { channel: string, ts: string }[] = [];

	// check each of them
	await map(vals, async (val, idx) => {
		const [channel, ts] = val.split(':');
		console.log('checkForReminders val: ', { channel, ts, val, idx });
		try {
			const { isComplete } = await checkMessageAcks(channel, ts, false);
			if (isComplete) {
				complete.push({ channel, ts });
			} else {
				incomplete.push({ channel, ts });
			}
		} catch (e) {
			console.error('checkForReminders error: ', { error: e, val, idx });
		}
	}, DEFAULT_CONCURRENCY);

	// remove any that are now complete
	if (complete.length > 0) {
		await redis.zrem(REDIS_ACK_KEY, ...complete.map(c => `${c.channel}:${c.ts}`));
	}
	if (incomplete.length > 0) {
		await saveReminders(incomplete);
	}

	return { vals, complete, incomplete, now, upperBound };
}

async function saveReminders(reminders: { channel: string, ts: string }[]): Promise<void> {
	const score = new Date().getTime();
	const adds = reminders.map(r => ({ score, member: `${r.channel}:${r.ts}` }));
	const first = adds.shift();
	await redis.zadd(REDIS_ACK_KEY, first, ...adds); // dirty hack because these typings are disgusting
}

export async function checkMessageAcks(channel: string, ts: string, saveReminder = true): Promise<{ isComplete: boolean }> {
	console.log('checkMessageAcks starting: ', { channel, ts, saveReminder });
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
	4;
	const usersShouldReact = new Set(mentions.userIds);

	await map(mentions.userGroupIds, async groupId => {
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

	await map(usersToPing, async userToPing => {
		await slack.chat.postMessage({
			channel: userToPing,
			text: `Hey <@${userToPing}>! Heads up that <@${message.user}> requested you acknowledge their message by reacting to it: ${permalink}`
		});
	}, DEFAULT_CONCURRENCY);

	const isComplete = usersToPing.length === 0;
	if (!isComplete && saveReminder) {
		await saveReminders([{ channel, ts }]);
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
