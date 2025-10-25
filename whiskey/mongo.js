require('dotenv').config({path:__dirname+'/./../.env'});

const { MongoClient } = require("mongodb");
const url = `mongodb://${process.env.MDB_HOST}:${process.env.MDB_PORT}/`;
const database = process.env.MDB_DATABASE;

const normalizeMessageContent = (content) => {
    var _a, _b, _c, _d, _e;
    content = ((_c = (_b = (_a = content === null || content === void 0 ? void 0 : content.ephemeralMessage) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.viewOnceMessage) === null || _c === void 0 ? void 0 : _c.message) ||
        ((_d = content === null || content === void 0 ? void 0 : content.ephemeralMessage) === null || _d === void 0 ? void 0 : _d.message) ||
        ((_e = content === null || content === void 0 ? void 0 : content.viewOnceMessage) === null || _e === void 0 ? void 0 : _e.message) ||
        content ||
        undefined;
    return content;
};
const isRealMessage = (message) => {
    const normalizedContent = normalizeMessageContent(message.message);
    return (!!normalizedContent
        || MSG_MISSED_CALL_TYPES.has(message.messageStubType))
        && !(normalizedContent === null || normalizedContent === void 0 ? void 0 : normalizedContent.protocolMessage)
        && !(normalizedContent === null || normalizedContent === void 0 ? void 0 : normalizedContent.reactionMessage);
};
const shouldIncrementChatUnread = (message) => (!message.key.fromMe && !message.messageStubType);
const updateMessageWithReceipt = (msg, receipt) => {
    msg.userReceipt = msg.userReceipt || [];
    const recp = msg.userReceipt.find(m => m.userJid === receipt.userJid);
    if (recp) {
        Object.assign(recp, receipt);
    }
    else {
        msg.userReceipt.push(receipt);
    }
};
const getKeyAuthor = (key) => (((key === null || key === void 0 ? void 0 : key.fromMe) ? 'me' : (key === null || key === void 0 ? void 0 : key.participant) || (key === null || key === void 0 ? void 0 : key.remoteJid)) || '');
/** Update the message with a new reaction */
const updateMessageWithReaction = (msg, reaction) => {
    const authorID = getKeyAuthor(reaction.key);
    const reactions = (msg.reactions || [])
        .filter(r => getKeyAuthor(r.key) !== authorID);
    if (reaction.text) {
        reactions.push(reaction);
    }
    msg.reactions = reactions;
};
function concatChats(a, b) {
    if (b.unreadCount === null) {
        // neutralize unread counter
        if (a.unreadCount < 0) {
            a.unreadCount = undefined;
            b.unreadCount = undefined;
        }
    }
    if (typeof a.unreadCount === 'number' && typeof b.unreadCount === 'number') {
        b = { ...b };
        if (b.unreadCount >= 0) {
            b.unreadCount = Math.max(b.unreadCount, 0) + Math.max(a.unreadCount, 0);
        }
    }
    return Object.assign(a, b);
}
const stringifyMessageKey = (key) => `${key.remoteJid},${key.id},${key.fromMe ? '1' : '0'}`;

exports.useMongoMemory = async () => {
    const client = await MongoClient.connect(url);
    
    return (dbName) => {
        const store = client.db(dbName);
        async function append(event, eventData) {
            let chatUpserts, contactUpserts, messageUpserts, groupUpdates;
            switch (event) {
                case 'chats.set':
                    chatUpserts = store.collection("chats")
                    for (const chat of eventData.chats) {
                        let upsert = (await chatUpserts.findOne({id: chat.id})) || {}
                        upsert = concatChats(upsert, chat);
                        await chatUpserts.updateOne( {id: chat.id}, {$set : upsert}, {upsert: true} )
                    }
                    break;
                case 'chats.upsert':
                    chatUpserts = store.collection("chats")
                    for (const chat of eventData) {
                        let upsert = (await chatUpserts.findOne({id: chat.id})) || {}
                        upsert = concatChats(upsert, chat);
                        await chatUpserts.updateOne( {id: chat.id}, {$set : upsert}, {upsert: true} )
                    }
                    break;
                case 'chats.update':
                    chatUpserts = store.collection("chats")
                    for (const update of eventData) {
                        let upsert = await chatUpserts.findOne({id: update.id})
                        if (upsert) {
                            upsert = concatChats(upsert, update);
                            await chatUpserts.updateOne( {id: update.id}, {$set : upsert}, {upsert: true} )
                        }
                    }
                    break;
                case 'chats.delete':
                    chatUpserts = store.collection("chats")
                    for (const chatId of eventData) {
                        await chatUpserts.deleteOne({ id: chatId })
                    }
                    break;
                case 'contacts.set':
                    contactUpserts = store.collection("contacts")
                    for (const contact of eventData.contacts ) {
                        let upsert = (await contactUpserts.findOne({id: contact.id})) || {};
                        upsert = Object.assign(upsert, contact);
                        await contactUpserts.updateOne( {id: contact.id}, {$set : upsert}, {upsert: true} )
                    }
                    break;
                case 'contacts.upsert':
                    contactUpserts = store.collection("contacts")
                    for (const contact of eventData ) {
                        let upsert = (await contactUpserts.findOne({id: contact.id})) || {};
                        upsert = Object.assign(upsert, contact);
                        await contactUpserts.updateOne( {id: contact.id}, {$set : upsert}, {upsert: true} )
                    }
                    break;
                case 'contacts.update':
                    contactUpserts = store.collection("contacts")
                    for (const update of eventData) {
                        let upsert = await contactUpserts.findOne({id: update.id})
                        if (upsert) {
                            upsert = Object.assign(upsert, update);
                            await contactUpserts.updateOne( {id: update.id}, {$set : upsert}, {upsert: true} )
                        }
                    }
                    break;
                case 'messages.set':
                    messageUpserts = store.collection("messages")
                    for (const message of eventData.messages) {
                        const key = stringifyMessageKey(message.key);
                        const existing = await messageUpserts.findOne({ id: key });
                        if (existing) {
                            message.messageTimestamp = existing.message.messageTimestamp;
                        }
                        await messageUpserts.updateOne({id: key}, {$set : {message, type: 'notify'}}, {upsert: true})
                    }
                    break;
                case 'messages.upsert':
                    messageUpserts = store.collection("messages")
                    const { messages, type } = eventData;
                    for (const message of messages) {
                        const key = stringifyMessageKey(message.key);
                        const existing = await messageUpserts.findOne({ id: key });
                        if (existing) {
                            message.messageTimestamp = existing.message.messageTimestamp;
                        }
                        await messageUpserts.updateOne(
                            {id: key},
                            {
                                $set: {
                                    message,
                                    type: type === 'notify' || (existing === null || existing === void 0 ? void 0 : existing.type) === 'notify'
                                        ? 'notify'
                                        : type
                                }
                            },
                            {upsert: true}
                        )
                    }
                    break;
                case 'messages.update':
                    messageUpserts = store.collection("messages")
                    const msgUpdates = eventData;
                    for (const { key, update } of msgUpdates) {
                        const keyStr = stringifyMessageKey(key);
                        let existing = await messageUpserts.findOne({ id: keyStr });
                        if (existing) {
                            Object.assign(existing.message, update);
                            if (update.status === 4 && !key.fromMe) {
                                // decrementChatReadCounterIfMsgDidUnread(existing.message);
                            }
                            await messageUpserts.updateOne( {id: keyStr}, {$set : existing} )
                        }
                    }
                    break;
                case 'messages.delete':
                    messageUpserts = store.collection("messages")
                    const deleteData = eventData;
                    if ('keys' in deleteData) {
                        const { keys } = deleteData;
                        for (const key of keys) {
                            const keyStr = stringifyMessageKey(key);
                            await messageUpserts.deleteOne({ id: keyStr })
                        }
                    }
                    break;
                case 'messages.reaction':
                    messageUpserts = store.collection("messages")
                    const reactions = eventData;
                    for (const { key, reaction } of reactions) {
                        const keyStr = stringifyMessageKey(key);
                        let existing = await messageUpserts.findOne({ id: keyStr });
                        if (existing) {
                            updateMessageWithReaction(existing.message, reaction);
                            await messageUpserts.updateOne( {id: keyStr}, {$set : existing} )
                        }
                    }
                    break;
                case 'message-receipt.update':
                    messageUpserts = store.collection("messages")
                    const receipts = eventData;
                    for (const { key, receipt } of receipts) {
                        const keyStr = stringifyMessageKey(key);
                        let existing = await messageUpserts.findOne({ id: keyStr });
                        if (existing) {
                            updateMessageWithReceipt(existing.message, receipt);
                            await messageUpserts.updateOne( {id: keyStr}, {$set : existing} )
                        }
                    }
                    break;
                case 'groups.update':
                    groupUpdates = store.collection("groups")
                    for (const update of eventData) {
                        let upserts = (await groupUpdates.findOne({ id: update.id })) || {};
                        upserts = Object.assign(groupUpdates, update);
                        //await groupUpdates.updateOne({ id: update.id }, {$set : upserts}, {upsert: true})
                    }
                    break;
                default:
                    void 0;
                    // throw new Error(`"${event}" cannot be buffered`);
            }
            function decrementChatReadCounterIfMsgDidUnread(message) {
                // decrement chat unread counter
                // if the message has already been marked read by us
                const chatId = message.key.remoteJid;
                const chat = data.chatUpdates[chatId] || data.chatUpserts[chatId];
                if (isRealMessage(message)
                    && shouldIncrementChatUnread(message)
                    && typeof (chat === null || chat === void 0 ? void 0 : chat.unreadCount) === 'number'
                    && chat.unreadCount > 0) {
                    chat.unreadCount -= 1;
                    if (chat.unreadCount === 0) {
                        delete chat.unreadCount;
                    }
                }
            }
        }
        async function preconncetEvents(mode, query) {
            const map = {};
            globalMode = mode
            globalQuery = query
            let chatUpserts = store.collection("chats")
            let contactUpserts = store.collection("contacts")
            const chatUpsertList = mode
                ? await chatUpserts.find({
                    id : {
                        [mode == 'selecting' ? '$in' : '$nin'] : globalQuery
                    }
                  }).toArray()
                : await chatUpserts.find().toArray();
            if (chatUpsertList.length) {
                map['chats.upsert'] = chatUpsertList;
            }
            const contactUpsertList = await contactUpserts.find().toArray();
            if (contactUpsertList.length) {
                map['contacts.upsert'] = contactUpsertList;
            }
            return map;
        }
        async function readChatEvents(id) {
            const map = {};
            let messageUpserts = store.collection("messages")
            const messageUpsertList = await messageUpserts.find({id: { $regex: id }}).toArray();
            if (messageUpsertList.length) {
                const type = messageUpsertList[0].type;
                map['messages.upsert'] = {
                    messages: messageUpsertList.map(m => m.message),
                    type
                };
            }
            return map;
        }
        return {
            store,
            append,
            preconncetEvents,
            readChatEvents
        }
    }
}
