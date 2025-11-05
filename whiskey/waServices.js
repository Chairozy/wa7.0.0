require('dotenv').config({path:__dirname+'/./../.env'});
const argv = process.argv.slice(2);

let makeWASocket, useMultiFileAuthState, DisconnectReason;
const QRCode = require('qrcode');
const fs = require('fs');
const mime = require("mime-types");
const moment = require('moment');
const axios = require('axios');

const http = require("http");
const https = require("https");
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const app = express();
const socketIO = require('socket.io');
const bodyParser = require('body-parser');

const { Op } = require('sequelize')
const { WhatsappService, upsert, Contact, GroupContact, MessageSentLog } = require("./db");
const { useMBSMessage } = require("./mbs_message");
const { exec } = require('child_process');
const { Sequelize } = require('sequelize');
const { useChatSocket } = require("./chats");

let mbsMessage = {}
//#region PreServer
const authPath = './auth_whiskey';
const authPathBackup = './auth_backup';
console.log( process.env.APP_SECURE_KEY );
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
const io = socketIO(server, {
	cors: {
		origin: '*',
		methos: ["GET", "POST"]
	}
});
const systemJwt = process.env.SYSTEM_JWT || null;
const shareUrl = process.env.SHARE;
const mbsUrl = process.env.MBS;
const hostUrl = process.env.HOST;
const mediaUrlPrefix = 'media';

app.use('/'+mediaUrlPrefix, express.static('public'))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json({
	limit: '200mb'
}))
app.use(bodyParser.raw())
app.use(bodyParser.text())
app.use(fileUpload());

app.use(cors({
    methods: "*",
    preflightContinue: false,
}));

app.use((req, res, next) => {
	const authorization = req.get('Authorization');
	if (req.method != "POST") {
		res.status(405).send('Method Not Allowed');
	} else if (typeof authorization === 'string' && ((service.jwt_token && authorization.replace(/^[Bb]earer\s*/g, '') == service.jwt_token) || (systemJwt && authorization.replace(/^[Bb]earer\s*/g, '') == systemJwt))) {
		next();
    } else {
        res.status(401).send('JWT Token Required or Invalid');
    }
});
//#endregion

app.post("/api/reload/jwt", async (req, res) => {
	try {
		await service.reload();
		if (req.body.jwt_token) {
			service.jwt_token = req.body.jwt_token;
		}
		res.status(200).json({ message: "Jwt Reloaded", code: 100 });
	}catch(e) {
		res.status(400).json({ message: "Service problem", code: 500 });
	}
});

app.post("/api/service/reload", async (req, res) => {
	try {
		await service.reload();
		res.status(200).json({ message: "Service Reloaded", code: 100 });
	}catch(e) {
		res.status(400).json({ message: "Service problem", code: 500 });
	}
});

app.post("/api/group/all", async (req, res) => {
	try {
		if (whatsapp.stating !== 'online') {
			res.status(400).json({ message: "Whatsapp is offline", code: 400 });
		}else{
			whatsapp.conn.groupFetchAllParticipating()
			.then((groups) => {
				let ids = []
				for (let group in groups) {
					if (whatsapp.isJidGroup(groups[group].id)) {
						let {id, subject} = groups[group] 
						ids.push({id, subject})
					}
				}
				ids = ids.sort((a, b) => {
					if (a.subject === b.subject) return 0;
					return (a.subject < b.subject) ? -1 : 1;
				});
				res.status(200).json({ message: "Group list", code: 100, data: ids });
			})
			.catch(err => {
				res.status(400).json({ message: "Service problem", code: 500 });
			})
		}
	}catch(e) {
		res.status(400).json({ message: "Service problem", code: 500 });
	}
});

app.post("/api/reciever/reload", async (req, res) => {
	mbsMessage.reloadReceivers();
	res.status(200).json({ message: "Reciever triggered reload", code: 100 });
})

app.post("/api/phone/check", async (req, res) => {
    try {
		if (whatsapp.stating !== 'online') {
			res.status(400).json({ message: "Whatsapp is offline", code: 400 });
		}else{
			let number = req.body.number || req.query.number;
			number = phoneNumberFormatter(number);
			const [result] = await whatsapp.conn.onWhatsApp(number);
			if (result && result.exists) {
				res.status(200).json({ message: "Number is exists", code: 100, result: { number, exists: true } });
			} else {
				res.status(200).json({ message: "Number is not exists", code: 200, result: { number, exists: false } });
			}
        }
    } catch (e) {
        console.log(e);
        res.status(409).json({ message: "Service problem", code: 500 });
    }
});

// { id: number }
app.post("/api/cs/notify", async (req, res) => {
	try {
		const id = req.body.id
		console.log(req.body.notif)
		if (!id) {
			res.status(400).json({ message: "Message id is invalid", code: 200 });
		}else{
			const messageSentLog = await MessageSentLog.findByPk(id);
			if (messageSentLog.sender_by && ((req.body.notif == 'start' && (messageSentLog.processed_messages > 20 || messageSentLog.schedule != null)) || req.body.notif == 'end')) {
                let sender = await messageSentLog.getSender();
				const notyfTo = [];
				const wa_service = await messageSentLog.getWhatsappService();
				if (sender) {
					if (sender.role_id == 3) {
						const admin = await wa_service.getUser();
						if (admin.phone) {
							const number = mbsMessage.messager.phoneNumberFormatter(admin.phone);
							(await mbsMessage.checkDestination(number)) ? notyfTo.push(number) : null;
						}
					}
					if (sender.phone) {
						const number = mbsMessage.messager.phoneNumberFormatter(sender.phone);
						(await mbsMessage.checkDestination(number)) ? notyfTo.push(number) : null;
					}
					// const monitoring = process.env.MONITORING.split(',');
					// if (monitoring.length > 0) {
					// 	for(let i in monitoring) {
					// 		const number = mbsMessage.messager.phoneNumberFormatter(monitoring[i]);
					// 		(await mbsMessage.checkDestination(number)) ? notyfTo.push(number) : null;
					// 	}
					// }
					if (notyfTo.length > 0) {
						let fileData = null, content = null;
						const messageMediaSentLog = await messageSentLog.getMessageMediaSentLog(),
							has_generated = messageSentLog.generated_content && typeof messageSentLog.generated_content === 'object' && !Array.isArray(messageSentLog.generated_content),
							contentKeys = has_generated ? Object.keys(messageSentLog.generated_content) : [];
			
						if (messageMediaSentLog) {
							if (!fileData) {
								fileData = await (async (url, options) => {
									try {
										options ? options : {timeout : 10}
										const res = await axios({
											method: "get",
											url,
											...options,
											responseType: 'arraybuffer'
										})
										return res.data
									} catch (e) {
										console.log(`Error : ${e}`)
										return undefined
									}
								})(messageMediaSentLog.url);
							}
							const file = {
								name: messageMediaSentLog.name,
								data: fileData,
								mimetype: mime.lookup(messageMediaSentLog.name)
							};
							content = {text: messageSentLog.message, type: 'media', file: file, ...(contentKeys.length > 0 ? {contex: messageSentLog.generated_content} : {})}
						}else{
							content = {text: messageSentLog.message, type: 'text', ...(contentKeys.length > 0 ? {contex: messageSentLog.generated_content} : {})}
						}

						let notyfMessage = '';
						if (req.body.notif == 'start') {
							notyfMessage = `*MBS Messaging*\n*(Do Not Reply)*\n\r\n*${sender.name}* telah mengirimkan pesan ${messageSentLog.message ? 'diatas ' : ''}ke *${messageSentLog.processed_messages}* nomor whatsapp melalui nomor *${wa_service.name} (${wa_service.latest_phone_auth.split(':')[0]})* pada ${moment(messageSentLog.schedule || undefined).format("D MMMM YYYY HH:mm")}`;
						}else{
							const conclusion = await messageSentLog.getMessageNumberSentLogs({
								attributes: [
									[Sequelize.fn('COUNT', Sequelize.fn('IF', Sequelize.literal("`status` = 'success'"), 1, null) ), "success"],
									[Sequelize.fn('COUNT', Sequelize.fn('IF', Sequelize.literal("`status` != 'success'"), 1, null) ), "failed"]
								]
							});
							notyfMessage = `*MBS Messaging*\n*(Do Not Reply)*\n\r\n*${sender.name}* telah mengirimkan pesan diatas ke *${messageSentLog.processed_messages}* nomor whatsapp melalui nomor *${wa_service.name} (${wa_service.latest_phone_auth.split(':')[0]})* pada ${(moment(messageSentLog.schedule || req.body.now || undefined)).format('D MMMM YYYY HH:mm')}\n\r\nProses pengiriman telah selesai pada ${moment().format('D MMMM YYYY HH:mm')}\n\r\nBerhasil: ${conclusion[0].dataValues.success || 0} nomor\nGagal : ${conclusion[0].dataValues.failed || 0} nomor`;
						}

						for(let i in notyfTo) {
							await mbsMessage.messager.send(notyfTo[i], {...content, mentions : []});
							await mbsMessage.messager.send(notyfTo[i], {text: notyfMessage, mentions : []}, 'text');
						}
					}
				}
			}
			res.status(200).json({ message: "Pesan Terkirim", code: 100 });
		}
	}catch(e){
		console.log(e)
		res.status(500).json({ message: "Service problem", code: 500 });
	}
			res.status(400).json({ message: "API Url Closed", code: 999 });
})
app.post("/api/whatsapp/send", async (req, res) => {
	try {
		const idd = req.body.id
		console.log(req.body)
		console.log(typeof req.body)
		console.log(req.body.id)
		if (!idd) {
			res.status(400).json({ message: "Message id is invalid", code: 200 });
		}else{
			await service.reload();
			const [id, with_message_id] = idd.split(";");
			const messageSentLog = await service.getMessageSentLog({ where : { id } });
			console.log(messageSentLog.schedule);
			if (with_message_id) {
				console.log("A", {id, with_message_id})
				await mbsMessage.insertQueue({id, with_message_id}, messageSentLog.schedule || undefined, false)
			}else{
				console.log("B", id)
				await mbsMessage.insertQueue(id, messageSentLog.schedule || undefined, messageSentLog.event === 'send_message')
			}
			res.status(200).json({ message: "Insert Message Successfully", code: 100 });
		}
	}catch(e) {
	console.log(e)
		res.status(500).json({ message: JSON.stringify(e), code: 500 });
	}
});

app.post("/api/whatsapp/remove", async (req, res) => {
	try {
		const id = req.body.id
		if (!id) {
			res.status(400).json({ message: "Message id is invalid", code: 200 });
		}else{
			if (mbsMessage.remove(id)) {
				res.status(200).json({ message: "Removed Successfully", code: 100 });
			}else{
				res.status(200).json({ message: "Checked ID isn't in queue", code: 101 });
			}
		}
	}catch(e) {
		console.log(e);
		res.status(500).json({ message: "Service problem", code: 500 });
	}
});

app.post("/api/whatsapp/close", async (req, res) => {
	res.sendStatus(200);
	if (whatsapp.conn) {
		await whatsapp.conn.logout().catch(err => {});
	}
	rmMultiFileAuthState();
	process.exit(0);
});

app.post("/api/whatsapp/silent", async (req, res) => {
	res.sendStatus(200);
	process.exit(0);
});
app.post("/api/whatsapp/check", async (req, res) => {
	await service.reload();
	res.json({status: Boolean(service.phone_auth)}).sendStatus(200);
});
// let indexRequest = 0;
// const limitRequest = {
// 	limit: 10,
// 	second: 30,
// 	space : [],
// 	canAccess () {
// 		return this.space.length < this.limit;
// 	},
// 	incrementRequest() {
// 		let idIndex = indexRequest++;
// 		if (indexRequest > 50) indexRequest = 0;
// 		this.space.push({
// 			id : idIndex,
// 			timeout: setTimeout(this.pull, this.second * 1000, idIndex)
// 		});
// 	},
// 	pull(id) {
// 		limitRequest.space = limitRequest.space.filter(item => item.id !== id)
// 	}
// }

app.post("/api/content/generate", async (req, res) => {
	rawContent = null;
	generatedContent = null;
	if (req.body.type === 'location') {
		rawContent = {
			degreesLatitude: req.body.degreesLatitude || req.query.degreesLatitude,
			degreesLongitude: req.body.degreesLongitude || req.query.degreesLongitude,
			name: req.body.name || req.query.name,
			url: req.body.url || req.query.url,
			address: req.body.address || req.query.address
		}
		for(let i in rawContent) {
			if (rawContent[i] === undefined) {
				delete rawContent[i]
			}else if ((i === "degreesLatitude" || i === "degreesLongitude") && typeof rawContent[i] === "string") {
				rawContent[i] = parseFloat(rawContent[i])
			}
		}
		rawContent = {location: rawContent}
		let location = JSON.parse(JSON.stringify(rawContent.location))
		try {
			location = mbsMessage.messager.createLocation(location)
		}catch(e) {
			if (typeof e === 'string') {
				let isErrorString = typeof e === 'string'
				res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 12 : 0 });
				return;
			}
		}
		generatedContent = {location}
	}else if (req.body.type === 'contact' || req.body.type === 'contacts') {
		let contact = null;
		if (req.is('application/json')) {
			if (!req.body.contacts) {
				res.status(400).json({ message: "contacts is required", code: 12 });
				return;
			}
			if (!Array.isArray(req.body.contacts)) {
				res.status(400).json({ message: "contacts must array", code: 12 });
				return;
			}
			rawContent = {contacts: {contacts: req.body.contacts}}
			contact = JSON.parse(JSON.stringify(rawContent.contacts.contacts))
		}else{
			let address_home = req.body.address_home || req.query.address_home;
			if (address_home && !Array.isArray(address_home)) address_home = [address_home];
			let address_work = req.body.address_work || req.query.address_work
			if (address_work && !Array.isArray(address_work)) address_work = [address_work];
			rawContent = {
				fullname: req.body.fullname || req.query.fullname,
				nickname: req.body.nickname || req.query.nickname,
				organization: req.body.organization || req.query.organization,
				birth_day: req.body.birth_day || req.query.birth_day,
				url: req.body.url || req.query.url,
				email: req.body.email || req.query.email,
				whatsapp: req.body.whatsapp || req.query.whatsapp,
				telephone: req.body.telephone || req.query.telephone,
				...(address_home ? {address_home} : {}),
				...(address_work ? {address_work} : {})
			}
			for(let i in rawContent) {
				if (rawContent[i] === undefined) {
					delete rawContent[i]
				}
			}
			rawContent = {contacts: {contacts: [rawContent]}}
			contact = JSON.parse(JSON.stringify(rawContent.contacts.contacts))
		}
		for(let i in contact) {
			try {
				contact[i] = {vcard: mbsMessage.messager.createContact(contact[i]), displayName: contact[i].fullname}
			}catch(e) {
				console.log(e)
				let isErrorString = typeof e === 'string'
				res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 13 : 0 });
				return;
			}
		}
		generatedContent = {contacts: {contacts: contact}}
	}else{
		rawContent = {};
		rawContent.buttons = req.body.buttons || req.query.buttons
		if (rawContent.buttons && !Array.isArray(rawContent.buttons) && typeof rawContent.buttons === 'string') rawContent.buttons = [rawContent.buttons];
		rawContent.footer = req.body.footer || req.query.footer
		rawContent.title = req.body.title || req.query.title
		if (req.is('application/json')) {
			rawContent.templateButtons = req.body.templateButtons || req.query.templateButtons
			rawContent.list = req.body.list || req.query.list
		}
		const attribute = JSON.parse(JSON.stringify(rawContent));
		const result = {}
		try {
			for(let i in attribute) {
				if (!attribute[i]) {
					delete attribute[i]
				}else if (i == 'title'){
					result.title = mbsMessage.messager.validationTitle(attribute[i]);
				}else if (i == 'footer'){
					result.footer = mbsMessage.messager.validationFooter(attribute[i]);
				}else if (i == 'buttons'){
					result.buttons = mbsMessage.messager.createButton(attribute[i]);
				}else if(i == 'templateButtons') {
					result.templateButtons = mbsMessage.messager.createTemplateButtons(attribute[i]);
				}else if(i == 'list') {
					let {sections, buttonText} = mbsMessage.messager.createList(attribute[i]);
					result.sections = sections;
					result.buttonText = buttonText;
				}
			}
		}catch(e) {
			console.log(e)
			let isErrorString = typeof e === 'string'
			res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 11 : 0 });
			return;
		}
		generatedContent = Object.keys(result).length > 0 ? result : true;
	}
	res.status(200).json({ data: generatedContent, message: 'Generated and validated successfully' });
});

const types = ['message', 'text', 'media', 'file', 'location', 'contact', 'contacts']
const mediaTypes = ['media', 'file']
app.post("/api/message/send", async (req, res) => {
	let number = req.body.to || req.query.to,
		content = {
			type : req.body.type || req.query.type || 'text'
		};
	console.log(req.body)
	if (!number) {
		res.status(400).json({ message: "Whatsapp number is required", code: 1 });
		return;
	}else{
		number = mbsMessage.messager.phoneNumberFormatter(number);
	}
	if (!types.includes(content.type)) {
		res.status(400).json({ message: "Type is not available", code: 9 });
		return;
	}
	if (content.type && mediaTypes.includes(content.type) && !((req.files && (req.files.file || req.files.image)) || req.body.file)) {
		res.status(400).json({ message: "Media file not found", code: 2 });
		return;
	}
	if ((content.type === 'message' || content.type === 'text') && !(req.body.text || req.query.text)) {
		res.status(400).json({ message: "Text is required", code: 10 });
		return;
	}
	let rawContent = null;
	const generatedContent = (() => {
        if (content.type === 'location') {
            rawContent = {
                degreesLatitude: req.body.degreesLatitude || req.query.degreesLatitude,
                degreesLongitude: req.body.degreesLongitude || req.query.degreesLongitude,
                name: req.body.name || req.query.name,
                url: req.body.url || req.query.url,
                address: req.body.address || req.query.address
            }
            for(let i in rawContent) {
                if (rawContent[i] === undefined) {
                    delete rawContent[i]
                }else if ((i === "degreesLatitude" || i === "degreesLongitude") && typeof rawContent[i] === "string") {
					rawContent[i] = parseFloat(rawContent[i])
				}
            }
			rawContent = {location: rawContent}
			let location = JSON.parse(JSON.stringify(rawContent.location))
            try {
                location = mbsMessage.messager.createLocation(location)
            }catch(e) {
                if (typeof e === 'string') {
                    let isErrorString = typeof e === 'string'
                    res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 12 : 0 });
                    return;
                }
            }
			return {location}
        }else if (content.type === 'contact' || content.type === 'contacts') {
            let contact = null;
            if (req.is('application/json')) {
                if (!req.body.contacts) {
                    res.status(400).json({ message: "contacts is required", code: 12 });
                    return;
                }
                if (!Array.isArray(req.body.contacts)) {
                    res.status(400).json({ message: "contacts must array", code: 12 });
                    return;
                }
				rawContent = {contacts: {contacts: req.body.contacts}}
				contact = JSON.parse(JSON.stringify(rawContent.contacts.contacts))
            }else{
                let address_home = req.body.address_home || req.query.address_home;
                if (address_home && !Array.isArray(address_home)) address_home = [address_home];
                let address_work = req.body.address_work || req.query.address_work
                if (address_work && !Array.isArray(address_work)) address_work = [address_work];
                rawContent = {
                    fullname: req.body.fullname || req.query.fullname,
                    nickname: req.body.nickname || req.query.nickname,
                    organization: req.body.organization || req.query.organization,
                    birth_day: req.body.birth_day || req.query.birth_day,
                    url: req.body.url || req.query.url,
                    email: req.body.email || req.query.email,
                    whatsapp: req.body.whatsapp || req.query.whatsapp,
                    telephone: req.body.telephone || req.query.telephone,
                    ...(address_home ? {address_home} : {}),
                    ...(address_work ? {address_work} : {})
                }
                for(let i in rawContent) {
                    if (rawContent[i] === undefined) {
                        delete rawContent[i]
                    }
                }
				rawContent = {contacts: {contacts: [rawContent]}}
				contact = JSON.parse(JSON.stringify(rawContent.contacts.contacts))
            }
            for(let i in contact) {
                try {
                    contact[i] = {vcard: mbsMessage.messager.createContact(contact[i]), displayName: contact[i].fullname}
                }catch(e) {
										console.log(e)
                    let isErrorString = typeof e === 'string'
                    res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 13 : 0 });
                    return;
                }
            }
            return {contacts: {contacts: contact}}
        }else{
					rawContent = {};
					rawContent.buttons = req.body.buttons || req.query.buttons
					if (rawContent.buttons && !Array.isArray(rawContent.buttons) && typeof rawContent.buttons === 'string') rawContent.buttons = [rawContent.buttons];
					rawContent.footer = req.body.footer || req.query.footer
					rawContent.title = req.body.title || req.query.title
					if (req.is('application/json')) {
						rawContent.templateButtons = req.body.templateButtons || req.query.templateButtons
						rawContent.list = req.body.list || req.query.list
					}
					const attribute = JSON.parse(JSON.stringify(rawContent));
					const result = {}
					try {
						for(let i in attribute) {
							if (!attribute[i]) {
								delete attribute[i]
							}else if (i == 'title'){
								result.title = mbsMessage.messager.validationTitle(attribute[i]);
							}else if (i == 'footer'){
								result.footer = mbsMessage.messager.validationFooter(attribute[i]);
							}else if (i == 'buttons'){
								result.buttons = mbsMessage.messager.createButton(attribute[i]);
							}else if(i == 'templateButtons') {
								result.templateButtons = mbsMessage.messager.createTemplateButtons(attribute[i]);
							}else if(i == 'list') {
								let {sections, buttonText} = mbsMessage.messager.createList(attribute[i]);
								result.sections = sections;
								result.buttonText = buttonText;
							}
						}
					}catch(e) {
						console.log(e)
						let isErrorString = typeof e === 'string'
						res.status(isErrorString ? 400 : 500).json({ message: isErrorString ? e : 'Unknown Problem', code: isErrorString ? 11 : 0 });
						return;
					}
					return Object.keys(result).length > 0 ? result : true;
        }
    })()
    if (!generatedContent) return;

	let dataFile = null;
	if (req.body.file) {
		dataFile = {...req.body.file};
		try {
			if (!dataFile.name) throw "File name is required";
			if (typeof dataFile.name !== "string") throw "File name must string";
			if (!dataFile.data) throw "File data is required";
			if (typeof dataFile.data !== "string") throw "File data must string";
			if (!dataFile.mimetype) throw "File mimetype is required";
			if (typeof dataFile.mimetype !== "string") throw "File mimetype must string";
		}catch(e) {
			if (typeof e === "string") {
				res.status(429).json({ message: "File must base64", code: 14 });
				return;
			}
		}
		dataFile.data = Buffer.from(dataFile.data, 'base64');
		if (!dataFile.data) {
			res.status(429).json({ message: "File must base64", code: 14 });
			return;
		}
	}

	const messageSentLog = await service.createMessageSentLog({
		message: req.body.text || req.query.text || '',
		event: 'api_send_message',
		raw_content: generatedContent === true || !generatedContent ? null : rawContent,
		generated_content: generatedContent === true || !generatedContent ? null : generatedContent,
		processed_messages: 1,
	});

	await service.reload();
	const cost_credits = user.is_subscription_service ? 0 : service.cost_per_message
	async function insertNumber(status = null, response = null) {
		await messageSentLog.createMessageNumberSentLog({
			number: number,
			entity: [number],
			host: req.socket.remoteAddress,
			status: status,
			response: response,
			cost_credits: (status === 'success' || !status) ? cost_credits : 0
		});
		if (status) {
			messageSentLog.status = 'complete';
			await messageSentLog.save({fields:["status"]});
		}
	}

	try {
		if (req.files != null || dataFile) {
			if (dataFile) {
				content.file = {...dataFile}
			}else if (req.files.file !== undefined) {
				content.file = req.files.file;
						} else if (req.files.image !== undefined) {
				content.file = req.files.image;
			}
			if (content.file) {
				const now = new Date();
				const tomonthPath = [now.getFullYear(), now.getMonth() + 1].join("-");
				if (!fs.existsSync("./public")) {
					fs.mkdirSync("./public")
				}
				if (!fs.existsSync("./public/"+tomonthPath)) {
					fs.mkdirSync("./public/"+tomonthPath)
				}
				const filename = [service.id, messageSentLog.id, now.getTime(), content.file.name].join("-");
				const filepath = tomonthPath+"/"+filename;
				const extension = mime.extension(content.file.mimetype) || '';

				fs.writeFileSync("./public/"+filepath, content.file.data);

				await messageSentLog.createMessageMediaSentLog({
					name: filename,
					extension: extension,
					url: hostUrl+':'+service.session+'/'+mediaUrlPrefix+'/'+filepath
				});
			}
		}

		// if (!limitRequest.canAccess()) {
		// 	const message = "Batasan 10 Permintaan per 30 detik telah tercapai";
		// 	await insertNumber("abort", message);
		// 	res.status(429).json({ message: message, code: 3 });
		// 	return;
		// }

		// limitRequest.incrementRequest();

		//if (whatsapp.stating !== 'online') {
		//	const message = "Nomor Whatsapp Offline";
		//	await insertNumber("abort", message);
		//	res.status(409).json({ message: message, code: 4 });
		//	return;
		//}

		if (user.is_subscription_service) {
			const message = "Pesan Diproses";
			await insertNumber();
			const result = await mbsMessage.insertQueue(messageSentLog.id, messageSentLog.schedule || undefined, false)
			res.status(200).json({ message: message });
		}else{
			if ((user.credits - cost_credits) < 0.00) {
				const message = "Kredit tidak mencukupi";
				await insertNumber("abort", message);
				res.status(402).json({ message: message, code: 5 });
				return;
			}else{
				const message = "Pesan Diproses";
				const credit_before_changes = user.credits,
					amount_change_in_credits = cost_credits,
					latest_credit = credit_before_changes - amount_change_in_credits;
				user.credits -= cost_credits;
				await user.save({fields:["credits"]});
				await messageSentLog.createCreditHistory({
					user_id: user.id,
					event: 'api_send_message',
					credit_before_changes,
					amount_change_in_credits,
					latest_credit
				});
				await insertNumber();
				const result = await mbsMessage.insertQueue(messageSentLog.id, messageSentLog.schedule || undefined, false)
				res.status(200).json({ message: message });
			}
		}

		// if (messageSentLog.message) {
		// 	const {text, mentions} = await mbsMessage.messager.extractMention(messageSentLog.message)
		// 	content.text = text;
		// 	content.mentions = mentions;
		// }

		// if (messageSentLog.generated_content) {
		// 	content.contex = messageSentLog.generated_content;
		// }

		// const found = await mbsMessage.checkDestination(number);
		// if (found) {
		// 	await user.reload();
		// 	if ((user.credits - cost_credits) < 0.00) {
		// 		const message = "Kredit tidak mencukupi";
		// 		await insertNumber("abort", message);
		// 		res.status(402).json({ message: message, code: 5 });
		// 		return;
		// 	}else{
		// 		mbsMessage.messager.send(number, content);
		// 		const message = "Pesan Terkirim";
		// 		const credit_before_changes = user.credits,
		// 			amount_change_in_credits = cost_credits,
		// 			latest_credit = credit_before_changes - amount_change_in_credits;
		// 		user.credits -= cost_credits;
		// 		await user.save({fields:["credits"]});
		// 		await messageSentLog.createCreditHistory({
		// 			user_id: user.id,
		// 			event: 'api_send_message',
		// 			credit_before_changes,
		// 			amount_change_in_credits,
		// 			latest_credit
		// 		});
		// 		await insertNumber("success", message);
		// 		res.status(200).json({ message: message });
		// 	}
		// }else if(found === false){
		// 	const message = "Nomor Tujuan Tidak Valid";
		// 	await insertNumber("failed", message);
		// 	res.status(400).json({ message: message, code: 6 });
		// }else{
		// 	const message = "Nomor Whatsapp Offline";
		// 	await insertNumber("abort", message);
		// 	res.status(409).json({ message: message, code: 7 });
		// }
    } catch (e) {
		console.log(e)
		const message = "Service Tidak Berjalan / Hubungi Admin";
		await insertNumber("abort", message);
		res.status(500).json({ message: message, code: 8 });
    }
});

//#region Socket
let service = null,
	user = null;

let timerClose = null;
function setAutoClose(status, mm = 30000) {
	timerClose = setTimeout(async (status) => {
		if (sockets.guest.length <= 0) exec('pm2 delete wa'+argv[0]);
	}, mm, status);
}
function removeAutoClose() {
	clearTimeout(timerClose);
	timerClose = null;
}

const whatsapp = {conn: null, stating: "beginning"}
let sockets = {
	guest: []
};
let data_qr = undefined;


function socketEmit(name, data, socket = null) {
	if (socket) {
		socket.emit(name, {stating: whatsapp.stating, data})
	}else{
		sockets.guest.every(client => 
			client.socket.emit(name, {stating: whatsapp.stating, data})
		);
	}
}

function rmMultiFileAuthState() {
	if (fs.existsSync(authPath + '/' + service.id))
	fs.rmSync(authPath + '/' + service.id, { recursive: true, force: true });
	console.log("REMOVE AUTHENTICATION")
}

function restoreCreds() {
	if (!fs.existsSync(authPathBackup + '/' + service.id + '/creds.json')) return;
	if (!fs.existsSync(authPath))
		fs.mkdirSync(authPath);
	if (!fs.existsSync(authPath + '/' + service.id))
		fs.mkdirSync(authPath + '/' + service.id);
	if (fs.existsSync(authPath + '/' + service.id + '/creds.json'))
		fs.rmSync(authPath + '/' + service.id + '/creds.json', { force: true });
	fs.copyFileSync(authPathBackup + '/' + service.id + '/creds.json', authPath + '/' + service.id + '/creds.json')
	console.log("RESTORE CREDS")
}

function backupCreds() {
	if (!fs.existsSync(authPath + '/' + service.id)) return;
	if (!fs.existsSync(authPathBackup))
		fs.mkdirSync(authPathBackup);
	if (!fs.existsSync(authPathBackup + '/' + service.id))
		fs.mkdirSync(authPathBackup + '/' + service.id);
	if (fs.existsSync(authPathBackup + '/' + service.id + '/creds.json'))
		fs.rmSync(authPathBackup + '/' + service.id + '/creds.json', { recursive: true, force: true });
	fs.copyFileSync(authPath + '/' + service.id + '/creds.json', authPathBackup + '/' + service.id + '/creds.json')
}

function deleteEmoticon(inputString) {
	const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u2B55]|[\u23cf]|[\u23e9-\u23f4]|[\u23f8-\u23fa]|[\uD83C][\uDF00-\uDFFF]|[\uD83D][\uDC00-\uDE4F]/g;
    return inputString.replace(regex, '');
}

const monitor_loop_whiskey = {
	queue: [],
	check: function (minute = 2) {
		this.queue.push(setTimeout(() => {
			this.queue.shift()
		}, (minute * 60) * 1000));
		const countReconnect = this.queue.length
		console.log("connecting loop", countReconnect)
		return countReconnect
	},
	clear: function () {
		for(let i of this.queue) {
			clearTimeout(i)
		}
		this.queue.length = 0
		console.log("clearing connecting loop")
	},
	step: 0,
	is_old: false,
	once: true
}

setTimeout(() => {
	monitor_loop_whiskey.is_old = true
}, (5 * 60) * 1000)

const controllChat = useChatSocket(io, whatsapp)

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const emptyLogger = {
	child: () => {return emptyLogger},
	trace: () => {},
	info: () => {},
	error: (e) => {},
	debug: () => {},
	warn: () => {},
}
// const store = makeInMemoryStore({ logger: emptyLogger })

// async function getMessage(key) {
// 	if(store) {
// 		const msg = await store.loadMessage(key.remoteJid, key.id)
// 		return msg.message || undefined
// 	}

// 	return proto.Message.fromObject({})
// }

async function connect () {
	if (!fs.existsSync(authPath)) {
		fs.mkdirSync(authPath)
	}
	if (monitor_loop_whiskey.once && !fs.existsSync(authPath + '/' + service.id + '/creds.json')) {
		restoreCreds();
		monitor_loop_whiskey.once = false
	}
	let { state, saveCreds } = await useMultiFileAuthState(authPath + '/' + service.id);
	let conn = controllChat.rebindStoreBuffer(() => {
		return makeWASocket({
			browser: ["MBS Messaging", "Google Chrome", "4.0.0"],
			auth: state,
			// downloadHistory: true,
			// syncFullHistory: true,
			logger: emptyLogger,
			//getMessage
		})
	})
	//store.bind(conn.ev) 

	conn.ev.on('connection.update', async (update) => {
		const { connection, lastDisconnect, qr } = update;
		console.log({ connection });
		if(connection === 'close') {
			let loggedOut = (lastDisconnect.error)?.output?.statusCode === DisconnectReason.loggedOut;
			console.log('reason', loggedOut ? 'IS LOGOUT' : 'SAFE')
			data_qr = undefined;
			whatsapp.stating = 'offline'
			if (loggedOut) {
				service.phone_auth = null;
				service.save({fields: ["phone_auth"]})
			}
			if (!loggedOut) {
				if (monitor_loop_whiskey.check() > 5) {
					monitor_loop_whiskey.step++;
					console.log("SERVICE HAS BEEN LOOP CONNECTING 5 TIMES IN STEP ", monitor_loop_whiskey.step)
					if (monitor_loop_whiskey.step == 1) {
						restoreCreds();
					}else if(monitor_loop_whiskey.step == 2) {
						monitor_loop_whiskey.step = 0;
						// axios.default.post(`${hostUrl}:${5306}/api/message/send`, {
						// 	to: '6289634858618',
						// 	type: 'text',
						// 	text: "*SERVICE HAS BEEN LOOP CONNECTING 5 TIMES*\n\r\nID: "+service.id+"\nNAME: "+(service.name || '-')
						// }, {
						// 	headers: {
						// 		authorization: '12345'
						// 	},
						// }).catch(err => {});
						if (!monitor_loop_whiskey.is_old) {
							rmMultiFileAuthState();
						}
					}
				}
				connect();
			}else if (sockets.guest.length > 0){
				rmMultiFileAuthState();
				connect();
			}else{
				rmMultiFileAuthState();
				setAutoClose(loggedOut ? "loged out" : "offline");
			}
		}else if (qr) {
			service.phone_auth = null;
			service.save({fields: ["phone_auth"]})
			if (timerClose == null && sockets.guest.length <= 0) {
				setAutoClose("offline");
			}
			QRCode.toBuffer(qr, function (error, buffer) {
				if (error) return console.error(error);
				data_qr = buffer.toString('base64');
				whatsapp.stating = "qr";
				socketEmit('qr', data_qr);
			});
		}else if (connection === 'open'){
			removeAutoClose();
			data_qr = undefined;
			whatsapp.conn = conn;
			whatsapp.stating = "online";
			service.phone_auth = conn.user.id;
			service.latest_phone_auth = conn.user.id;
			service.save({fields: ["phone_auth", "latest_phone_auth"]})
			socketEmit('user', whatsapp.conn.user);
			mbsMessage.freshDatabaseQueue();
			mbsMessage.reloadReceivers();
			await (new Promise(resolve => setTimeout(resolve, 1000)))
			backupCreds();
			const result = await conn.groupFetchAllParticipating().catch(err => console.log('ga bisa'));
			if (!result) return;
			const myAuthPhone = conn.user.id.replace(/:\d*@/g, '@')
			const available = [];
			for(let i in result) {
				available.push(result[i].id);
				await upsert(GroupContact, {name: result[i].subject, number: result[i].id, whatsapp_auth: myAuthPhone}, {whatsapp_auth: myAuthPhone, number: result[i].id})
			}
			await GroupContact.destroy({
				where: {
					whatsapp_auth: myAuthPhone,
					number: {
						[Op.notIn]: available
					}
				}
			});
		}
	})
	// listen for when the auth credentials is updated
	conn.ev.on('creds.update', saveCreds);
	conn.ev.on('contacts.upsert', async (data) => {
		if (data.length > 0) {
			const myAuthPhone = conn.user.id.replace(/:\d*@/g, '@')
			for(let i in data) {
				await upsert(Contact, {name: deleteEmoticon(data[i].name), number: data[i].id, whatsapp_auth: myAuthPhone}, {whatsapp_auth: myAuthPhone, number: data[i].id})
			}
		}
	})
	conn.ev.on('groups.upsert', async (data) => {
		const myAuthPhone = conn.user.id.replace(/:\d*@/g, '@')
		for(let i in data) {
			await upsert(GroupContact, {name: data[i].subject, number: data[i].id, whatsapp_auth: myAuthPhone}, {whatsapp_auth: myAuthPhone, number: data[i].id})
		}
	})
	conn.ev.on('groups.update', async (data) => {
		const myAuthPhone = conn.user.id.replace(/:\d*@/g, '@')
		for(let i in data) {
			await upsert(GroupContact, {name: data[i].subject, number: data[i].id, whatsapp_auth: myAuthPhone}, {whatsapp_auth: myAuthPhone, number: data[i].id})
		}
	})
	conn.ev.on('group-participants.update', async (data) => {
		const myAuthPhone = conn.user.id.replace(/:\d*@/g, '@')
		if (data.action === 'remove' && data.participants.includes(myAuthPhone)) {
			GroupContact
			.findOne({ where: {whatsapp_auth: myAuthPhone, number: data.id} })
			.then(function(obj) {
				if(obj) {
					obj.destroy();
				}
			});
		}
	})
	conn.ev.on('messages.upsert', async (data) => {
		mbsMessage.forward(data);
	})
}

io.on("connection", function (socket) {
    let id = socket.handshake.auth.token;

	const clientId = Date.now();
	sockets.guest.push({id, clientId, socket})
	console.log("connected: ", clientId, id, '('+sockets.guest.length+')');

	if (data_qr) {
		socketEmit('qr', data_qr);
	}
	if (whatsapp.conn && whatsapp.stating == 'online') {
		socketEmit('user', whatsapp.conn.user);
	}

	socket.on('disconnect', (reason) => {
		sockets.guest = sockets.guest.filter(client => client.clientId !== clientId);
		console.log("disconnected: ", clientId, id, '('+(sockets.guest.length)+')');

		if (sockets.guest.length <= 0 && whatsapp.stating !== 'online') {
			setAutoClose('offline')
		}
	})
});

(async () => {
	const { default: defa } = await import('baileys'); // Dynamic import of an ESM module
	makeWASocket = defa;
	const { useMultiFileAuthState: a1 , DisconnectReason: a2, isJidGroup: a3, downloadMediaMessage: a4 } = await import('baileys');
	useMultiFileAuthState = a1;
	DisconnectReason = a2;
	whatsapp.isJidGroup = a3;
	whatsapp.downloadMediaMessage = a4;

	service = (await WhatsappService.findByPk(argv[0]));
	user = await service.getUser();
	if (service === null || user === null) {
		process.exit(0);
	}else{
		//store.readFromFile(`./store/${service.id}.json`)
		//setInterval(() => {
		//	store.writeToFile(`./store/${service.id}.json`)
		//}, 10_000)
		mbsMessage = useMBSMessage(whatsapp, service, user)

		process.on('message', function(packet) {
			if (packet.type == "process:message") {
				const { action } = packet.data
				if (action == "reset") {
					process.stdout.write("event pm2: " + action)
					mbsMessage.freshDatabaseQueue();
				}
			}
		});
		controllChat.bindIoChat(service, mbsMessage)
		mbsMessage.startWatch();
		server.listen(service.session, async () => {
			console.log('listening on ' + service.session);
			connect()
		});
	}
})();
//#endregion

