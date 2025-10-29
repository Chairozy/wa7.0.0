function useMessage(whatsapp) {

    async function checkDestination(number) {
        console.log("check number", number)
        if (whatsapp.stating == 'online') {
            const tempNumber = number.split("@")[0];
            if (!tempNumber || (typeof tempNumber == 'string' && tempNumber.length < 6)) return false;
            if (whatsapp.isJidGroup(number)) {
                const groups = await whatsapp.conn.groupMetadata(number).catch(() => {});
                console.log("after fetch group")
                if (groups) {
                    return true;
                }else{
                    return false;
                }
            }else{
//                console.log("will fetch number")
//                const [result] = await whatsapp.conn.onWhatsApp(number).catch(() => [null]);
//                console.log("after fetch number")
//                if (result && result.exists) {
                    return true;
//                } else {
//                    return false;
//                }
            }
        } else {
            return null;
        }
    }
    
    async function send(number, content, type = null) {
        // WAPresence = 'unavailable' | 'available' | 'composing' | 'recording' | 'paused';
        await whatsapp.conn.sendPresenceUpdate('composing', number);
        await (new Promise(r => setTimeout(r, 1800)));
        await whatsapp.conn.sendPresenceUpdate('available', number);
        const {text, mentions} = content
        switch (type == null ? content.type : type) {
            case 'location':
                return whatsapp.conn.sendMessage(number, content.contex, content.options)
            case 'contact':
            case 'contacts':
                return whatsapp.conn.sendMessage(number, content.contex, content.options)
            case 'message':
            case 'text':
                return whatsapp.conn.sendMessage(number, {text, ...(mentions && mentions.length > 0 ? {mentions} : {}), ...(content.contex || {}) }, content.options);
            case 'file':
            case 'media':
                let split_name = content.file.name.split("."),
                    extension = split_name[split_name.length - 1];
                switch (extension) {
                    case 'tiff':
                    case 'pjp':
                    case 'pjpeg':
                    case 'jfif':
                    case 'tif':
                    case 'gif':
                    case 'svg':
                    case 'bmp':
                    case 'png':
                    case 'jpeg':
                    case 'svgz':
                    case 'jpg':
                    case 'ico':
                    case 'xbm':
                    case 'dib':
                        return whatsapp.conn.sendMessage(number, { image: content.file.data, mimetype: content.file.mimetype, ...(text ? { caption: text, ...(mentions.length > 0 ? {mentions} : {}) } : {}), ...(content.contex || {}) }, content.options);
                    // case 'webp':
                    //     return whatsapp.conn.sendMessage(number, content.file.data, MessageType.sticker);
                    case 'm4v':
                    case '3gp':
                    case 'mov':
                    case 'mp4':
                        return whatsapp.conn.sendMessage(number, { video: content.file.data, mimetype: content.file.mimetype, ...(text ? { caption: text, ...(mentions.length > 0 ? {mentions} : {}) } : {}), ...(content.contex || {}) }, content.options);
                    default:
                        return whatsapp.conn.sendMessage(number, { document: content.file.data, fileName: content.file.name, mimetype: content.file.mimetype, ...(text ? { caption: text, ...(mentions.length > 0 ? {mentions} : {}) } : {}), }, content.options);
                }
        }
    }

        
    function phoneNumberFormatter(number) {
        let formatted = number.replace(/^\s*|\s*$/g, '');
        if (formatted.endsWith('@g.us') || formatted.endsWith('@c.us') || formatted.endsWith('@s.whatsapp.net')) {
            if (formatted.endsWith('@c.us')) {
                formatted.replace('@c.us', '@s.whatsapp.net');
            }
            return formatted;
        }else{
            if (formatted.startsWith('+')) {
                formatted = formatted.replace(/\D/g, '');
            }else{
                formatted = formatted.replace(/\D/g, '');
                if (formatted.startsWith('8')) {
                    formatted = '62' + formatted;
                }else if (formatted.startsWith('0')) {
                    formatted = '62' + formatted.substr(1);
                }
            }
            if (!formatted.endsWith('@c.us') && !formatted.endsWith('@s.whatsapp.net')) {
                formatted += '@s.whatsapp.net';
            }
            return formatted;
        }
    }

    // content = {
    //     degreesLatitude: 0,
    //     degreesLongitude: 0,
    //     name: 'string',
    //     url: 'string',
    //     address: 'string'
    // }
    function createLocation (content, thumbnail = null) {
        const result = {}
        const contentKeys = Object.keys(content);
        if ((contentKeys.includes('degreesLatitude') ? 1 : 0) + (contentKeys.includes('degreesLongitude') ? 1 : 0) == 1) throw "degreesLatitude and degreesLongitude must exist together";
        if (contentKeys.includes('degreesLatitude') && contentKeys.includes('degreesLongitude')) {
            if (typeof content.degreesLatitude !== 'number') throw "degreesLatitude must number"
            if (!content.degreesLatitude) throw "degreesLatitude cannot be 0"
            if (typeof content.degreesLongitude !== 'number') throw "degreesLongitude must number"
            if (!content.degreesLongitude) throw "degreesLongitude cannot be 0"
            result.degreesLatitude = content.degreesLatitude;
            result.degreesLongitude = content.degreesLongitude;
        }else if(thumbnail) {
        }
        if (contentKeys.includes('name')) {
            if (typeof content.name !== 'string') throw "name must string"
            if (!content.name) throw "name is required"
            result.name = content.name;
            if (contentKeys.includes('url')) {
                if (typeof content.url !== 'string') throw "url must string"
                if (!content.url) throw "url is required"
                if (!isValidHttpUrl(content.url)) throw "url must URL"
                result.url = content.url;
            }
        }
        if (contentKeys.includes('address')) {
            if (typeof content.address !== 'string') {
                throw "address must string"
            }
            if (!content.address) {
                throw "address is required"
            }
            result.address = content.address;
        }
        if (Object.keys(result).length <= 0 || (Object.keys(result).length == 1 && result.jpegThumbnail)) {
            throw "location fields is not correct"
        }
        return result;
    }

    function isValidHttpUrl(string) {
        let url;
        
        try {
            url = new URL(string);
        } catch (_) {
            return false;  
        }
      
        return url.protocol === "http:" || url.protocol === "https:";
    }

    // buttons = ['string', 'string']
    function createButton (buttons) {
        const result = []
        if (!Array.isArray(buttons)) throw "buttons must array string";
        for (let i in buttons) {
            if (typeof buttons[i] !== 'string') throw "buttons must array string";
            if (!buttons[i]) throw "buttons value string is required";
            result.push({
                buttonId: 'id-'+i,
                buttonText: {
                    displayText: buttons[i]
                },
                type: 1
            })
        }
        return result
    }

    // templateButtons = [
    //     {
    //         displayText: 'string',
    //         [urlButton | callButton]: 'string'
    //     }
    // ]
    function createTemplateButtons (templateButtons) {
        const keyPair = {
            quickReplyButton: 'id',
            urlButton: 'url',
            callButton: 'phoneNumber'
        }
        const result = []
        if (!Array.isArray(templateButtons)) throw "templateButtons must array object";
        for (let i in templateButtons) {
            if (typeof templateButtons[i] !== 'object' || Array.isArray(templateButtons[i])) throw "templateButtons value must object";
            const buttonsKeys = Object.keys(templateButtons[i]);
            if (!buttonsKeys.includes('displayText')) throw "templateButtons value displayText is required";
            if (typeof templateButtons[i].displayText !== 'string') throw "templateButtons value displayText must string";
            let keyType = "quickReplyButton";
            if (buttonsKeys.includes('urlButton') && buttonsKeys.includes('callButton')) throw "templateButtons value field only one of urlButton or callButton";
            if (buttonsKeys.includes('urlButton')) {
                keyType = "urlButton";
                if (typeof templateButtons[i].urlButton !== 'string') throw "templateButtons value urlButton must string";
            }else if(buttonsKeys.includes('callButton')) {
                keyType = "callButton";
                if (typeof templateButtons[i].callButton !== 'string') throw "templateButtons value callButton must string";
            }
            result.push({
                index: i,
                [keyType]: {
                    displayText: templateButtons[i].displayText,
                    [keyPair[keyType]]: keyType === "quickReplyButton" ? 'id-'+i : templateButtons[i][keyType]
                },
            })
        }
        return result
    }

    function validationFooter(footer) {
        if (footer && typeof footer !== 'string') throw "footer must string";
        return footer || ''
    }

    function validationTitle(title) {
        if (title && typeof title !== 'string') throw "title must string";
        return title || ''
    }

    // list = {
    //     displayText: 'string',
    //     sections: [
    //         {
    //             title: 'string',
    //             rows: [
    //                 {
    //                     title: 'string',
    //                     description: 'string'
    //                 }
    //             ]
    //         }
    //     ],
    // }
    function createList (list) {
        const result = {
            sections: []
        }
        const listKeys = Object.keys(list);
        if (!listKeys.includes('displayText') || !list.displayText) throw "displayText is required";
        if (typeof list.displayText !== "string") throw "displayText must string";
        result.buttonText = list.displayText;
        if (!listKeys.includes('sections') || !list.sections) throw "sections is required";
        if (!Array.isArray(list.sections) || list.sections.length <= 0) throw "sections must array object";
        for(let i in list.sections) {
            const sections = {};
            if (Array.isArray(list.sections[i]) || typeof list.sections[i] !== 'object') throw "sections must array object";
            const sectionsKeys = Object.keys(list.sections[i])
            if (!sectionsKeys.includes('title') && !sectionsKeys.includes('rows')) throw "sections must array object"
            if (sectionsKeys.includes('title')) {
                if (typeof list.sections[i].title !== 'string') throw "sections value title must string";
                sections.title = list.sections[i].title
            }
            if (sectionsKeys.includes('rows')) {
                sections.rows = []
                if (!Array.isArray(list.sections[i].rows)) throw "sections value rows must array object";
                for (let s in list.sections[i].rows) {
                    const rows = {}
                    if (Array.isArray(list.sections[i].rows[s]) || typeof list.sections[i].rows[s] !== 'object') throw "rows must array object";
                    const rowsKeys = Object.keys(list.sections[i].rows[s])
                    if (!rowsKeys.includes('title') || !list.sections[i].rows[s].title) throw "rows value title is required";
                    rows.title = list.sections[i].rows[s].title
                    if (typeof list.sections[i].rows[s].title !== 'string') throw "rows value title must string";
                    if (rowsKeys.includes('description')) {
                        if (typeof list.sections[i].rows[s].description !== 'string') throw "rows value description must string";
                        rows.description = list.sections[i].rows[s].description
                    }
                    sections.rows.push(rows)
                }
            }
            result.sections.push(sections)
        }
        return result
    }

    // content = {
    //     fullname: 'string',
    //     nickname: 'string,string',
    //     organization: 'string',
    //     birth_day: 'string',
    //     email: 'string | string;string;string',
    //     url: 'string | string;string;string',
    //     whatsapp: 'string | string;string;string',
    //     telephone: 'string | string;string;string',
    //     address_home: [
    //         'street;village/dsitrict/city;province;postal_code;nasional'
    //     ],
    //     address_work: [
    //         'street;village/dsitrict/city;province;postal_code;nasional'
    //     ],
    // }
    function createContact (content) {
        let vcard = 'BEGIN:VCARD\n'
                + 'VERSION:3.0\n';
        const contentKeys = Object.keys(content);
        if (!contentKeys.includes('fullname')) {
            throw "fullname is required"
        }else if(typeof content.fullname !== 'string') {
            throw "fullname must string"
        }
        vcard += 'FN:'+content.fullname+'\n';

        if (contentKeys.includes('nickname')) {
            if (typeof content.nickname !== 'string') throw "nickname must string";
            if (!content.nickname) throw "nickname is required";
            vcard += 'NICKNAME:'+content.nickname+'\n';
        }

        if (contentKeys.includes('organization')) {
            if (typeof content.organization !== 'string') throw "organization must string";
            if (!content.organization) throw "organization is required";
            vcard += 'ORG:'+content.organization+'\n';
        }

        if (contentKeys.includes('birth_day')) {
            if (typeof content.birth_day !== 'string') throw "birth_day must string";
            if (!content.birth_day) throw "birth_day is required";
            vcard += 'BDAY:'+content.birth_day+'\n';
        }

        if (contentKeys.includes('email')) {
            if (typeof content.email !== 'string') throw "email must string";
            if (!content.email) throw "email is required";
            const email = content.email.split(";")
            for(let i in email) {
                if (email[i]) {
                    vcard += 'EMAIL:'+email[i]+'\n';
                }
            }
        }

        if (contentKeys.includes('url')) {
            if (typeof content.url !== 'string') throw "url must string";
            if (!content.url) throw "url is required";
            const url = content.url.split(";")
            for(let i in url) {
                if (url[i]) {
                    vcard += 'URL:'+url[i]+'\n';
                }
            }
        }
        
        if (contentKeys.includes('whatsapp')) {
            if (typeof content.whatsapp !== 'string') throw "whatsapp must string";
            if (!content.whatsapp) throw "whatsapp is required";
            const whatsapp = content.whatsapp.split(";")
            for(let i in whatsapp) {
                if (whatsapp[i]) {
                    const whatsappJid = phoneNumberFormatter(whatsapp[i]).split("@")[0]
                    vcard += 'TEL;type=CELL;type=VOICE;waid='+whatsappJid+':'+whatsapp[i]+'\n';
                }
            }
        }

        if (contentKeys.includes('telephone')) {
            if (typeof content.telephone !== 'string') throw "telephone must string";
            if (!content.telephone) throw "telephone is required";
            const telephone = content.telephone.split(";")
            for(let i in telephone) {
                if (telephone[i]) {
                    vcard += 'TEL;type=CELL;type=VOICE:'+telephone[i]+'\n';
                }
            }
        }

        if (contentKeys.includes('address_home')) {
            if (content.address_home && typeof content.address_home === 'string') content.address_home = [content.address_home]
            if (!Array.isArray(content.address_home)) throw "address_home must array string";
            for(let i in content.address_home) {
                if (content.address_home[i]) {
                    vcard += 'ADR;TYPE=home:;;'+content.address_home[i]+'\n';
                }else{
                    throw "address_home value is required";
                }
            }
        }

        if (contentKeys.includes('address_work')) {
            if (content.address_work && typeof content.address_work === 'string') content.address_work = [content.address_work]
            if (!Array.isArray(content.address_work)) throw "address_work must array string";
            for(let i in content.address_work) {
                if (content.address_work[i]) {
                    vcard += 'ADR;TYPE=home:;;'+content.address_work[i]+'\n';
                }else{
                    throw "address_work value is required";
                }
            }
        }

        vcard += 'END:VCARD';
        return vcard
    }

    // @@+6281230281304 | @@089634858618
    function extractMention(textValue) {
        const mentionsInsert = []
        const mentions = []
        const text = textValue ? textValue.replace(/@@\+?\d+/g, (substring) => {
            const phone = phoneNumberFormatter(substring.substring(2));
            mentionsInsert.push(
                checkDestination(phone).then(res => {res ? mentions.includes(phone) ? null : mentions.push(phone) : null})
            )
            return "@" + phone.split("@")[0]
        }) : '';
        return Promise.all(mentionsInsert).then(() => {
            return {
                mentions,
                text
            }
        })
    }

    return {
        checkDestination,
        send,
        phoneNumberFormatter,
        createLocation,
        createButton,
        createTemplateButtons,
        validationFooter,
        validationTitle,
        createList,
        createContact,
        extractMention
    }
}

exports.useMessage = useMessage;
