import { challenge } from './events_handlers/_challenge';
import { app_mention } from './events_handlers/_app_mention';
import { validateSlackRequest } from './_validate';
import { signingSecret } from './_constants';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function events(req: VercelRequest, res: VercelResponse) {
	const type = req.body.type;

	if (type === 'url_verification') {
		await challenge(req, res);
	} else if (validateSlackRequest(req, signingSecret)) {
		if (type === 'event_callback') {
			const event_type = req.body.event.type;

			switch (event_type) {
			case 'app_mention':
				await app_mention(req, res);
				break;
			default:
				break;
			}
		} else {
			console.log('body:', req.body);
		}
	}
}
