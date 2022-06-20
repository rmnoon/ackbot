import { slack, SLACK_SIGNING_SECRET } from './_constants';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import { AppMentionEvent, SlackRequest, Block } from './_SlackJson';
import { AckRequest } from './_AckJson';

export default async function onEvent(req: VercelRequest, res: VercelResponse) {
	const body: SlackRequest = req.body;

	if (body.type === 'url_verification') {
		res.status(200).send({
			challenge: body.challenge,
		});
		return;
	}

	if (!isValidSlackRequest(req, SLACK_SIGNING_SECRET)) {
		console.error('Invalid slack request', req);
		res.status(403).send({});
		return;
	}

	if (body.type !== 'event_callback') {
		console.error('Unexpected request type', req);
		res.status(400).send({});
		return;
	}

	try {
		let response: unknown = {};
		let code = 400;
		switch (body.event.type) {
			case 'app_mention': ({ response, code } = await onAppMention(body.event)); break;
			default: break;
		}
		res.status(code).send(response);
	} catch (e) {
		console.log('Unexpected error: ', e);
		res.status(500).send({ msg: 'Unexpected error' });
	}
}

async function onAppMention(event: AppMentionEvent): Promise<{ response: unknown, code: number }> {
	console.log('onAppMention: ', event);

	// echo for debug on message types
	if (isEchoRequest(event)) {
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts || undefined,
			blocks: [
				{
					"type": "section",
					"text": {
						"type": "mrkdwn",
						"text": `Echoing your message, <@${event.user}>!`
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
		return { code: 200, response: {} };
	}

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

function getUsersAndGroupMentions(blocks: Block[]): { userIds: string[], userGroupIds: string[] } {
	let userIds: string[] = [];
	let userGroupIds: string[] = [];

	for (const block of blocks || []) {
		switch (block.type) {
			case 'rich_text':
			case 'rich_text_section':
				const recursed = getUsersAndGroupMentions(block.elements);
				userIds = [...new Set([...userIds, ...recursed.userIds])];
				userGroupIds = [...new Set([...userGroupIds, ...recursed.userGroupIds])];
				break;
			case 'user':
				userIds.push(block.user_id);
				break;
			case 'usergroup':
				userGroupIds.push(block.usergroup_id);
				break;
			default:
				break;
		}
	}

	return { userIds, userGroupIds };
}

function isEchoRequest(event: AppMentionEvent): boolean {
	const firstBlock: Block = event?.blocks[0];
	if (firstBlock?.type === 'rich_text') {
		const firstFirstBlock = firstBlock?.elements[0];
		if (firstFirstBlock?.type === 'rich_text_section') {
			const firstFirstFirstBlock = firstFirstBlock?.elements[0];
			if (firstFirstFirstBlock.type === 'text' && firstFirstFirstBlock.text === 'echo ') {
				return true;
			}
		}
	}
	return false;
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