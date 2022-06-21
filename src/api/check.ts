import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkForReminders } from './_acks';
import { cleanReq } from './_util';

export default async function onCheck(req: VercelRequest, res: VercelResponse) {

	try {
		res.status(200).send({});
		await checkForReminders();
	} catch (e) {
		console.error('Unexpected error: ', { error: e, req: cleanReq(req) });
		res.status(500).send({ msg: 'Unexpected error' });
	}
}
