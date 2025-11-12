const office = {
    //prop queue task stack
    queue : [],
    process: new Map(),
    promises: [],
    firstParallel: false,
    interval_default: [10, 15],
    service: null,

    get hasParallel() {
        return this.promises.length > 0;
    },
    
    randomTicks(min = null, max = null, ms = 1000) {
        let [interval_min, interval_max] = this.service.custom_interval.split(";");
		interval_min = this.service.feature_custom_interval && this.service.is_custom_interval && parseInt(interval_min) || null;
		interval_max = this.service.feature_custom_interval && this.service.is_custom_interval && parseInt(interval_max || interval_min) || null;
        min = Math.ceil(interval_min || this.interval_default[0]);
        max = Math.floor(interval_max || this.interval_default[1]);
        return (Math.floor(Math.random() * (max - min + 1)) + min) * ms;
    },

    async timeoutPromise() {
        if (!this.hasParallel) return;
        while (this.hasParallel) {
            await (new Promise(r => setTimeout(r, this.randomTicks())))
            const resolve = this.promises.shift();
            if (typeof resolve === 'function') resolve();
            const resolve2 = this.promises.shift();
            if (typeof resolve2 === 'function') resolve2();
        }
    },

    parallelPromise () {
        return new Promise(r => {
            const currentlyEmpty = !this.hasParallel;
            this.promises.push(r);
            if (currentlyEmpty) this.timeoutPromise();
        });
    },

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
        if (typeof id === "string") {
            this.queue.push({id, date: date || undefined});
        }else if(typeof id === "object" && id.id && id.with_message_id) {
            this.queue.push({...id, date: date || undefined});
        }
    },

    replaceQueue(queue) {
        this.queue = queue;
    },

    remove(id) {
        let found = false;
        let with_item = null;
        this.queue = this.queue.filter(item => {
            const notMatch = item.id != id;
            if (!notMatch) {with_item = item}
            if (!found && !notMatch) {found = true}
            return notMatch;
        });
        if (with_item && with_item.with_message_id) {
            this.queue = this.queue.filter(item => item.id != with_item.with_message_id)
        }
        return found;
    },

    async toProcess() {
        const currentProcessedIds = new Set([...this.process.keys()]);
        if (this.process.size > 0) {
            return [...this.process.keys()];            
        }
        if (typeof this.beforeProcess === 'function') {
            await this.beforeProcess();
            this.beforeProcess = null;
        }
        const nonscheduled = this.queue.filter(item => item.date === undefined && !currentProcessedIds.has(item.id));
        let picked = null;
        if (nonscheduled.length > 0) {
            picked = nonscheduled[0];
            this.process.set(picked.id, picked);
            this.remove(picked.id);
        }else{
            const now = new Date();
            now.toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});
            const scheduled = this.queue.filter(item => item.date !== undefined && !currentProcessedIds.has(item.id))
                .sort((a, b) => (new Date(a.date)).getTime() - (new Date(b.date)).getTime());
            if (scheduled.length > 0) {
                const schedule = new Date(scheduled[0].date);
                schedule.toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});
                if (now.getTime() >= schedule.getTime()) {
                    picked = scheduled[0]
                    this.process.set(picked.id, scheduled[0]);
                    this.remove(picked.id);
                }
            }
        }
        if (picked !== null) this.pushProcess(picked.id);
    },

    pushProcess(pickedId) {
        const _t = this
        this.command(pickedId, () => {
            _t.process.delete(pickedId);
            _t.finish(pickedId)
            _t.toProcess();
        })
    },

    beforeProcess : null,

    command (id, next) {next()},

    finish (id) { console.log("finish:", id); }
}

exports.office = office;
