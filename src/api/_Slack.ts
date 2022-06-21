import type { VercelRequest } from '@vercel/node';
import * as crypto from 'crypto';
import { slack } from './_constants';
import { getHeader, getRawBody, toHeaders } from './_util';

/** if true we'll echo debug information in slack, too */
const DEBUG_LOG_TO_SLACK = false;

/** See: https://api.slack.com/authentication/verifying-requests-from-slack */
export async function isValidSlackRequest(req: VercelRequest, signingSecret: string, logging = false) {
	const headers = toHeaders(req.headers);
	const requestTimestampSec = Number.parseInt(getHeader('X-Slack-Request-Timestamp', headers, true), 10);
	const signature = getHeader('X-Slack-Signature', headers, true);
	if (Number.isNaN(requestTimestampSec)) {
		throw new Error(`header x-slack-request-timestamp did not have the expected type (${requestTimestampSec})`,);
	}

	// Calculate time-dependent values
	const nowMs = Date.now();
	const fiveMinutesAgoSec = Math.floor(nowMs / 1000) - 60 * 5;

	// Enforce verification rules

	// Rule 1: Check staleness
	const isStale = requestTimestampSec < fiveMinutesAgoSec;

	// Rule 2: Check signature
	// Separate parts of signature
	const [signatureVersion, signatureHash] = signature.split('=');
	// Only handle known versions
	const versionsMismatch = signatureVersion !== 'v0';

	// Compute our own signature hash
	const bodyPayload = await getRawBody(req);
	const hmac = crypto.createHmac('sha256', signingSecret);
	hmac.update(`${signatureVersion}:${requestTimestampSec}:${bodyPayload}`);
	const ourSignatureHash = hmac.digest('hex');
	const hashMismatch = !signatureHash || signatureHash !== ourSignatureHash;

	if (logging) {
		console.log('Slack verifcation: ', { isStale, versionsMismatch, hashMismatch, ourSignatureHash, signatureHash });
	}

	return !isStale && !versionsMismatch && !hashMismatch;
}

export async function log(where: { channel: string, threadTs?: string }, message: string, json: unknown) {
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
