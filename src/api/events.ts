import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkMessageAcks } from './_acks';
import { SLACK_SIGNING_SECRET } from './_constants';
import { isValidSlackRequest, log } from './_Slack';
import { AnyEvent, AppMentionEvent, SlackRequest } from './_SlackJson';
import { cleanReq } from './_util';

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
