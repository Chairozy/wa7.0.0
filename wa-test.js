import makeWASocket, { DisconnectReason, useMultiFileAuthState } from 'baileys'

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_whiskey/1')
    const sock = makeWASocket({
        // can provide additional config here
        auth: state
    })
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
              connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('opened connection')
            sock.sendMessage("6285822922029@s.whatsapp.net", { text: 'Hello Word' })
        }
    })

    // to storage creds (session info) when it updates
    sock.ev.on('creds.update', saveCreds)
}
// run in main file
connectToWhatsApp()
