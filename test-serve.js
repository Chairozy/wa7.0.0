const http = require("http");
const https = require("https");
const express = require('express');
const app = express();

function createServer() {
	if (process.env.APP_SECURE == 1) {
		var privateKey = fs.readFileSync( process.env.APP_SECURE_KEY );
		var certificate = fs.readFileSync( process.env.APP_SECURE_CERT );
	
		return https.createServer({
			key: privateKey,
			cert: certificate
		}, app);
	}else{
		return http.createServer(app);
	}
}
const server = createServer();

server.listen(3003, async () => {
    process.stdout('listening on')
    process.stdout(process.argv)
});