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

function append(data, event, eventData) {
    switch (event) {
        case 'chats.set':
            for (const chat of eventData.chats) {
                let upsert = data.chatUpserts[chat.id] || {};
                upsert = concatChats(upsert, chat);
                if (data.chatUpdates[chat.id]) {
                    upsert = concatChats(data.chatUpdates[chat.id], upsert);
                    delete data.chatUpdates[chat.id];
                }
                if (data.chatDeletes.has(chat.id)) {
                    data.chatDeletes.delete(chat.id);
                }
                data.chatUpserts[chat.id] = upsert;
            }
            break;
        case 'chats.upsert':
            for (const chat of eventData) {
                let upsert = data.chatUpserts[chat.id] || {};
                upsert = concatChats(upsert, chat);
                if (data.chatUpdates[chat.id]) {
                    upsert = concatChats(data.chatUpdates[chat.id], upsert);
                    delete data.chatUpdates[chat.id];
                }
                if (data.chatDeletes.has(chat.id)) {
                    data.chatDeletes.delete(chat.id);
                }
                data.chatUpserts[chat.id] = upsert;
            }
            break;
        case 'chats.update':
            for (const update of eventData) {
                const chatId = update.id;
                // if there is an existing upsert, merge the update into it
                const upsert = data.chatUpserts[chatId];
                if (upsert) {
                    concatChats(upsert, update);
                }
                else {
                    // merge the update into the existing update
                    const chatUpdate = data.chatUpdates[chatId] || {};
                    data.chatUpdates[chatId] = concatChats(chatUpdate, update);
                }
                // if the chat has been updated
                // ignore any existing chat delete
                if (data.chatDeletes.has(chatId)) {
                    data.chatDeletes.delete(chatId);
                }
            }
            break;
        case 'chats.delete':
            for (const chatId of eventData) {
                data.chatDeletes.add(chatId);
                // remove any prior updates & upserts
                if (data.chatUpdates[chatId]) {
                    delete data.chatUpdates[chatId];
                }
                if (data.chatUpserts[chatId]) {
                    delete data.chatUpserts[chatId];
                }
            }
            break;
        case 'contacts.set':
            for (const contact of eventData.contacts ) {
                let upsert = data.contactUpserts[contact.id] || {};
                upsert = Object.assign(upsert, contact);
                if (data.contactUpdates[contact.id]) {
                    upsert = Object.assign(data.contactUpdates[contact.id], upsert);
                    delete data.contactUpdates[contact.id];
                }
                data.contactUpserts[contact.id] = upsert;
            }
            break;
        case 'contacts.upsert':
            for (const contact of eventData ) {
                let upsert = data.contactUpserts[contact.id] || {};
                upsert = Object.assign(upsert, contact);
                if (data.contactUpdates[contact.id]) {
                    upsert = Object.assign(data.contactUpdates[contact.id], upsert);
                    delete data.contactUpdates[contact.id];
                }
                data.contactUpserts[contact.id] = upsert;
            }
            break;
        case 'contacts.update':
            const contactUpdates = eventData;
            for (const update of contactUpdates) {
                const id = update.id;
                // merge into prior upsert
                const upsert = data.contactUpserts[update.id];
                if (upsert) {
                    Object.assign(upsert, update);
                }
                else {
                    // merge into prior update
                    const contactUpdate = data.contactUpdates[id] || {};
                    data.contactUpdates[id] = Object.assign(contactUpdate, update);
                }
            }
            break;
        case 'messages.set':
            for (const message of eventData.messages) {
                const key = stringifyMessageKey(message.key);
                const existing = data.messageUpserts[key];
                if (existing) {
                    message.messageTimestamp = existing.message.messageTimestamp;
                }
                if (data.messageUpdates[key]) {
                    Object.assign(message, data.messageUpdates[key].update);
                    delete data.messageUpdates[key];
                }
                data.messageUpserts[key] = {
                    message,
                    type: 'notify'
                };
            }
            break;
        case 'messages.upsert':
            const { messages, type } = eventData;
            for (const message of messages) {
                const key = stringifyMessageKey(message.key);
                const existing = data.messageUpserts[key];
                if (existing) {
                    message.messageTimestamp = existing.message.messageTimestamp;
                }
                if (data.messageUpdates[key]) {
                    Object.assign(message, data.messageUpdates[key].update);
                    delete data.messageUpdates[key];
                }
                data.messageUpserts[key] = {
                    message,
                    type: type === 'notify' || (existing === null || existing === void 0 ? void 0 : existing.type) === 'notify'
                        ? 'notify'
                        : type
                };
            }
            break;
        case 'messages.update':
            const msgUpdates = eventData;
            for (const { key, update } of msgUpdates) {
                const keyStr = stringifyMessageKey(key);
                const existing = data.messageUpserts[keyStr];
                if (existing) {
                    Object.assign(existing.message, update);
                    // if the message was received & read by us
                    // the chat counter must have been incremented
                    // so we need to decrement it
                    if (update.status === 4 && !key.fromMe) {
                        decrementChatReadCounterIfMsgDidUnread(existing.message);
                    }
                }
                else {
                    const msgUpdate = data.messageUpdates[keyStr] || { key, update: {} };
                    Object.assign(msgUpdate.update, update);
                    data.messageUpdates[keyStr] = msgUpdate;
                }
            }
            break;
        case 'messages.delete':
            const deleteData = eventData;
            if ('keys' in deleteData) {
                const { keys } = deleteData;
                for (const key of keys) {
                    const keyStr = stringifyMessageKey(key);
                    data.messageDeletes[keyStr] = key;
                    if (data.messageUpserts[keyStr]) {
                        delete data.messageUpserts[keyStr];
                    }
                    if (data.messageUpdates[keyStr]) {
                        delete data.messageUpdates[keyStr];
                    }
                }
            }
            else {
                // TODO: add support
            }
            break;
        case 'messages.reaction':
            const reactions = eventData;
            for (const { key, reaction } of reactions) {
                const keyStr = stringifyMessageKey(key);
                const existing = data.messageUpserts[keyStr];
                if (existing) {
                    updateMessageWithReaction(existing.message, reaction);
                }
                else {
                    data.messageReactions[keyStr] = data.messageReactions[keyStr]
                        || { key, reactions: [] };
                    updateMessageWithReaction(data.messageReactions[keyStr], reaction);
                }
            }
            break;
        case 'message-receipt.update':
            const receipts = eventData;
            for (const { key, receipt } of receipts) {
                const keyStr = stringifyMessageKey(key);
                const existing = data.messageUpserts[keyStr];
                if (existing) {
                    updateMessageWithReceipt(existing.message, receipt);
                }
                else {
                    data.messageReceipts[keyStr] = data.messageReceipts[keyStr]
                        || { key, userReceipt: [] };
                    updateMessageWithReceipt(data.messageReceipts[keyStr], receipt);
                }
            }
            break;
        case 'groups.update':
            const groupUpdates = eventData;
            for (const update of groupUpdates) {
                const id = update.id;
                const groupUpdate = data.groupUpdates[id] || {};
                data.groupUpdates[id] = Object.assign(groupUpdate, update);
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
const makeBufferData = () => {
    return {
        chatUpserts: {},
        chatUpdates: {},
        chatDeletes: new Set(),
        contactUpserts: {},
        contactUpdates: {},
        messageUpserts: {},
        messageUpdates: {},
        messageReactions: {},
        messageDeletes: {},
        messageReceipts: {},
        groupUpdates: {}
    };
};
function consolidateEvents(data) {
    const map = {};
    const chatUpsertList = Object.values(data.chatUpserts);
    if (chatUpsertList.length) {
        map['chats.upsert'] = chatUpsertList;
    }
    const chatUpdateList = Object.values(data.chatUpdates);
    if (chatUpdateList.length) {
        map['chats.update'] = chatUpdateList;
    }
    const chatDeleteList = Array.from(data.chatDeletes);
    if (chatDeleteList.length) {
        map['chats.delete'] = chatDeleteList;
    }
    const messageUpsertList = Object.values(data.messageUpserts);
    if (messageUpsertList.length) {
        const type = messageUpsertList[0].type;
        map['messages.upsert'] = {
            messages: messageUpsertList.map(m => m.message),
            type
        };
    }
    const messageUpdateList = Object.values(data.messageUpdates);
    if (messageUpdateList.length) {
        map['messages.update'] = messageUpdateList;
    }
    const messageDeleteList = Object.values(data.messageDeletes);
    if (messageDeleteList.length) {
        map['messages.delete'] = { keys: messageDeleteList };
    }
    const messageReactionList = Object.values(data.messageReactions).flatMap(({ key, reactions }) => reactions.flatMap(reaction => ({ key, reaction })));
    if (messageReactionList.length) {
        map['messages.reaction'] = messageReactionList;
    }
    const messageReceiptList = Object.values(data.messageReceipts).flatMap(({ key, userReceipt }) => userReceipt.flatMap(receipt => ({ key, receipt })));
    if (messageReceiptList.length) {
        map['message-receipt.update'] = messageReceiptList;
    }
    const contactUpsertList = Object.values(data.contactUpserts);
    if (contactUpsertList.length) {
        map['contacts.upsert'] = contactUpsertList;
    }
    const contactUpdateList = Object.values(data.contactUpdates);
    if (contactUpdateList.length) {
        map['contacts.update'] = contactUpdateList;
    }
    const groupUpdateList = Object.values(data.groupUpdates);
    if (groupUpdateList.length) {
        map['groups.update'] = groupUpdateList;
    }
    return map;
}
let globalQuery = [];
let globalMode = null;
function preconncetEvents(data, mode, query) {
    const map = {};
    globalMode = mode
    globalQuery = query
    const chatUpsertList = mode
        ? Object.entries(data.chatUpserts).reduce((res, val) => {
            const exists = globalQuery.includes(val[0]);
            (globalMode == 'selecting' ? exists : !exists) && res.push(val[1]);
            return res
        }, [])
        : Object.values(data.chatUpserts);
    if (chatUpsertList.length) {
        map['chats.upsert'] = chatUpsertList;
    }
    const chatUpdateList = Object.values(data.chatUpdates);
    if (chatUpdateList.length) {
        map['chats.update'] = chatUpdateList;
    }
    // const chatDeleteList = Array.from(data.chatDeletes);
    // if (chatDeleteList.length) {
    //     map['chats.delete'] = chatDeleteList;
    // }
    const contactUpsertList = Object.values(data.contactUpserts);
    if (contactUpsertList.length) {
        map['contacts.upsert'] = contactUpsertList;
    }
    const contactUpdateList = Object.values(data.contactUpdates);
    if (contactUpdateList.length) {
        map['contacts.update'] = contactUpdateList;
    }
    // const groupUpdateList = Object.values(data.groupUpdates);
    // if (groupUpdateList.length) {
    //     map['groups.update'] = groupUpdateList;
    // }
    return map;
}
function readChatEvents(data, id) {
    const map = {};
    const messageUpsertList = Object.keys(data.messageUpserts).filter(k => k.startsWith(id));
    if (messageUpsertList.length) {
        const messages = messageUpsertList.map(m => data.messageUpserts[m].message)
        map['messages.upsert'] = {
            messages,
            type: data.messageUpserts[messageUpsertList[0]].type
        };
    }
    // const messageUpdateList = Object.keys(data.messageUpdates).filter(k => k.startsWith(id));
    // if (messageUpdateList.length) {
    //     map['messages.update'] = messageUpdateList.map(m => data.messageUpdates[m]);
    // }
    // const messageDeleteList = Object.keys(data.messageDeletes).filter(k => k.startsWith(id));
    // if (messageDeleteList.length) {
    //     map['messages.delete'] = { keys: messageDeleteList.map(m => data.messageDeletes[m]) };
    // }
    // const messageReactionList = Object.keys(data.messageReactions).filter(k => k.startsWith(id)).map(m => data.messageReactions[m]).flatMap(({ key, reactions }) => reactions.flatMap(reaction => ({ key, reaction })));
    // if (messageReactionList.length) {
    //     map['messages.reaction'] = messageReactionList;
    // }
    // const messageReceiptList = Object.keys(data.messageReceipts).filter(k => k.startsWith(id)).map(m => data.messageReceipts[m]).flatMap(({ key, userReceipt }) => userReceipt.flatMap(receipt => ({ key, receipt })));
    // if (messageReceiptList.length) {
    //     map['message-receipt.update'] = messageReceiptList;
    // }
    return map;
}

function queryFilter(data, kind = 'obj') {
    if (kind == 'obj') {
        return globalMode
            ? Object.entries(data).reduce((res, val) => {
                const exists = globalQuery.includes(val[0]);
                (globalMode == 'selecting' ? exists : !exists) && res.push(val[1]);
                return res
            }, [])
            : Object.values(data);
    }else if(kind == 'arr') {
        return globalMode
            ? data.filter(v => globalMode == 'selecting' ? globalQuery.includes(v) : !globalQuery.includes(v)) 
            : data;

    }else if(kind == 'msg') {
        return globalMode
            ? Object.entries(data).reduce((res, val) => {
                const exists = globalQuery.some(key => val[0].startsWith(key));
                (globalMode == 'selecting' ? exists : !exists) && res.push(val[1]);
                return res
            }, [])
            : Object.values(data);;

    }
}

function consolidateEventsFilter(data) {
    const map = {};
    const chatUpsertList = queryFilter(data.chatUpserts);
    if (chatUpsertList.length) {
        map['chats.upsert'] = chatUpsertList;
    }
    const chatUpdateList = queryFilter(data.chatUpdates);
    if (chatUpdateList.length) {
        map['chats.update'] = chatUpdateList;
    }
    const chatDeleteList = queryFilter(Array.from(data.chatDeletes), 'arr');
    if (chatDeleteList.length) {
        map['chats.delete'] = chatDeleteList;
    }
    const messageUpsertList = queryFilter(data.messageUpserts, 'msg');
    if (messageUpsertList.length) {
        const type = messageUpsertList[0].type;
        map['messages.upsert'] = {
            messages: messageUpsertList.map(m => m.message),
            type
        };
    }
    const messageUpdateList = queryFilter(data.messageUpdates, 'msg');
    if (messageUpdateList.length) {
        map['messages.update'] = messageUpdateList;
    }
    const messageDeleteList = queryFilter(data.messageDeletes, 'msg');
    if (messageDeleteList.length) {
        map['messages.delete'] = { keys: messageDeleteList };
    }
    const messageReactionList = queryFilter(data.messageReactions, 'msg').flatMap(({ key, reactions }) => reactions.flatMap(reaction => ({ key, reaction })));
    if (messageReactionList.length) {
        map['messages.reaction'] = messageReactionList;
    }
    const messageReceiptList = queryFilter(data.messageReceipts, 'msg').flatMap(({ key, userReceipt }) => userReceipt.flatMap(receipt => ({ key, receipt })));
    if (messageReceiptList.length) {
        map['message-receipt.update'] = messageReceiptList;
    }
    const contactUpsertList = queryFilter(data.contactUpserts);
    if (contactUpsertList.length) {
        map['contacts.upsert'] = contactUpsertList;
    }
    const contactUpdateList = queryFilter(data.contactUpdates);
    if (contactUpdateList.length) {
        map['contacts.update'] = contactUpdateList;
    }
    const groupUpdateList = queryFilter(data.groupUpdates);
    if (groupUpdateList.length) {
        map['groups.update'] = groupUpdateList;
    }
    return map;
}
function filterMapData(map) {
    const storeBuffer = makeBufferData();
    for (const event in map) {
        append(storeBuffer, event, map[event])
    }
    return consolidateEventsFilter(storeBuffer)
}

exports.readChatEvents = readChatEvents;
exports.preconncetEvents = preconncetEvents;
exports.consolidateEvents = consolidateEvents;
exports.append = append;
exports.filterMapData = filterMapData;
exports.makeBufferData = makeBufferData;