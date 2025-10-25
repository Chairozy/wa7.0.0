const office = {
    //prop queue task stack
    queue : [],
    process: null,

    start() {
        const _t = this;
        
        (function loop() {
            const now = new Date();
            now.toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});
            const delay = 1000 - (now.getTime() % 1000);
            setTimeout(loop, delay);
            _t.toProcess();
        })();
    },

    add(id, date = undefined) {
        this.queue.push({id, date: date || undefined});
    },

    replaceQueue(queue) {
        this.queue = queue;
    },

    remove(id) {
        let found = false;
        this.queue = this.queue.filter(item => {
            const notMatch = item.id != id;
            if (!found && !notMatch) {found = true}
            return notMatch;
        });
        return found;
    },

    async toProcess() {
        if (this.process !== null) {
            return this.process.id || undefined;
        }
        if (typeof this.beforeProcess === 'function') {
            await this.beforeProcess();
            this.beforeProcess = null;
        }
        const nonscheduled = this.queue.filter(item => item.date === undefined);
        let picked = null;
        if (nonscheduled.length > 0) {
            picked = this.process = nonscheduled[0]
            this.queue = this.queue.filter(item => item.id !== picked.id);
        }else{
            const now = new Date();
            now.toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});
            const scheduled = this.queue.filter(item => item.date !== undefined)
                .sort((a, b) => (new Date(a.date)).getTime() - (new Date(b.date)).getTime());
            if (scheduled.length > 0) {
                const schedule = new Date(scheduled[0].date);
                schedule.toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});
                if (now.getTime() >= schedule.getTime()) {
                    picked = this.process = scheduled[0]
                    this.queue = this.queue.filter(item => item.id !== picked.id);
                }
            }
        }
        const _t = this
        if (picked !== null) this.command(picked.id, () => {
            _t.process = null;
            _t.finish(picked.id)
            _t.toProcess();
        })
    },

    beforeProcess : null,

    command (id, next) {next()},

    finish (id) {}
}

exports.office = office;
