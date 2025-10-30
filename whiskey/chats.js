const ss = require('socket.io-stream');

const { filterMapData } = require('./localBuffer');
// const { useMongoMemory } = require('./mongo');

const emptyLogger = {
	child: () => {return emptyLogger},
	trace: () => {},
	info: () => {},
	error: (e) => {},
	debug: () => {},
	warn: () => {},
}

exports.useChatSocket = (io, whatsapp) => {
    const ioChat = io.of('chat')
	let append = async () => void 0;
	let readChatEvents = async () => void 0;
	let preconncetEvents = async () => void 0;

    function rebindStoreBuffer(callCreateConn) {
        const conn = callCreateConn()

        conn.ev.buffer = () => {
            return false;
        }
    
        conn.ev.process((map) => {
            return // block feaeture
            for (const event in map) {
                append(event, map[event])
            }
            ioChat.emit('data-chats', filterMapData(map))
        })

        conn.ev.on('connection.update', async (update) => {
            const { connection } = update;
            // if(connection === 'close') {
            //     ioChat.emit('connection', connection)
            // }else
            return null;
            if (connection === 'open'){
                const phone = "wa@"+conn.user.id.replace(/:.+/g, '');
                const objBind = (await useMongoMemory())(phone)
                append = objBind.append
                readChatEvents = objBind.readChatEvents
                preconncetEvents = objBind.preconncetEvents
                ioChat.emit('reconnect')
            }
        })

        return conn
    }

    function bindIoChat (service, mbsMessage) {
        return // block feaeture
        ioChat.use(async (socket, next) => {
            await service.reload();
            next(service.feature_whatsapp_chat_history ? undefined : new Error("Feature has been Disabled"))
        })
        .on('connection', async function(socket) {
            const filter = service.whatsapp_chat_history_mode
                ? (await service.getChatContacts({ where : { except_mode : service.whatsapp_chat_history_mode == 'selecting' ? 'selected' : 'excepted' } })).map(v => mbsMessage.messager.phoneNumberFormatter(v.number))
                : [];

            if (service.feature_whatsapp_chat_history) {
                socket.emit('data-chats', await preconncetEvents(service.whatsapp_chat_history_mode, filter))
            }
            
            socket.on('send', ({number, content}) => {
                if (whatsapp.stating !== 'online' || !service.feature_whatsapp_chat_history) return;
                console.log('req send', number, content)
                mbsMessage.messager.send(number, {mentions: [], ...content})
            })
        
            ss(socket).on('data-file', function (stream, msg) {
                if (whatsapp.stating !== 'online' || !service.feature_whatsapp_chat_history) return;
                whatsapp.downloadMediaMessage(msg, 'stream', {}, {
                    logger: emptyLogger,
                    reuploadRequest: whatsapp.conn.updateMediaMessage
                }).then(streamFile => {
                    streamFile.pipe(stream)
                }).catch(err => {
                    stream.emit('error', 'file fails stream load');
                    stream.end();
                    console.log('file fails stream load')
                })
            });
        
            socket.on('read-chat', async (id) => {
                if (whatsapp.stating !== 'online' || !service.feature_whatsapp_chat_history) return;
                socket.emit('data-chats', await readChatEvents(id))
            })
        });
    }

    return {
        ioChat,
        rebindStoreBuffer,
        bindIoChat
    }
}
