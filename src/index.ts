import type { VercelRequest, VercelResponse } from '@vercel/node';

export default (req: VercelRequest, res: VercelResponse) => {
	res.setHeader('Content-Type', 'text/html');
	res.send(`
	<!doctype html>
	<html>
	<head>
	  <meta charset="utf-8">
	  <title>Ackbot</title>
	</head>
	
	<body>
		<h1>Ackbot</h1>
	</body>
	
	</html>
	`);
};
