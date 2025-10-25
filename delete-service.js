const pm2 = require('pm2')
const fs = require('fs');

const jsonData = fs.readFileSync('./data/delete-services.json');
const ids = JSON.parse(jsonData);

pm2.connect(function() {

    pm2.list(async function(err, list) {

        for (let li of list) {
            console.log('check' + li.name)
            if (ids.includes(li.name)) {
                pm2.delete(li.pm_id, (err, proc) => {
                    console.log('deleted ' + li.name)
                })
            }
        }
    })
})

setTimeout(() => void 0, 30000)
