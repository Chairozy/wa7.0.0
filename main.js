require('dotenv').config();
const { exec } = require('child_process');
const http = require("http");
const https = require("https");
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const fileUpload = require('express-fileupload');
const { sequelize, WhatsappService } = require("./whiskey/db");
const pm2 = require('pm2')
const moment = require('moment-timezone')
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios')
const bodyParser = require('body-parser')

const hostUrl = 'https://api.whatsapp.maestrobyte.com';
const waServerPath = '/opt/whatsapp_mbs/whiskey/waServices.js';
function array_diff (arr1, arr2) {
    return arr1
    .filter(x => !arr2.includes(x))
    .concat(arr2.filter(x => !arr1.includes(x)));
}

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

app.use(fileUpload());
app.use(bodyParser.json({
	limit: '200mb'
}))
app.use(cors({
    //origin: process.env.SHARE,
    methods: "POST",
    preflightContinue: false,
}));

let ports = {};

app.post("/api/open_terminal", async (req, res) => {
    res.sendStatus(200);
    const { id } = req.body;
    console.log("masuk", id)
    if ( id && ports[id] === undefined) {
        service = await WhatsappService.findByPk(id);
        if (service) {
//        service.is_migrated_whiskey || !service.phone_auth
            if (true) {
                service.is_migrated_whiskey = true;
                service.save({fields: ['is_migrated_whiskey']})
                console.log("exec whiskey", id)
                pm2.start({
                    script: waServerPath, //"/opt/whatsapp_mbs/whiskey/waServices.js",
                    name: "wa" + id,
                    args: `${id}`
                })
            }else{
                console.log("exec", id)
                pm2.start({
                    script: waServerPath, //"/opt/whatsapp_mbs/service/waServices.js",
                    name: "wa" + id,
                    args: `${id}`
                })
            }
        }
        // const execWa = exec(`node exec ${id}`);
        // const execWa = 
        // exec(`pm2 start --name wa${id} service/waServices.js -- ${id}`);
        // ports[id] = execWa;
        // execWa.on('close', async (code, signal) => {
    	//     console.log("closed", id)
    	//     console.log(code, signal)
        //     delete ports[id];
        // });
    }
});
app.post("/api/restarts", (req, res) => {
    res.sendStatus(200);
    exec(`pm2 restart all`);
});
let latest_subs = [];
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
            console.log("DO DATABASE")
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
            if (isHasChange) {
                console.log("HAS DO CHANGES")
            }
            if (!isHasChange && rowIsArray && rows.length) {
                console.log("HAS DO NOTIFY")
                const rowGroups = rows.reduce((result, val) => {
                    if (!val.notified) {
                        const i = val.id
                        const group = dictOrig[i].is_subscription_service ? (dictOrig[i].subscription_status ? 'subs_on' : 'subs_off') : 'credit';
                        result[group].push(
                            `*- ${dictOrig[i].name}*\nWa ID: ${val.id} ${group == 'credit' ? '*CREDIT*' : (group == 'subs_on' ? '*SUBS _ON_*' : 'SUBS OFF')}\nJadwal: ${moment(dictOrig[i].schedule || dictOrig[i].created_at).format('_*D MMM* HH:mm:ss_')}\nWA Status: ${dictOrig[i].phone_auth ? '*TERHUBUNG*' : 'Terputus'}`
                        )
                        if (group === 'subs_on' && /mixue/i.test(dictOrig[i].name)) {
                            result[dictOrig[i].phone_auth ? 'tersambung' : 'terputus'].push(`*- ${dictOrig[i].name}*`)
                        }
                    }
                    return result
                }, {credit: [], subs_on: [], subs_off:[], tersambung: [], terputus: []})
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
                        to: '62887821520580',
                        type: 'text',
                        text: text
                    }, {
                        headers: {
                            authorization: '12345'
                        },
                    }).catch(err => {});
                    return;
                }else{
                    console.log("SERVICE HAS BEEN FULLY NOTIFIED")
                }
                if (rowGroups.tersambung.length) {
                    '120363046982156000@g.us';
                    let text = rowGroups.tersambung.join('\n');
                    text += "\nWA Status: *TERSAMBUNG*\n\r\nTerima kasih.";
                    console.log(text)
                    axios.post(`${hostUrl}:${5306}/api/message/send`, {
                        to: '6287821520580',
                        type: 'text',
                        text: text
                    }, {
                        headers: {
                            authorization: '12345'
                        },
                    }).catch(err => {});

                }
                if (rowGroups.terputus.length) {
                    let text = rowGroups.tersambung.join('\n');
                    text += "\nWA Status: *TERPUTUS*\n\r\nMohon melakukan scan ulang🙏🏻";
                    console.log(text)
                    axios.post(`${hostUrl}:${5306}/api/message/send`, {
                        to: '6287821520580',
                        type: 'text',
                        text: text
                    }, {
                        headers: {
                            authorization: '12345'
                        },
                    }).catch(err => {});
                }
            }
            dbFinish()
        });
    });
}

function start() {
    sequelize.query(
        "SELECT `wss`.`id` FROM `whatsapp_services` AS `wss` LEFT JOIN `users` ON `users`.`id` = `wss`.`admin_id` " +
        "WHERE `wss`.`phone_auth` IS NOT NULL " +
        "AND (" +
        "(`users`.`is_subscription_service` = 1 AND EXISTS (SELECT * FROM `subscriptions` WHERE `subscriptions`.`status` = 'paid' AND `subscriptions`.`user_id` = `wss`.`admin_id`)) " +
        "OR `users`.`is_subscription_service` = 0)",
        { type: "SELECT" }
    ).then(result => {
        for (let index = 0; index < result.length; index++) {
            const obj = result[index];
            let id = obj['id']

            pm2.start({
                script: waServerPath, //"/home/crawling/projectNodeJs/whatsapp_mbs/whiskey/waServices.js",
                name: "wa" + id,
                args: `${id}`
            })
        }
    }).catch(err => {
        console.log("check subscription: query database error")
        console.log(err)
    })
    .finally(() => {
        // 
    }) 
}

start();

pm2.connect(function() {
    console.log("pm2 connected at: ", moment().toISOString())
    setInterval(() => {
    	
        const now = moment().utc().format("YYYY-MM-DD HH:mm:ss")
        const nowLast5Minute = moment().utc().subtract(5, 'minute').format("YYYY-MM-DD HH:mm:ss")
        const nowLast2Minute = moment().utc().subtract(2, 'minute').format("YYYY-MM-DD HH:mm:ss")
        console.log("check on :", now)

        sequelize.query(
            "SELECT `msls`.`id` FROM `whatsapp_services` AS `msls` " +
"WHERE EXISTS (SELECT * FROM `users` WHERE `users`.`is_subscription_service` = 1 AND `users`.`id` > 17 AND `users`.`id` = `msls`.`admin_id`) " +
"AND NOT EXISTS (SELECT * FROM `subscriptions` WHERE `subscriptions`.`status` = 'paid' AND `subscriptions`.`user_id` = `msls`.`admin_id`)",
            { type: "SELECT" }
        ).then(WhatsappService => {
            let simpleId = WhatsappService.map(val => "wa"+val.id);
            console.log("un_subscription")
            let the_diff = array_diff(latest_subs, simpleId);
            if (the_diff.length) {
                console.log(simpleId)
                latest_subs.length = 0;
                latest_subs.push(...simpleId);
            }
            pm2.list(async function(err, list) {
                if (err) {
                    console.log("pm2 list has error")
                    return;
                }
                for (let li of list) {
                    if (simpleId.includes(li.name)) {
                        console.log('exec delete ' + li.name)
                        simpleId = simpleId.filter(val => val != li.name)
                        
                        await new Promise((resolve) => {
                            pm2.delete(li.pm_id, (err, proc) => {
                                console.log('pm2 delete: ', li.name, li.pm2_env.pm_exec_path)
                                resolve()
                            })
                        })
                    }
                }
            });
        }).catch(err => {
            console.log("check subscription: query database error")
            console.log(err)
        })
        .finally(() => {
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
    "AND `wss`.`deleted_at` IS NULL " +
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
                pm2.list(async function(err, list) {
                    if (err) {
                        console.log("pm2 list has error")
                        return;
                    }
	            let stopped = []
                    for (let li of list) {
                    
                        if (simpleId.includes(li.name)) {
                            stopped.push(li.name)
                            console.log('exec delete-start ' + li.name)
                            simpleId = simpleId.filter(val => val != li.name)
    
                            await new Promise((resolve) => {
                                pm2.delete(li.pm_id, (err, proc) => {
                                    console.log('pm2 delete: ', li.name, li.pm2_env.pm_exec_path)
                                    pm2.start({
                                        name: li.name,
                                        script: li.pm2_env.pm_exec_path,
                                        cwd: li.pm2_env.pm_cwd,
                                        interpreter: li.pm2_env.exec_interpreter,
                                        args: li.pm2_env.args.join(" ")
                                    }, () => {
                                        console.log('pm2 started: ', li.name)
                                        resolve()
                                    })
                                })
                            })
                        }
                    }
                    console.log("yang tidak terekesekusi maka di start")
                    console.log(simpleId)
                    for (let li of simpleId) {
                        await new Promise((resolve) => {
                            pm2.start({
                                script: waServerPath, //"/home/crawling/projectNodeJs/whatsapp_mbs/whiskey/waServices.js",
                                name: li,
                                args: `${li.replace('wa', '')}`
                            }, () => {
                                console.log('pm2 started: ', li)
                                resolve()
                            })
                        })
                    }
                })
                messageSentLogs && updateSqlite3(messageSentLogs)
            }).catch(err => {
                console.log("check pending: query database error")
                console.log(err)
            })
        })


    }, (15*60)*1000)
    
    app.post("/api/whatsapp/check", async (req, res) => {
        const jwt = req.headers.authorization;
        const rawJwt = jwt && jwt.replace('Bearer ', '');
        const port = req.body.port;
        console.log(port, rawJwt)
        if (!(jwt && port)) {
            res.status(200).json({status: -1});
            return
        }
        const whatsappService = await WhatsappService.findOne({where: {
            jwt_token: rawJwt,
            session: port,
        }})
        if (!whatsappService) {
            console.log("ga ada service")
            res.status(200).json({status: -1});
            return
        }else{
            pm2.list(async function(err, list) {
                if (err) {
                    console.log("pm2 list has error")
                    res.status(200).json({status: -1});
                    return;
                }
                let initial = "wa" + whatsappService.id;
                console.log("nama asli ", initial)
                if (list.map((li) => li.name).includes(initial)) {
		     axios.post(`${hostUrl}:${port}/api/whatsapp/check`, {}, {headers: {authorization: jwt}})
                    .then((axRes) => {
                        console.log(axRes.data)
                        res.status(200).json({status: axRes.data.status ? 0 : 1});
                    }).catch((err) => {
                        console.log("error")
                        res.status(200).json({status: 1});
                    })
                }else{
                    res.status(200).json({status: 1});
                }
            })
        }
    });
    
    server.listen(process.env.APP_PORT, () => {
        console.log('listening on ' + process.env.APP_PORT, server.address());
    });
})


