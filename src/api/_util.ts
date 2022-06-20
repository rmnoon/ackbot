import type { VercelRequest } from '@vercel/node';
import type { Readable } from 'node:stream';

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

/** bluebird doesnt work in vercel for some reason so i just adapted https://betterprogramming.pub/implement-your-own-bluebird-style-promise-map-in-js-7c081b7ad02c */
export function map<T, U>(iterable: Iterable<T>, mapper: (item: T, idx: number) => Promise<U>, concurrency = Infinity): Promise<U[]> {
	let index = 0;
	const results: U[] = [];
	const pending: Promise<U>[] = [];
	const iterator = iterable[Symbol.iterator]();

	while (concurrency-- > 0) {
		const thread = wrappedMapper();
		if (thread) pending.push(thread);
		else break;
	}

	return Promise.all(pending).then(() => results);

	function wrappedMapper(): Promise<U> {
		const next = iterator.next();
		if (next.done) return null;
		const i = index++;
		const mapped = mapper(next.value, i);
		return Promise.resolve(mapped).then(resolved => {
			results[i] = resolved;
			return wrappedMapper();
		});
	}
}
