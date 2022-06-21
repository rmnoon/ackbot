import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkForReminders } from './_acks';
import { cleanReq } from './_util';

export default async function onCheck(req: VercelRequest, res: VercelResponse) {

	try {
		let response: unknown = {};
		let code = 400;
		
		response = await checkForReminders();
		code = 200;

		res.status(code).send(response);
	} catch (e) {
		console.error('Unexpected error: ', { error: e, req: cleanReq(req) });
		res.status(500).send({ msg: 'Unexpected error' });
	}
}
