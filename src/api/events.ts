import { slack, SLACK_SIGNING_SECRET } from './_constants';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppMentionEvent, SlackRequest, Block, AnyEvent, ReactionAddedEvent, ReactionRemovedEvent } from './_SlackJson';
import { isValidSlackRequest, map } from './_util';

/** if true we'll echo debug information in slack, too */
const DEBUG_LOG_TO_SLACK = true;

const DEFAULT_CONCURRENCY = 3;

export default async function onEvent(req: VercelRequest, res: VercelResponse) {
	const body: SlackRequest = req.body;

	if (body.type === 'url_verification') {
		res.status(200).send({
			challenge: body.challenge,
		});
		return;
	}

	if (!await isValidSlackRequest(req, SLACK_SIGNING_SECRET, true)) {
		console.error('Invalid slack request', { req: cleanReq(req) });
		res.status(403).send({});
		return;
	}

	if (body.type !== 'event_callback') {
		console.error('Unexpected request type', { req: cleanReq(req) });
		res.status(400).send({});
		return;
	}

	try {
		await logEvent(body.event);
		let response: unknown = {};
		let code = 400;
		switch (body.event.type) {
			case 'app_mention': ({ response, code } = await onAppMention(body.event)); break;
			case 'reaction_added': ({ response, code } = await onReaction(body.event)); break;
			case 'reaction_removed': ({ response, code } = await onReaction(body.event)); break;
			default: break;
		}
		res.status(code).send(response);
	} catch (e) {
		console.error('Unexpected error: ', { error: e, req: cleanReq(req) });
		res.status(500).send({ msg: 'Unexpected error' });
	}
}

async function onAppMention(event: AppMentionEvent): Promise<{ response: unknown, code: number }> {
	await checkMessageAcks(event.channel, event.ts);

	return { code: 200, response: {} };
}

async function onReaction(event: ReactionAddedEvent | ReactionRemovedEvent): Promise<{ response: unknown, code: number }> {
	await checkMessageAcks(event.item.channel, event.item.ts);
	return { code: 200, response: {} };
}

async function checkMessageAcks(channel: string, ts: string) {
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
			text: `<@${message.user}> requested that you acknowledge this message by reacting to it: ${permalink}`
		});
	}, DEFAULT_CONCURRENCY);
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

async function logEvent(event: AnyEvent) {
	let channel: string;
	let threadTs: string;
	switch (event.type) {
		case 'app_mention':
			channel = event.channel;
			threadTs = event.thread_ts;
			break;
		case 'reaction_added':
		case 'reaction_removed':
			channel = event.item.channel;
			break;
		default:
			break;
	}
	await log({ channel, threadTs }, `Received event: ${event.type}`, event);
}

async function log(where: { channel: string, threadTs?: string }, message: string, json: unknown) {
	console.log(message, { json });
	if (DEBUG_LOG_TO_SLACK) {
		await slack.chat.postMessage({
			channel: where.channel,
			thread_ts: where.threadTs || undefined,
			text: message,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: message,
					}
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: '```' + JSON.stringify(json, null, 2) + '```',
					}
				}
			]
		});
	}
}

function cleanReq(req: VercelRequest) {
	return {
		method: req.method,
		url: req.url,
		headers: req.headers,
		body: JSON.stringify(req.body)
	};
}
