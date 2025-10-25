const pm2 = require('pm2')

pm2.connect(function() {

    pm2.list(async function(err, list) {

        for (let li of list) {
            if (Boolean(li.name.match(/^wa/g))) {
                await new Promise((resolve) => {
                    pm2.delete(li.pm_id, (err, proc) => {
                        pm2.start({
                            name: li.name,
                            script: li.pm2_env.pm_exec_path,
                            cwd: li.pm2_env.pm_cwd,
                            interpreter: li.pm2_env.exec_interpreter,
                            args: li.pm2_env.args.join(" ")
                        }, resolve)
                    })
                })
            }
            console.log(li.name, li.pm2_env.pm_exec_path)
        }
    })
})

setTimeout(() => void 0, 30000)