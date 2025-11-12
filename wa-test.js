import makeWASocket, { DisconnectReason, useMultiFileAuthState, proto, generateMessageID } from 'baileys';
import QRCode from 'qrcode';

const emptyLogger = {
	child: () => {return emptyLogger},
	trace: () => {},
	info: () => {},
	error: (e) => {},
	debug: () => {},
	warn: () => {},
}

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_whiskey/1')
    const sock = makeWASocket({
        // can provide additional config here
        auth: state,
        logger: emptyLogger
    })
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
              connectToWhatsApp()
            }
		}else if (qr) {
            QRCode.toString(qr, {type:'terminal'}).then(console.log)
            
        } else if(connection === 'open') {
            console.log('opened connection')
            sock.sendPresenceUpdate('composing', '628813587551@s.whatsapp.net');
            // const message = proto.Message.create({
            // interactiveMessage: {
            //     body: { text: "Pilih menu:" },
            //     nativeFlowMessage: {
            //     buttons: [
            //         { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Menu 1", id: "menu1" }) },
            //         { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Menu 2", id: "menu2" }) },
            //     ]
            //     }
            // }
            // })
            // sock.relayMessage("6285822922029@s.whatsapp.net", message, {
            //     messageId: generateMessageID(),
            //     useCachedGroupMetadata: undefined,
            //     statusJidList: undefined,
            //     additionalAttributes: {},
            //     additionalNodes: []
            // })
            // sock.sendMessage("6285822922029@s.whatsapp.net", {
            //     buttonsMessage: {
            //         contentText: "Hallo",
            //         headerType: 1,
            //         buttons: [
            //             {
            //                 buttonId: 'id-32643782',
            //                 type: 1,
            //                 buttonText: {displayText: "test"} }
            //         ],
            //         footerText: "Aasas"
            //     }
            // })
            // sock.sendMessage("6285822922029@s.whatsapp.net", {
            //     "type": "interactive",
            //     "interactive": {
            //         "type": "list",
            //             "body": {
            //             "text": "Silakan pilih salah satu menu berikut:"
            //         },
            //         "footer": {
            //             "text": "Layanan otomatis WhatsApp"
            //         },
            //         "action": {
            //             "button": "Pilih Menu",
            //             "sections": [
            //                 {
            //                     "title": "Menu Utama",
            //                     "rows": [
            //                         {
            //                             "id": "cek_saldo",
            //                             "title": "Cek Saldo",
            //                             "description": "Lihat saldo akun kamu"
            //                         },
            //                         {
            //                             "id": "isi_pulsa",
            //                             "title": "Isi Pulsa",
            //                             "description": "Isi ulang pulsa sekarang"
            //                         },
            //                         {
            //                             "id": "hubungi_admin",
            //                             "title": "Hubungi Admin",
            //                             "description": "Chat dengan admin kami"
            //                         }
            //                     ]
            //                 }
            //             ]
            //         }
            //     }
            // })
        }
    })

    // to storage creds (session info) when it updates
    sock.ev.on('creds.update', saveCreds)
}
// run in main file
connectToWhatsApp()
