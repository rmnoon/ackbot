import { slack, SLACK_SIGNING_SECRET } from './_constants';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import { AppMentionEvent, SlackRequest, Block, AnyEvent, ReactionAddedEvent, ReactionRemovedEvent } from './_SlackJson';
import { AckRequest } from './_AckJson';

/** if true we'll try and echo the event somewhere relevant into slack to aid debugging */
const DEBUG_ECHO_EVENT = true;

export default async function onEvent(req: VercelRequest, res: VercelResponse) {
	const body: SlackRequest = req.body;

	if (body.type === 'url_verification') {
		res.status(200).send({
			challenge: body.challenge,
		});
		return;
	}

	if (!isValidSlackRequest(req, SLACK_SIGNING_SECRET)) {
		console.error('Invalid slack request', { req });
		res.status(403).send({});
		return;
	}

	if (body.type !== 'event_callback') {
		console.error('Unexpected request type', { req });
		res.status(400).send({});
		return;
	}

	try {
		await checkDebugEcho(body.event);
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
		console.log('Unexpected error: ', { e });
		res.status(500).send({ msg: 'Unexpected error' });
	}
}

async function onAppMention(event: AppMentionEvent): Promise<{ response: unknown, code: number }> {
	console.log('onAppMention: ', { event });

	const req: AckRequest = {
		channel: event.channel,
		ts: event.ts,
		thread_ts: event.thread_ts,
	};
	const mentions = getUsersAndGroupMentions(event.blocks);

	await slack.chat.postMessage({
		channel: event.channel,
		thread_ts: event.thread_ts || undefined,
		blocks: [
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": `Ackbotting your message, <@${event.user}>!`
				}
			},
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": "```" + JSON.stringify({ event, req, mentions }, null, 2) + "```"
				}
			}
		]
	});

	return { code: 200, response: {} };
}

async function onReaction(event: ReactionAddedEvent | ReactionRemovedEvent): Promise<{ response: unknown, code: number }> {
	console.log('onReaction: ', { event });
	await checkMessageAcks(event.item.channel, event.item.ts);
	return { code: 200, response: {} };
}

async function checkMessageAcks(channel: string, ts: string) {
	console.log('checkMessageAcks', { channel, ts });

	const history = await slack.conversations.history({
		channel: channel,
		latest: ts,
		limit: 1,
		inclusive: true
	});

	console.log('history: ', { history });
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

async function checkDebugEcho(event: AnyEvent) {
	if (!DEBUG_ECHO_EVENT) return;

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

	await slack.chat.postMessage({
		channel: channel,
		thread_ts: threadTs,
		blocks: [
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": `Echoing event:`
				}
			},
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": "```" + JSON.stringify(event, null, 2) + "```"
				}
			}
		]
	});
}

function isValidSlackRequest(event: VercelRequest, signingSecret: string): boolean {
	const requestBody = JSON.stringify(event.body);
	const headers = event.headers;
	const timestamp = headers['x-slack-request-timestamp'];
	const slackSignature = headers['x-slack-signature'];
	const baseString = 'v0:' + timestamp + ':' + requestBody;

	const hmac = crypto
		.createHmac('sha256', signingSecret)
		.update(baseString)
		.digest('hex');
	const computedSlackSignature = 'v0=' + hmac;

	return computedSlackSignature === slackSignature;
}