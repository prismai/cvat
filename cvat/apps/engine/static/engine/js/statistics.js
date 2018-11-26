class StatsController {
    constructor() {
        if (!StatsController.instance) {
            StatsController.instance = this;
        }

        this.state = {
            jobId: null,
            manually: null,
            interpolated: null,
            intervalTime: null,
        };

        return StatsController.instance;
    }

    init(jobId, stats) {
        let toUpdate = {
            jobId: jobId,
            manually: stats.manually,
            interpolated: stats.interpolated,
            intervalTime: this.currentTime(),
        };
        this.updateState(toUpdate, true)
    }

    resetInterval() {
        this.updateState({intervalTime: this.currentTime()}, false)
    }

    currentTime() {
        return new Date().toISOString()
    }

    updateState(toUpdate, init=false) {
        Object.keys(toUpdate).forEach(key => {
            if (key === 'jobId' && !init) {
                return;
            } else {
                this.state[key] = toUpdate[key]
            }
        });
        return this.state
    }

    sendInterval(data) {
        data.job = this.state.jobId;
        $.post('/stats/api/save/', data);
        return true
    }

    processInterval(stats) {
        let toUpdate = {
            intervalTime: this.currentTime(),
        };
        if ((stats.manually !== this.state.manually) || stats.interpolated !== this.state.interpolated) {
            let intervalData = {
                manually: stats.manually - this.state.manually,
                totalInterpolated: stats.interpolated,
                totalManually: stats.manually,
                start: this.state.intervalTime,
                end: toUpdate.intervalTime,
            };
            this.sendInterval(intervalData);

            toUpdate.manually = stats.manually;
            toUpdate.interpolated = stats.interpolated;
        }
        this.updateState(toUpdate);
    }
}

const statsController = new StatsController();