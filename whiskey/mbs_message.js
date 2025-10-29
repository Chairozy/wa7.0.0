const { useMessage } = require("./message");
const { office } = require("./office");
const { MessageNumberSentLog, ForwardReceiver, OutForwardReceiver, MessageSentLog, GroupContact, Contact } = require("./db");
const mime = require("mime-types");
const fs = require('fs');
const { Op, Sequelize } = require("sequelize");
const axios = require('axios');
const moment = require('moment')
const { sequelize } = require("./db");
const { useSqlTrack } = require("./activity");

const mediaTypeCaptionable = ['imageMessage', 'videoMessage', 'documentMessage'];
const mediaType = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
const nonMediaType = ['extendedTextMessage', 'liveLocationMessage', 'locationMessage', 'contactMessage'];

const messageLimitedTypes = ['viewOnceMessage', 'ephemeralMessage', 'documentWithCaptionMessage', 'viewOnceMessageV2', 'deviceSentMessage'];
const noteMessageTypes = ['sendPaymentMessage', 'requestPaymentMessage'];
const conversationType = 'conversation';
const removeTypes = ['messageContextInfo'];

const hostUrl = 'https://api.whatsapp.maestrobyte.com';
const mediaUrlPrefix = 'media';

function useMBSMessage (whatsapp, service, user) {
    const messager = useMessage(whatsapp);
    const activity = useSqlTrack('wa'+service.id);
    let checkDestination = messager.checkDestination;

    class Magazine {
        constructor(messageSentLog, process, destroy = () => {}) {
            this.abortReason = {
                offline: 'Nomor Whatsapp Offline',
                credit: 'Kredit tidak mencukupi',
                abort: 'Dibatalkan oleh user'
            };
            this.content = null;
            this.messageSentLog = messageSentLog;
            this.process = process;
            this.process.abort = this.messageSentLog.status == 'process' ? null : this.messageSentLog.status;
            this.numbers = [];
            this.fileData = null;
            this.waiting_response = false;
            this.destroy = destroy;
        }

        async createContent () {
            const messageMediaSentLog = await this.messageSentLog.getMessageMediaSentLog(),
                generated_content = this.messageSentLog.generated_content && JSON.parse(this.messageSentLog.generated_content),
                has_generated = generated_content && typeof generated_content === 'object' && !Array.isArray(generated_content),
                contentKeys = has_generated ? Object.keys(generated_content) : [];

            if (messageMediaSentLog) {
                if (!this.fileData) {
                    this.fileData = await this.getBuffer(messageMediaSentLog.url);
                }
                const file = {
                    name: messageMediaSentLog.name,
                    data: this.fileData,
                    mimetype: mime.lookup(messageMediaSentLog.name)
                };
                return {text: this.messageSentLog.message, type: 'media', file: file, ...(contentKeys.length > 0 ? {contex: generated_content} : {})}
            }else{
                if (has_generated && contentKeys.includes('contacts')) {
                    return {contex: generated_content, type : 'contacts'}
                }else if (has_generated && contentKeys.includes('location')){
                    return {contex: generated_content, type : 'location'}
                }else{
                    console.log({conlen: contentKeys.length})
                    return {text: this.messageSentLog.message, type: 'text', ...(contentKeys.length > 0 ? {contex: generated_content} : {})}
                }
            }
        }

        async getBuffer (url, options) {
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
        }
    
        async loadNumber (limit = 10) {
            this.numbers = await this.messageSentLog.getMessageNumberSentLogs({
                where : {
                    status: null,
                    id: {
                        [Op.notIn]: this.numbers.map(item => item.id)
                    }
                },
                limit
            })
        }

        async toAbortStatus (response = null) {
            const payload = {status: 'failed', cost_credits: 0};
            if (response) {
                payload.response = response;
            }
            this.numbers = await MessageNumberSentLog.update(payload, {where : {status: null, message_sent_log_id: this.messageSentLog.id}})
        }
        
        async numberFailed (messageNumberSentLog) {
            console.log(messageNumberSentLog.number, "failed");
            messageNumberSentLog.cost_credits = 0;
            messageNumberSentLog.status = 'failed';
            messageNumberSentLog.response = 'Nomor Tujuan Tidak Valid';
            messageNumberSentLog.save({fields: ["number", "cost_credits", "status", "response"]});
        }
        
        async numberSuccess (messageNumberSentLog) {
            console.log(messageNumberSentLog.number, "success");
            messageNumberSentLog.status = 'success';
            messageNumberSentLog.response = 'Pesan Terkirim';
            messageNumberSentLog.save({fields: ["number", "status", "response"]});
        }
    
        async play () {
            let n = 0,
                now = moment();
            if (!this.process.abort) {
                await service.reload();
                this.content = await this.createContent();
                let querySave = ['status'];
                if (!this.messageSentLog.status) {
                    querySave.push('send_at');
                    this.messageSentLog.send_at = now.format('YYYY-MM-DD HH:mm:ss');
                }
                this.messageSentLog.status = 'process';
                await this.messageSentLog.save({fields: querySave});
                await this.loadNumber();
                let first_sent = true;
                while(this.numbers.length > 0 && !this.process.abort) {
                    const messageNumberSentLog = this.numbers[n];
                    if (messageNumberSentLog) {
                        !first_sent && !this.hasParallel && await office.parallelPromise();
                        first_sent = false;
                        // if ((user.credits - service.cost_per_message) > 0.00) {
                            console.log("proses kirim");
                            let pending = await this.sent(messageNumberSentLog);
                            if (pending) {
                                console.log("pending kirim")
                                return;
                            }
                        // }else{
                        //     this.process.abort = 'credit';
                        // }
                    }else{
                        await this.loadNumber();
                        n = -1;
                    }
                    n++;
                }
            }
            if (this.process.abort) {
                const reason = this.abortReason[this.process.abort] || null;
                await this.toAbortStatus(reason);
                // if (this.process.abort == 'clear') {
                //     office.replaceQueue([]);
                // }
                this.messageSentLog.status = 'abort';
            }else{
                this.messageSentLog.status = 'complete';
            }
            await this.messageSentLog.save({fields: ['status']});

            if (!user.is_subscription_service) {
                const used = await MessageNumberSentLog.sum(
                    'cost_credits',
                    {
                        where: {
                            message_sent_log_id: this.messageSentLog.id,
                            status: 'success',
                        }
                    }
                );
                const latestCreditHistory = await this.messageSentLog.getCreditHistory({
                    where: {
                        event: {
                            [Op.in]: ['send_message', 'api_send_message']
                        },
                    }
                });
                if (latestCreditHistory) {
                const refund = latestCreditHistory.amount_change_in_credits - used;
                if (refund > 0) {
                    await user.reload();
                    const credit_before_changes = user.credits,
                        amount_change_in_credits = refund,
                        latest_credit = credit_before_changes + amount_change_in_credits;
                    user.credits += amount_change_in_credits;
                    await user.save({fields:["credits"]});
                    await this.messageSentLog.createCreditHistory({
                        user_id: user.id,
                        event: 'refund',
                        credit_before_changes,
                        amount_change_in_credits,
                        latest_credit
                    });
                }
                }
            }
            if (this.messageSentLog.event == 'send_message') {
                axios.post(`${hostUrl}:${5306}/api/cs/notify`, {
                    id: this.messageSentLog.id,
                    notif: 'end',
                    now: now.format('YYYY-MM-DD HH:mm')
                }, {
                    headers: {
                        authorization: '12345'
                    },
                });
            }
            await (new Promise(r => setTimeout(r, office.randomTicks())));

            this.destroy();
        }

        async sent (messageNumberSentLog) {
            const number = messager.phoneNumberFormatter(messageNumberSentLog.number);
            messageNumberSentLog.number = number;
	    if (typeof messageNumberSentLog.entity === 'string') {
                messageNumberSentLog.entity = JSON.parse(messageNumberSentLog.entity);
            }
            const found = await checkDestination(number);
            if (found === true) {
                const content = {...this.content};
                if (content.text && messageNumberSentLog.entity) {
                    const {text, mentions} = await messager.extractMention(this.messageSentLog.message)
                    content.text = text.replace(/{{\w}}/g, (x) => {
                        return messageNumberSentLog.entity[x[2].toUpperCase().charCodeAt(0) - 65];
                    });
                    if (mentions) {
                        content.mentions = mentions;
                    }
                }
                messager.send(number, content);
                await this.numberSuccess(messageNumberSentLog);
            } else if (found === false) {
                await this.numberFailed(messageNumberSentLog);
            } else {
                // this.process.abort = 'offline';
                office.replaceQueue([]);
                this.destroy();
                return true;
            }
            return false;
        }
    }

    office.command = async (id, next) => {
        const messageSentLog = await service.getMessageSentLog({ where : { id : id } });
        (new Magazine(messageSentLog, office.process.get(id), next)).play();
    }

    function insertQueue(id, date = undefined, notif = true) {
        office.add(id, date);
        if (notif) {
            axios.post(`${hostUrl}:${5306}/api/cs/notify`, {
                id: id,
                notif: 'start'
            }, {
                headers: {
                    authorization: '12345'
                },
            });
        }
        return office.toProcess();
    }

    function startWatch() {
        office.start()
    }

    function freshDatabaseQueue() {
        if (office.beforeProcess) return;
        office.beforeProcess = async () => {
            const queue = [];
            const messageSentLogs = await service.getMessageSentLogs({
                where : {
                    // [Op.and]: [
                    //     Sequelize.literal('exists (SELECT message_number_sent_logs.id FROM message_number_sent_logs WHERE message_number_sent_logs.status IS NULL LIMIT 1)'),
                    // ],
                    [Op.or]: [
                        {status: null},
                        {status: 'process'},
                    ]
                },
                order: [
                    ['createdAt', 'ASC'],
                ]
            });
            console.log("IIINIIIIIII")
            console.log(messageSentLogs.map(val => val.id))
            for(let i in messageSentLogs) {
                queue.push({id: messageSentLogs[i].id, date: messageSentLogs[i].schedule || undefined})
            }
            setTimeout(() => {
                console.log('replace')
                office.replaceQueue(queue);
            }, 10000)
            // office.replaceQueue(queue);
        }
    }

    function remove(id) {
        const result = office.remove(id);
        if (office.process.has(id)) {
            office.process.get(id).abort = 'abort'
            return true;
        }
        return result;
    }

    // let receivers = [];

    async function reloadReceivers() {
    //     if (!service.is_forward || !service.phone_auth) return receivers = [];
    //     receivers = await service.getForwardReceivers();
    }

    function reSchemaMessage (message) {
        const messagePayload = {}
        const messageKeys = Object.keys(message);
        for(let messageType of messageKeys) {
            if (removeTypes.includes(messageType) && message[messageType]) {
                continue;
            }
            if (messageType == conversationType && message[messageType]) {
                messagePayload[messageType] = "";
                continue;
            }
            if (noteMessageTypes.includes(messageType) && message[messageType]) {
                const childMessageKeys = Object.keys(message[messageType].message);
                messagePayload[messageType] = {
                    noteMessage: {}
                };
                for(let k of childMessageKeys) {
                    if (conversationType == k) {
                        messagePayload[messageType].noteMessage[k] = ""
                    }else{
                        messagePayload[messageType].noteMessage[k] = {}
                    }
                }
                continue;
            }
            if (messageLimitedTypes.includes(messageType) && message[messageType]) {
                const childMessageKeys = Object.keys(message[messageType].message);
                messagePayload[messageType] = {
                    message: {}
                };
                for(let k of childMessageKeys) {
                    if (conversationType == k) {
                        messagePayload[messageType].message[k] = ""
                    }else{
                        messagePayload[messageType].message[k] = {}
                    }
                }
                continue;
            }
            if (message[messageType]) {
                messagePayload[messageType] = {}
            }
        }
        return messagePayload
    }

    async function forward({ messages , type}) {
        async function trackActivity () {
            for(let i of messages) {
                if (!i.message) continue;
                if (i.key.fromMe) {
                    const remoteJid = "" + i.key.remoteJid;
                    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@g.us")) continue;
                    activity.updateChatTime("me", i.messageTimestamp)
                }else{
                    const rawRemoteJid = "" + i.key.remoteJid;
                    const remoteJid = rawRemoteJid.endsWith('@broadcast') && rawRemoteJid !== 'status@broadcast' && i.key.participant ? i.key.participant : rawRemoteJid;
                    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@g.us")) continue;
                    activity.updateChatTime(remoteJid, i.messageTimestamp)
                }
            }
        }
        if (type === 'append') {
            await trackActivity()
        }else if (type === 'notify') {

            await service.reload();
            const cost_credits = user.is_subscription_service ? 0 : service.cost_per_forward;
            let receivers = [],
                senders = [],
                loadOnceMain = false,
                loadOnceSpecified = false;

            async function hasReceivers () {
                if (!loadOnceMain) {
                    receivers = await service.getForwardReceivers({
                        where: {
                            forward_sender_id: null
                        },
                    });
                    loadOnceMain = true;
                }
                return receivers.length > 0
            }
            async function anySenderHasReceivers (number) {
                senders = await service.getForwardSenders({
                    where: {
                        number: number
                    },
                    include: [{
                        model: ForwardReceiver,
                        as: 'forwardReceivers'
                    }],
                });
            
                senders = senders.filter(sender => sender.forwardReceivers.length > 0)
                return senders.length > 0
            }

            let out_receivers = [],
                out_senders = [],
                out_loadOnceMain = false,
                out_loadOnceSpecified = false;

            async function out_hasReceivers () {
                if (!out_loadOnceMain) {
                    out_receivers = await service.getOutForwardReceivers({
                        where: {
                            out_forward_sender_id: null
                        },
                    });
                    out_loadOnceMain = true;
                }
                return out_receivers.length > 0
            }
            async function out_anySenderHasReceivers (number) {
                out_senders = await service.getOutForwardSenders({
                    where: {
                        number: number
                    },
                    include: [{
                        model: OutForwardReceiver,
                        as: 'outForwardReceivers'
                    }],
                });
            
                out_senders = out_senders.filter(sender => sender.outForwardReceivers.length > 0)
                return out_senders.length > 0
            }

            const self_phone = service.phone_auth.replace(/:\d*/g, '');

            if (service.feature_chat_bot_google && (service.is_chat_bot_google || service.is_chat_welcome_message || service.is_chat_away_message)) {
                for(let i of messages) {
                    if (!i.message) continue;
                    let it = {...i};
                    const messageKeys = Object.keys(it.message);
                    for(let lMessageType of messageKeys) {
                        if (messageLimitedTypes.includes(lMessageType) && it.message[lMessageType]) {
                            it.message = it.message[lMessageType].message
                        }
                    }
                    if (!i.key.fromMe) {
                        const rawRemoteJid = "" + i.key.remoteJid;
                        const remoteJid = rawRemoteJid.endsWith('@broadcast') && rawRemoteJid !== 'status@broadcast' && i.key.participant ? i.key.participant : rawRemoteJid;
                        if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@g.us")) continue;

                        const doBotReply = async (text_reply, send_event) => {
                            const messageSentLog = await service.createMessageSentLog({
                                message : text_reply,
                                event: send_event,
                                processed_messages: 1,
                                phone_auth: self_phone,
                                status: 'complete'
                            }).catch(err => null);
            
                            const insertNumberSentLog = (status, number, message, payload = null) => {
                                messageSentLog.createMessageNumberSentLog({
                                    number: number,
                                    entity: [number],
                                    status: status,
                                    response: message,
                                    id_stanza: payload ? payload.id_stanza : null,
                                    send_json: payload ? payload.send_json : null,
                                    cost_credits: status == 'success' ? cost_credits : 0
                                });
                            }
        
                            await user.reload();
                            const credit_before_changes = user.credits,
                                amount_change_in_credits = cost_credits,
                                latest_credit = credit_before_changes - amount_change_in_credits;
                                
                            if (user.is_subscription_service || credit_before_changes >= amount_change_in_credits) {
                                if (!user.is_subscription_service) {
                                    user.credits -= amount_change_in_credits;
                                    await user.save({fields:["credits"]});
            
                                    await messageSentLog.createCreditHistory({
                                        user_id: user.id,
                                        event: 'forward_message',
                                        credit_before_changes,
                                        amount_change_in_credits,
                                        latest_credit
                                    });
                                }
        
                                messager.send(remoteJid, {text: text_reply, mentions: []}, 'text')
                                .then(res => {
                                    const stanzaKey = {...res.key}
                                    if(whatsapp.isJidGroup(stanzaKey.remoteJid)) {
                                        stanzaKey.participant = self_phone
                                    }
                                    const stanza = {
                                        send_json: {key: stanzaKey, message: reSchemaMessage(res.message)},
                                        id_stanza: res.key.id
                                    }
                                    insertNumberSentLog('success', remoteJid, 'Pesan Terkirim', stanza)
                                }).catch(err => {
                                    insertNumberSentLog('success', remoteJid, 'Pesan Terkirim')
                                    console.log(err)
                                })
                            }else{
                                insertNumberSentLog('abort', remoteJid, 'Kredit tidak mencukupi')
                            }
                        }

                        const messageType = Object.keys (it.message)[0];
                        const is_media = mediaType.includes(messageType)
                        const is_location = messageType == 'liveLocationMessage' || messageType == 'locationMessage';
                        const is_contact = messageType == 'contactMessage';
                        const content = {mentions: []}
                        if (is_location) {
                            content.contex = {location: it.message[messageType]}
                        }else if (is_contact) {
                            content.contex = {contacts: {contacts: [it.message[messageType]]}}
                        }
        
                        const text = !is_media || (is_media && mediaTypeCaptionable.includes(messageType)) ? (it.message?.[messageType]?.caption || it.message?.extendedTextMessage?.text || it.message?.conversation || null) : null;
                        if (text) {
                            if (service.is_chat_welcome_message) {
                                await sequelize.query(
                                    "SELECT `chatbot_sheets`.`id`, `chatbot_sheets`.`reply`, `chatbot_sheets`.`interval` FROM `chatbot_sheets` " +
                                    "WHERE `chatbot_sheets`.`whatsapp_service_id` = "+service.id+" " +
                                    "AND `chatbot_sheets`.`type` = 'welcome' " +
                                    "LIMIT 1",
                                    { type: "SELECT" }
                                ).then(async (botReplies) => {
                                    if (botReplies && botReplies[0]) {
                                        const newMeet = await activity.retrieveChat(remoteJid, botReplies[0].interval).catch(() => {})
                                        if (newMeet) {
                                            await doBotReply(botReplies[0].reply, 'chat_bot_welcome_reply')
                                        }
                                    }
                                }).catch(e => {console.log(e)})
                            }
                            if (service.is_chat_away_message && remoteJid.endsWith("s.whatsapp.net")) {
                                await sequelize.query(
                                    "SELECT `chatbot_sheets`.`id`, `chatbot_sheets`.`reply`, `chatbot_sheets`.`interval` FROM `chatbot_sheets` " +
                                    "WHERE `chatbot_sheets`.`whatsapp_service_id` = "+service.id+" " +
                                    "AND `chatbot_sheets`.`type` = 'away' " +
                                    "LIMIT 1",
                                    { type: "SELECT" }
                                ).then(async (botReplies) => {
                                    if (botReplies && botReplies[0]) {
                                        const newMeet = await activity.retrieveChat('me', botReplies[0].interval).catch(() => {})
                                        if (newMeet) {
                                            await doBotReply(botReplies[0].reply, 'chat_bot_away_reply')
                                        }
                                    }
                                }).catch(e => {console.log(e)})
                            }
                            if (service.is_chat_bot_google && remoteJid.endsWith("s.whatsapp.net")) {
                                await sequelize.query(
                                    "SELECT `chatbot_sheets`.`id`, `chatbot_sheets`.`reply` FROM `chatbot_sheets` " +
                                    "WHERE `chatbot_sheets`.`whatsapp_service_id` = "+service.id+" " +
                                    "AND ((`chatbot_sheets`.`type` = '2' AND '"+text.replace("'", "\'")+"' LIKE CONCAT('%', `chatbot_sheets`.`message`, '%')) " +
                                    "OR (`chatbot_sheets`.`type` = '1' AND `chatbot_sheets`.`message` = '"+text.replace("'", "\'")+"')) " +
                                    "LIMIT 1",
                                    { type: "SELECT" }
                                ).then(async (botReplies) => {
                                    if (botReplies && botReplies[0]) {
                                        await doBotReply(botReplies[0].reply, 'chat_bot_reply')
                                    }
                                }).catch(e => {console.log(e)})
                            }
                        }
                    }
                }
            }

            await trackActivity()

            if (!service.phone_auth || ((!service.is_forward || (!service.is_main_forward && !service.is_specified_forward)) && (!service.is_out_forward || (!service.is_out_main_forward && !service.is_out_specified_forward)))) return;

            for(let i of messages) {
                if (!i.message) continue;
                let it = {...i};
                const messageKeys = Object.keys(it.message);
                for(let lMessageType of messageKeys) {
                    if (messageLimitedTypes.includes(lMessageType) && it.message[lMessageType]) {
                        it.message = it.message[lMessageType].message
                    }
                }
                if (i.key.fromMe) {
                    const remoteJid = "" + i.key.remoteJid;
                    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@g.us")) continue;

                    const messagePayload = reSchemaMessage(it.message);

                    //filter & ignore
                    let is_ignored = service.is_out_main_forward && (await service.getOutForwardIgnore({ where : { number : remoteJid }})) != null;

                    const mainHasReceivers = service.is_out_main_forward && !is_ignored && await out_hasReceivers()
                    const specifiedHasReceivers = service.is_out_specified_forward && await out_anySenderHasReceivers(remoteJid)
                    if (!mainHasReceivers && !specifiedHasReceivers) return;

                    //content
                    const messageType = Object.keys (it.message)[0];
                    let buffer = null,
                        full_name = null,
                        file_name = null,
                        extension = null;
    
                    const is_media = mediaType.includes(messageType)
                    if (is_media) {
    
                        const now = new Date();
                        const tomonthPath = [now.getFullYear(), now.getMonth() + 1].join("-");
                        if (!fs.existsSync("./public")) {
                            fs.mkdirSync("./public")
                        }
                        if (!fs.existsSync("./public/forward")) {
                            fs.mkdirSync("./public/forward")
                        }
                        if (!fs.existsSync("./public/forward/"+service.id)) {
                            fs.mkdirSync("./public/forward/"+service.id)
                        }
                        if (!fs.existsSync("./public/forward/"+service.id+"/"+tomonthPath)) {
                            fs.mkdirSync("./public/forward/"+service.id+"/"+tomonthPath)
                        }
                        let file_path = "forward/"+service.id+"/"+tomonthPath
    
                        let { mimetype } = it.message[messageType],
                            f_name = it.message[messageType]?.title?.replace(/\.[\w\d]+$/, '') || Date.now().toString();
    
                        extension = mime.extension(mimetype);
    
                        full_name = f_name + '.' + extension;
    
                        let n_name = 0;
                        while(fs.existsSync("./public/"+file_path+"/"+full_name)) {
                            n_name++;
                            full_name = f_name + '_' + n_name + '.' + extension;
                        }
                        file_name = file_path+"/"+full_name;
    
                        buffer = await whatsapp.downloadMediaMessage(
                            it, 'buffer',
                        ).catch(err => null);
    
                        fs.writeFileSync("./public/"+file_name, buffer);
                    }
                    const is_location = messageType == 'liveLocationMessage' || messageType == 'locationMessage';
                    const is_contact = messageType == 'contactMessage';
                    const content = {mentions: []}
                    if (is_location) {
                        content.contex = {location: it.message[messageType]}
                    }else if (is_contact) {
                        content.contex = {contacts: {contacts: [it.message[messageType]]}}
                    }
    
                    const text = !is_media || (is_media && mediaTypeCaptionable.includes(messageType)) ? (it.message?.[messageType]?.caption || it.message?.extendedTextMessage?.text || it.message?.conversation || null) : null;
    
                    const file = !is_media ? null : {
                        name: full_name,
                        data: buffer,
                        mimetype: mime.lookup(full_name)
                    };
                    
                    if (file) content.file = file;

                    // forwards
                    const jidGroup = whatsapp.isJidGroup(remoteJid);

                    const remoteId = jidGroup ? null : remoteJid.split("@")[0];
                    const hiddenPhone = jidGroup ? null : remoteId.substring(0, 5) + " * * * * " + remoteId.substring(remoteId.length - 3);
                    const doForward = async (localReceivers, sender = null) => {
                        let contact = sender || await (jidGroup ? GroupContact : Contact).findOne({ where: {
                            whatsapp_auth: self_phone,
                            number: remoteJid
                        } })
                        const template = `_Sent Message from_\n${service.name ? '*'+service.name+' ' : '*'}(${service.phone_auth.split(":")[0]})*\n_Message To${ (jidGroup ? " Group": "") }_\n${ contact && contact.name ? "*"+contact.name+"*" : "" }${jidGroup ? "" : " "+remoteId}`;
                        if (text) {
                            content.text = template + '\n\r\n' + text
                        }else if(is_media && mediaTypeCaptionable.includes(messageType)) {
                            content.text = template;
                        }
                        const messageSentLog = await service.createMessageSentLog({
                            message : text,
                            event: 'out_forward_message',
                            generated_content : content.contex  || null,
                            forward_from : remoteJid,
                            id_forward_from : i.key.id,
                            source_json: {key: i.key, message: messagePayload},
                            out_forward_sender_id: sender ? sender.id : null,
                            processed_messages: localReceivers.length,
                            phone_auth: self_phone,
                            status: 'complete'
                        }).catch(err => null);
        
                        const messageMediaSentLog = !is_media ? null : await messageSentLog.createMessageMediaSentLog({
                            name: full_name,
                            extension: extension,
                            url: hostUrl+':'+service.session+'/'+mediaUrlPrefix+'/'+file_name
                        }).catch(err => null);
        
                        const insertNumberSentLog = (status, number, message, payload = null) => {
                            messageSentLog.createMessageNumberSentLog({
                                number: number,
                                entity: [number],
                                status: status,
                                response: message,
                                id_stanza: payload ? payload.id_stanza : null,
                                send_json: payload ? payload.send_json : null,
                                cost_credits: status == 'success' ? cost_credits : 0
                            });
                        }
                        let validReciever = [];
                        let invalidReceiver = [];
                        let selfReciever = null;
                        let abort = false;
                        for (let reciever of localReceivers) {
                            if (self_phone == reciever.number) {
                                selfReciever = reciever.number;
                            }else{
                                let found = await checkDestination(reciever.number)
                                if (found) {
                                    validReciever.push(reciever.number);
                                }else if(found === false){
                                    invalidReceiver.push(reciever.number);
                                }else{
                                    abort  = true;
                                }
                            }
                        }
                        if (abort) {
                            for (let reciever of localReceivers) {
                                insertNumberSentLog('abort', reciever.number, 'Nomor Whatsapp Offline')
                            }
                        }else{
                            await user.reload();

                            const credit_before_changes = user.credits,
                                amount_change_in_credits = validReciever.length * cost_credits,
                                latest_credit = credit_before_changes - amount_change_in_credits;
                                
                            if (user.is_subscription_service || credit_before_changes >= amount_change_in_credits) {    
                                if (!user.is_subscription_service) {
                                    user.credits -= amount_change_in_credits;
                                    await user.save({fields:["credits"]});
                                    
                                    await messageSentLog.createCreditHistory({
                                        user_id: user.id,
                                        event: 'out_forward_message',
                                        credit_before_changes,
                                        amount_change_in_credits,
                                        latest_credit
                                    });
                                }
        
                                for(let number of validReciever) {
                                    messager.send(number, content, is_location ? 'location' : (is_contact ? 'contact' : (is_media ? 'file' : 'text')))
                                    .then(res => {
                                        const stanzaKey = {...res.key}
                                        if(whatsapp.isJidGroup(stanzaKey.remoteJid)) {
                                            stanzaKey.participant = self_phone
                                        }
                                        const stanza = {
                                            send_json: {key: stanzaKey, message: reSchemaMessage(res.message)},
                                            id_stanza: res.key.id
                                        }
                                        insertNumberSentLog('success', number, 'Pesan Terkirim', stanza)
                                    }).catch(err => {
                                        insertNumberSentLog('success', number, 'Pesan Terkirim')
                                        console.log(err)
                                    })
                                }
                                for(let number of invalidReceiver) {
                                    insertNumberSentLog('failed', number, 'Nomor Tujuan Tidak Valid')
                                }
                                if (selfReciever) {
                                    insertNumberSentLog('failed', selfReciever, 'Nomor Tujuan Adalah Diri Sendiri')
                                }
                            }else{
                                for (let reciever of localReceivers) {
                                    insertNumberSentLog('abort', reciever.number, 'Kredit tidak mencukupi')
                                }
                            }
                        }
                    }
                    
                    if (mainHasReceivers) {
                        await doForward(out_receivers.filter(orev => orev.number != remoteJid))
                    }
                    if (specifiedHasReceivers) {
                        for(let j in out_senders) {
                            await doForward(out_senders[j].outForwardReceivers.filter(orev => orev.number != remoteJid), out_senders[j])
                        }
                    }
                }else{
                    const rawRemoteJid = "" + i.key.remoteJid;
                    const remoteJid = rawRemoteJid.endsWith('@broadcast') && rawRemoteJid !== 'status@broadcast' && i.key.participant ? i.key.participant : rawRemoteJid;
                    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@g.us")) continue;
    
                    //reply
                    let is_reply = false,
                        forwardMessageNumberSentLog = null,
                        forwardSender = null;
                    key: for (let keyMessage in it.message) {
                        if (keyMessage == 'messageContextInfo' || keyMessage == 'senderKeyDistributionMessage' || keyMessage == 'conversation') continue key;
                        if (!it.message[keyMessage]) continue key;
                        const contextInfo = it.message[keyMessage].contextInfo || {}
                        if (contextInfo.quotedMessage && contextInfo.participant == self_phone) {
                            forwardMessageNumberSentLog = await MessageNumberSentLog.findOne({where: {
                                number: remoteJid,
                                id_stanza: contextInfo.stanzaId
                            }, include: [{
                                model: MessageSentLog,
                                as: 'messageSentLog'
                            }]}).catch(err => console.log(err))
                            if (forwardMessageNumberSentLog) {
                                if (forwardMessageNumberSentLog.messageSentLog.forward_sender_id) {
                                    forwardSender = await forwardMessageNumberSentLog.messageSentLog.getForwardSender({
                                        include: [{
                                            model: ForwardReceiver,
                                            as: 'forwardReceivers'
                                        }]
                                    })
                                    if (forwardSender && forwardSender.forwardReceivers.length > 0) {
                                        is_reply = forwardSender.forwardReceivers.find((receiver) => receiver.can_reply && receiver.number == remoteJid);
                                    }
                                }else{
                                    await hasReceivers();
                                    is_reply = receivers.find((receiver) => receiver.can_reply && receiver.number == remoteJid);
                                }
                            }
                            break key;
                        }
                    }
                    const messagePayload = is_reply ? null : reSchemaMessage(it.message);
    
                    //filter & ignore
                    let is_ignored = !is_reply && service.is_main_forward && (await service.getForwardIgnore({ where : { number : remoteJid }})) != null;
    
                    const mainHasReceivers = !is_reply && service.is_main_forward && !is_ignored && await hasReceivers()
                    const specifiedHasReceivers = !is_reply && service.is_specified_forward && await anySenderHasReceivers(remoteJid)
                    if (!mainHasReceivers && !specifiedHasReceivers && !is_reply) return;
    
                    //content
                    const messageType = Object.keys (it.message)[0];
                    let buffer = null,
                        full_name = null,
                        file_name = null,
                        extension = null;
    
                    const is_media = mediaType.includes(messageType)
                    if (is_media) {
    
                        const now = new Date();
                        const tomonthPath = [now.getFullYear(), now.getMonth() + 1].join("-");
                        if (!fs.existsSync("./public")) {
                            fs.mkdirSync("./public")
                        }
                        if (!fs.existsSync("./public/forward")) {
                            fs.mkdirSync("./public/forward")
                        }
                        if (!fs.existsSync("./public/forward/"+service.id)) {
                            fs.mkdirSync("./public/forward/"+service.id)
                        }
                        if (!fs.existsSync("./public/forward/"+service.id+"/"+tomonthPath)) {
                            fs.mkdirSync("./public/forward/"+service.id+"/"+tomonthPath)
                        }
                        let file_path = "forward/"+service.id+"/"+tomonthPath
    
                        let { mimetype } = it.message[messageType],
                            f_name = it.message[messageType]?.title?.replace(/\.[\w\d]+$/, '') || Date.now().toString();
    
                        extension = mime.extension(mimetype);
    
                        full_name = f_name + '.' + extension;
    
                        let n_name = 0;
                        while(fs.existsSync("./public/"+file_path+"/"+full_name)) {
                            n_name++;
                            full_name = f_name + '_' + n_name + '.' + extension;
                        }
                        file_name = file_path+"/"+full_name;
    
                        buffer = await whatsapp.downloadMediaMessage(
                            it, 'buffer',
                        ).catch(err => null);
    
                        fs.writeFileSync("./public/"+file_name, buffer);
                    }
                    const is_location = messageType == 'liveLocationMessage' || messageType == 'locationMessage';
                    const is_contact = messageType == 'contactMessage';
                    const content = {mentions: []}
                    if (is_location) {
                        content.contex = {location: it.message[messageType]}
                    }else if (is_contact) {
                        content.contex = {contacts: {contacts: [it.message[messageType]]}}
                    }
    
                    const text = !is_media || (is_media && mediaTypeCaptionable.includes(messageType)) ? (it.message?.[messageType]?.caption || it.message?.extendedTextMessage?.text || it.message?.conversation || null) : null;
    
                    const file = !is_media ? null : {
                        name: full_name,
                        data: buffer,
                        mimetype: mime.lookup(full_name)
                    };
                    
                    if (file) content.file = file;
    
                    // forwards
                    const jidGroup = whatsapp.isJidGroup(remoteJid);
                    if (is_reply) {
                        let contact = (forwardMessageNumberSentLog.messageSentLog.forward_sender_id
                            ? forwardSender.forwardReceivers.find((receiver) => receiver.number == remoteJid)
                            : receivers.find((receiver) => receiver.number == remoteJid))
                        || await (jidGroup ? GroupContact : Contact).findOne({ where: { whatsapp_auth: self_phone, number: remoteJid } });
    
                        const template = `Replied by ${jidGroup ? ("Group " + contact.name) : (((contact && contact.name) || "")+" *"+remoteJid+"*") }`;
                        const patienceContent = {...content}
                        if (text) {
                            patienceContent.text = text
                            content.text = template + '\n\r\n' + text
                        }else if(is_media && mediaTypeCaptionable.includes(messageType)) {
                            content.text = template;
                        }
    
                        let localReceivers = forwardMessageNumberSentLog.messageSentLog.forward_sender_id
                            ? forwardSender.forwardReceivers.filter((receiver) => receiver.number != remoteJid)
                            : receivers.filter((receiver) => receiver.number != remoteJid);
    
                        const messageSentLog = await service.createMessageSentLog({
                            message : text,
                            event: 'forward_message',
                            generated_content : content.contex || null,
                            forward_from : forwardMessageNumberSentLog.number,
                            forward_sender_id: forwardMessageNumberSentLog.messageSentLog.forward_sender_id,
                            processed_messages: localReceivers.length + 1,
                            phone_auth: self_phone,
                            status: 'complete'
                        }).catch(err => null);
        
                        const messageMediaSentLog = !is_media ? null : await messageSentLog.createMessageMediaSentLog({
                            name: full_name,
                            extension: extension,
                            url: hostUrl+':'+service.session+'/'+mediaUrlPrefix+'/'+file_name
                        }).catch(err => null);
    
                        const forwardNumber = forwardMessageNumberSentLog.messageSentLog.forward_from;
    
                        const insertNumberSentLog = (status, number, message) => {
                            messageSentLog.createMessageNumberSentLog({
                                number: number,
                                entity: [number],
                                status: status,
                                response: message,
                                cost_credits: status == 'success' ? cost_credits : 0
                            });
                        }
    
                        let validReciever = [];
                        let invalidReceiver = [];
                        let selfReciever = null;
                        let abort = false;
                        for (let reciever of localReceivers) {
                            if (self_phone == reciever.number) {
                                selfReciever = reciever.number;
                            }else{
                                let found = await checkDestination(reciever.number)
                                if (found) {
                                    validReciever.push(reciever.number);
                                }else if(found === false){
                                    invalidReceiver.push(reciever.number);
                                }else{
                                    abort  = true;
                                }
                            }
                        }
                        if (abort) {
                            insertNumberSentLog('abort', forwardNumber, 'Nomor Whatsapp Offline')
                            for (let reciever of localReceivers) {
                                insertNumberSentLog('abort', reciever.number, 'Nomor Whatsapp Offline')
                            }
                        }else{
                            await user.reload();
                            const credit_before_changes = user.credits,
                                amount_change_in_credits = (validReciever.length + 1) * cost_credits,
                                latest_credit = credit_before_changes - amount_change_in_credits;
                                
                            if (user.is_subscription_service || credit_before_changes >= amount_change_in_credits) {
                                if (!user.is_subscription_service) {
                                    user.credits -= amount_change_in_credits;
                                    await user.save({fields:["credits"]});
            
                                    await messageSentLog.createCreditHistory({
                                        user_id: user.id,
                                        event: 'forward_message',
                                        credit_before_changes,
                                        amount_change_in_credits,
                                        latest_credit
                                    });
                                }
    
                                messager.send(forwardNumber, patienceContent, is_location ? 'location' : (is_contact ? 'contact' : (is_media ? 'file' : 'text'))).catch(err => {console.log(err)})
                                insertNumberSentLog('success', forwardNumber, 'Pesan Terkirim')
    
                                const quotes = await forwardMessageNumberSentLog.messageSentLog.getMessageNumberSentLogs()
                                for(let number of validReciever) {
                                    const options = { quoted: (quotes.find((numberSent) => numberSent.number == number) || {send_json: null}).send_json }
                                    messager.send(number, {...content, options }, is_location ? 'location' : (is_contact ? 'contact' : (is_media ? 'file' : 'text'))).catch(err => {console.log(err)})
                                    insertNumberSentLog('success', number, 'Pesan Terkirim')
                                }
                                for(let number of invalidReceiver) {
                                    insertNumberSentLog('failed', number, 'Nomor Tujuan Tidak Valid')
                                }
                                if (selfReciever) {
                                    insertNumberSentLog('failed', selfReciever, 'Nomor Tujuan Adalah Diri Sendiri')
                                }
                            }else{
                                insertNumberSentLog('abort', forwardNumber, 'Kredit tidak mencukupi')
                                for (let reciever of localReceivers) {
                                    insertNumberSentLog('abort', reciever.number, 'Kredit tidak mencukupi')
                                }
                            }
                        }
                    }else{
                        const remoteId = jidGroup ? null : remoteJid.split("@")[0];
                        const hiddenPhone = jidGroup ? null : remoteId.substring(0, 5) + " * * * * " + remoteId.substring(remoteId.length - 3);
                        const doForward = async (localReceivers, sender = null) => {
                            let contact = sender || await (jidGroup ? GroupContact : Contact).findOne({ where: {
                                whatsapp_auth: self_phone,
                                number: remoteJid
                            } })
                            const template = `_Received Message on_\n${service.name ? '*'+service.name+' ' : '*'}(${service.phone_auth.split(":")[0]})*\n_Message From${ (jidGroup ? " Group": "") }_\n${ contact && contact.name ? "*"+contact.name+"*" : "" }${jidGroup ? "" : " "+hiddenPhone}`;
                            if (text) {
                                content.text = template + '\n\r\n' + text
                            }else if(is_media && mediaTypeCaptionable.includes(messageType)) {
                                content.text = template;
                            }
                            const messageSentLog = await service.createMessageSentLog({
                                message : text,
                                event: 'forward_message',
                                generated_content : content.contex  || null,
                                forward_from : remoteJid,
                                id_forward_from : i.key.id,
                                source_json: is_reply ? null : {key: i.key, message: messagePayload},
                                forward_sender_id: sender ? sender.id : null,
                                processed_messages: localReceivers.length,
                                phone_auth: self_phone,
                                status: 'complete'
                            }).catch(err => null);
            
                            const messageMediaSentLog = !is_media ? null : await messageSentLog.createMessageMediaSentLog({
                                name: full_name,
                                extension: extension,
                                url: hostUrl+':'+service.session+'/'+mediaUrlPrefix+'/'+file_name
                            }).catch(err => null);
            
                            const insertNumberSentLog = (status, number, message, payload = null) => {
                                messageSentLog.createMessageNumberSentLog({
                                    number: number,
                                    entity: [number],
                                    status: status,
                                    response: message,
                                    id_stanza: payload ? payload.id_stanza : null,
                                    send_json: payload ? payload.send_json : null,
                                    cost_credits: status == 'success' ? cost_credits : 0
                                });
                            }
                            let validReciever = [];
                            let invalidReceiver = [];
                            let selfReciever = null;
                            let abort = false;
                            for (let reciever of localReceivers) {
                                if (self_phone == reciever.number) {
                                    selfReciever = reciever.number;
                                }else{
                                    let found = await checkDestination(reciever.number)
                                    if (found) {
                                        validReciever.push(reciever.number);
                                    }else if(found === false){
                                        invalidReceiver.push(reciever.number);
                                    }else{
                                        abort  = true;
                                    }
                                }
                            }
                            if (abort) {
                                for (let reciever of localReceivers) {
                                    insertNumberSentLog('abort', reciever.number, 'Nomor Whatsapp Offline')
                                }
                            }else{
                                await user.reload();
                                const credit_before_changes = user.credits,
                                    amount_change_in_credits = validReciever.length * cost_credits,
                                    latest_credit = credit_before_changes - amount_change_in_credits;
                                    
                                if (user.is_subscription_service || credit_before_changes >= amount_change_in_credits) {
                                    if (!user.is_subscription_service) {
                                        user.credits -= amount_change_in_credits;
                                        await user.save({fields:["credits"]});
                
                                        await messageSentLog.createCreditHistory({
                                            user_id: user.id,
                                            event: 'forward_message',
                                            credit_before_changes,
                                            amount_change_in_credits,
                                            latest_credit
                                        });
                                    }
            
                                    for(let number of validReciever) {
                                        messager.send(number, content, is_location ? 'location' : (is_contact ? 'contact' : (is_media ? 'file' : 'text')))
                                        .then(res => {
                                            const stanzaKey = {...res.key}
                                            if(whatsapp.isJidGroup(stanzaKey.remoteJid)) {
                                                stanzaKey.participant = self_phone
                                            }
                                            const stanza = {
                                                send_json: {key: stanzaKey, message: reSchemaMessage(res.message)},
                                                id_stanza: res.key.id
                                            }
                                            insertNumberSentLog('success', number, 'Pesan Terkirim', stanza)
                                        }).catch(err => {
                                            insertNumberSentLog('success', number, 'Pesan Terkirim')
                                            console.log(err)
                                        })
                                    }
                                    for(let number of invalidReceiver) {
                                        insertNumberSentLog('failed1', number, 'Nomor Tujuan Tidak Valid')
                                    }
                                    if (selfReciever) {
                                        insertNumberSentLog('failed2', selfReciever, 'Nomor Tujuan Adalah Diri Sendiri')
                                    }
                                }else{
                                    for (let reciever of localReceivers) {
                                        insertNumberSentLog('abort', reciever.number, 'Kredit tidak mencukupi')
                                    }
                                }
                            }
                        }
                        
                        if (mainHasReceivers) {
                            await doForward(receivers)
                        }
                        if (specifiedHasReceivers) {
                            for(let j in senders) {
                                await doForward(senders[j].forwardReceivers, senders[j])
                            }
                        }
                    }
                }
            }
        }
    }

    return {
        freshDatabaseQueue,
        insertQueue,
        startWatch,
        remove,
        forward,
        reloadReceivers,
        messager,
        checkDestination
    }
}

exports.useMBSMessage = useMBSMessage
