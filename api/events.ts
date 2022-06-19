import { slack, SLACK_SIGNING_SECRET } from './_constants';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import { AppMentionEvent, SlackRequest } from './SlackJson';


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
	console.log('mention', event);
	const chatResp = await slack.chat.postMessage({
		channel: event.channel,
		text: `Hi there! Thanks for mentioning me, <@${event.user}>! Kat is super cool.`
	});
	console.log('chat response: ', chatResp);
	return { code: 200, response: {} };
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