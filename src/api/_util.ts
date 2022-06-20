import type { VercelRequest } from '@vercel/node';
import * as crypto from 'crypto';
import type { Readable } from 'node:stream';

/** See: https://api.slack.com/authentication/verifying-requests-from-slack */
export async function isValidSlackRequest(req: VercelRequest, slackAppSigningSecret: string, logging = false): Promise<boolean> {
	if (!slackAppSigningSecret) {
		throw new Error('Invalid slack app signing secret');
	}
	const headers = toHeaders(req.headers);
	const slackRequestTimestamp = getHeader('X-Slack-Request-Timestamp', headers);
	const slackSignature = getHeader('X-Slack-Signature', headers);
	const bodyPayload = await getRawBody(req);
	if (!(slackRequestTimestamp && slackSignature && bodyPayload)) {
		if (logging) console.log(`Missing part in Slack's request`);
		return false;
	}
	const baseString = 'v0:' + slackRequestTimestamp + ':' + bodyPayload;
	const hash = 'v0=' + crypto.createHmac('sha256', slackAppSigningSecret)
		.update(baseString)
		.digest('hex');

	if (logging) {
		console.log('Slack verifcation:\n Request body: ' + bodyPayload + '\n Calculated Hash: ' + hash + '\n Slack-Signature: ' + slackSignature);
	}
	return slackSignature === hash;
}

export function cleanReq(req: VercelRequest) {
	return {
		method: req.method,
		url: req.url,
		headers: req.headers,
		body: JSON.stringify(req.body)
	};
}

export function toHeaders(headerMap: VercelRequest['headers']): { k: string, v: string }[] {
	const rv: { k: string, v: string }[] = [];
	for (const [header, values] of Object.entries(headerMap)) {
		const headerLower = header.toLowerCase();
		if (Array.isArray(values)) {
			for (const val of values) {
				rv.push({ k: headerLower, v: val });
			}
		} else {
			rv.push({ k: headerLower, v: values });
		}
	}
	return rv;
}

export function getHeader(header: string, headers: { k: string, v: string }[], required = false): string {
	return getHeaders(header, headers, required ? 1 : undefined)[0];
}

export function getHeaders(header: string, headers: { k: string, v: string }[], expectedNum?: number): string[] {
	const headerLower = header.toLowerCase();
	const found = headers.filter(kv => kv.k === headerLower).map(kv => kv.v);
	if (typeof expectedNum === 'number' && expectedNum !== undefined && found.length !== expectedNum) {
		throw new Error(`Expected ${expectedNum} instaces of ${headerLower} but found ${found.length}`);
	}
	return found;
}

/** See: https://vercel.com/support/articles/how-do-i-get-the-raw-body-of-a-serverless-function */
export async function getRawBody(req: VercelRequest): Promise<string> {
	const buf = await buffer(req);
	const rawBody = buf.toString('utf8');
	return rawBody;
}

async function buffer(readable: Readable) {
	const chunks = [];
	for await (const chunk of readable) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks);
}