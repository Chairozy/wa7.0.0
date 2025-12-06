const { sequelize } = require("./whiskey/db");
const moment = require('moment-timezone');
const sqlite3 = require('sqlite3').verbose();


const now = moment().utc().format("YYYY-MM-DD HH:mm:ss")
const nowLast5Minute = moment().subtract(5, 'minute').utc().format("YYYY-MM-DD HH:mm:ss")
const nowLast2Minute = moment().subtract(2, 'minute').utc().format("YYYY-MM-DD HH:mm:ss")
console.log("check on :", now)
console.log(nowLast2Minute)
console.log(nowLast5Minute)

function updateSqlite3 (msgs) {
    const db = new sqlite3.Database(`./data/main.db`);
  
    db.serialize(() => {
        db.run('CREATE TABLE IF NOT EXISTS `collectings` (`id` INTEGER PRIMARY KEY, `msg_id` INTEGER, `mnsg_id` INTEGER, `notified` BOOLEAN NOT NULL DEFAULT 0)');

        const dict = {}
        const stuckIds = msgs.map((val) => (dict[val.whatsapp_service_id] = val) && val.whatsapp_service_id)
        const dictOrig = {...dict}
        const qInsert = db.prepare('INSERT INTO `collectings` (`id`, `msg_id`, `mnsg_id`) VALUES (?, ?, ?)');
        const qUpdate = db.prepare('UPDATE `collectings` SET `msg_id` = ?, `mnsg_id` = ?, `notified` = ? WHERE `id` = ?');
        const dbFinish = () => {
            qInsert.finalize()
            qUpdate.finalize()
            db.close()
        }
        const qUpdateNotif = (val) => db.run('UPDATE `collectings` SET `notified` = ' + val, dbFinish);
        db.run("DELETE FROM `collectings` WHERE `id` NOT IN ("+stuckIds.join(",")+")")
        db.all("SELECT * FROM `collectings`", (err, rows) => {
            if (err) return dbFinish();
            let isHasChange = false;
            const rowIsArray = Array.isArray(rows)
            rowIsArray && rows.forEach((val) => {
                const i = val.id
                isHasChange = isHasChange || dict[i].id != val.msg_id || dict[i].message_number_id != val.mnsg_id
                qUpdate.run(dict[i].id, dict[i].message_number_id, val.notified, dict[i].whatsapp_service_id)
                delete dict[i]
            })
            for(let i in dict) {
                isHasChange = true
                qInsert.run(i, dict[i].id, dict[i].message_number_id)
            }
            if (!isHasChange && rowIsArray && rows.length) {
                const rowGroups = rows.reduce((result, val) => {
                    if (!val.notified) {
                        const i = val.id
                        const group = dictOrig[i].is_subscription_service ? (dictOrig[i].subscription_status ? 'subs_on' : 'subs_off') : 'credit';
                        result[group].push(
                            `*- ${dictOrig[i].name}*\nWa ID: ${val.id} ${group == 'credit' ? '*CREDIT*' : (group == 'subs_on' ? '*SUBS _ON_*' : 'SUBS OFF')}\nJadwal: ${moment(dictOrig[i].schedule || dictOrig[i].created_at).format('_*D MMM* HH:mm:ss_')}\nWA Status: ${dictOrig[i].phone_auth ? '*TERHUBUNG*' : 'Terputus'}`
                        )
                    }
                    return result
                }, {credit: [], subs_on: [], subs_off:[]})
                const rowTexts = [...rowGroups.credit]
                rowTexts.push(...rowGroups.subs_on)
                rowTexts.push(...rowGroups.subs_off)
                if (rowTexts.length) {
                    let text = "*MBS Messaging*\n*(Do Not Reply)*\n\r\n";
                    text += "Pengiriman Pesan nyangkut di MBS:\n";
                    text += rowTexts.join('\n')
                    qUpdateNotif(1)
                    console.log(text)
                    axios.post(`${hostUrl}:${5306}/api/message/send`, {
                        to: '6289634858618',
                        type: 'text',
                        text: text
                    }, {
                        headers: {
                            authorization: '12345'
                        },
                    }).catch(err => {});
                    return;
                }
            }
            dbFinish()
        });
    });
}
sequelize.query(
                "SELECT  `msls`.`id`, `msls`.`whatsapp_service_id`, `msls`.`status`, `msls`.`schedule`, `msls`.`created_at`, " +
    "`users`.`is_subscription_service`, `users`.`name`, `wss`.`phone_auth`, `subscriptions`.`status` AS `subscription_status`, " +
    "IF(`msls`.`status` = 'process', (SELECT `qms`.`id` FROM `message_number_sent_logs` AS `qms` WHERE `qms`.`message_sent_log_id` = `msls`.`id` AND `qms`.`status` IS NOT NULL ORDER BY `qms`.`updated_at` DESC LIMIT 1), NULL) AS `message_number_id` " +
    "FROM `message_sent_logs` AS `msls` " +
    "LEFT JOIN `whatsapp_services` AS `wss` ON `msls`.`whatsapp_service_id` = `wss`.`id` " +
    "LEFT JOIN `users` ON `users`.`id` = `wss`.`admin_id` " +
    "LEFT JOIN `subscriptions` ON `users`.`id` = `subscriptions`.`user_id` AND `subscriptions`.`status` = 'paid' " +
    "WHERE (" +
        "(" +
            "`msls`.`status` IS NULL AND `msls`.`updated_at` < '"+nowLast2Minute+"' AND NOT EXISTS (SELECT * FROM `message_sent_logs` AS `msl` WHERE `msl`.`whatsapp_service_id` = `msls`.`whatsapp_service_id` AND `msl`.`id` != `msls`.`id` AND `msl`.`status` = 'process') AND (`msls`.`schedule` IS NULL OR `msls`.`schedule` < '"+now+"')" +
        ") OR (" +
            "`msls`.`status` = 'process' AND NOT EXISTS (SELECT * FROM `message_number_sent_logs` AS `mnsl` WHERE `mnsl`.`message_sent_log_id` = `msls`.`id` AND `mnsl`.`status` IS NOT NULL AND `mnsl`.`updated_at` > '"+nowLast5Minute+"')" +
        ")" +
    ") " +
    "AND `wss`.`deleted_at` IS NULL AND `wss`.`is_waha_system` = 0 " +
    // "AND EXISTS (" +
    // "SELECT `whatsapp_services`.* FROM `whatsapp_services` AS `wss` LEFT JOIN `users` ON `users`.`id` = `wss`.`admin_id` " +
    //     "WHERE `msls`.`whatsapp_service_id` = `wss`.`id` AND `wss`.`phone_auth` IS NOT NULL " +
    //     "AND (" +
    //         "(`users`.`is_subscription_service` = 1 AND EXISTS (SELECT * FROM `subscriptions` WHERE `subscriptions`.`status` = 'paid' AND `subscriptions`.`user_id` = `wss`.`admin_id`)) " +
    //         "OR `users`.`is_subscription_service` = 0" +
    //     ")" +
    // ")" +
    "GROUP BY `msls`.`whatsapp_service_id`",
  { type: "SELECT" }
).then(messageSentLogs => {
                let simpleId = messageSentLogs.filter((val) => {
                    return val.phone_auth && ((val.is_subscription_service && val.subscription_status) || !val.is_subscription_service)
                }).map((val) => "wa"+val.whatsapp_service_id)
                console.log("pending process")
                console.log(simpleId)
	        messageSentLogs && updateSqlite3(messageSentLogs)
})
