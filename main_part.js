const { sequelize } = require("./whiskey/db");
const { exec } = require('child_process');
const fs = require('fs');


let push_query_log = false;
let await_response = [];

function push_query () {
    exec(
        "cp main_query.sql main_query.exec.sql && cat /dev/null > main_query.sql",
        async (err) => {
            let temp_await_response = [];
            while (await_response.length) {
                temp_await_response.push(await_response.shift())
            }
            push_query_log = false;

            if (!err) {
                try {
                    const strQuery = fs.readFileSync("main_query.exec.sql", "utf8");
                    fs.rmSync("main_query.exec.sql")
                    await sequelize.query(strQuery, {type: "RAW"});
                }catch(err){}
            }
            for(let cb of temp_await_response) {
                typeof cb === 'function' && cb();
            }
        }
    )
}

function db_query (cb = null) {
    await_response.push(cb)
    if (!push_query_log) {
        push_query_log = true;
        push_query();
    }
}

db_query()
