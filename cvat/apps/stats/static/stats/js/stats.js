"use strict";


document.addEventListener("DOMContentLoaded", buildStats);


function buildStats() {
    $('#loadingOverlay').remove();

    new ReactiveStats().init()
}

class ReactiveStats {
    constructor() {
        this._data = null;
        this._currentAnnotator = null;
        this._tilesContainer = $('.tiles-container');
        this._tableBody = $('.stats-table').find('.stats-table-body');

        this._operatorsTilesCollection = {}
    }

    init() {
        $.get('api/get/', (data) => {
            this._data = data || [];
            this.buildOperatorsTiles()
        })
    }

    buildOperatorsTiles() {
        Object.keys(this._data).forEach((operator, index) => {
            let tile = this.createTile(operator, this._data[operator]);
            this._operatorsTilesCollection[operator] = tile;
            if (index === 0) {
                this.switchCurrentOperator(operator)
            }
            tile.click(() => this.switchCurrentOperator(operator))
        })
    }

    createTile(operator, tileData) {
        let tileContainer = $('<div>', {
            class: 'col-md-12'
        })
            .data('operator', operator)
            .append($('<p>', {
                text: tileData.full_name || tileData.name,
                class: 'operator-name'
            }));
        let tile = $('<div>', {
            id: `operator-tile-${operator}`,
            class: 'row operator-tile',
        }).append(tileContainer);
        this._tilesContainer.append(tile);
        return tile
    }

    static secondsToHumanReadable(seconds) {
        let sec_num = parseInt(seconds, 10);
        let hours = Math.floor(sec_num / 3600);
        let minutes = Math.floor((sec_num - (hours * 3600)) / 60);

        if (hours < 10) {
            hours = "0" + hours;
        }
        if (minutes < 10) {
            minutes = "0" + minutes;
        }
        return `${hours}:${minutes}`
    }

    createTableRow(row) {
        let el = $('<tr>');
        row.spanRows.forEach((item) => el.append($('<th>', {rowspan: item.count, text: item.text})));
        el
            .append($('<th>', {text: row.data.job}))
            .append($('<td>', {text: ReactiveStats.secondsToHumanReadable(row.data.time)}))
            .append($('<td>', {text: row.data.boxes_count}))
            .append($('<td>', {text: row.data.ratio}));
        this._tableBody.append(el)
    }


    switchCurrentOperator(operator) {
        if (operator === this._currentAnnotator) {
            return
        }
        this._tableBody.empty();
        if (this._currentAnnotator !== null) {
            this._operatorsTilesCollection[this._currentAnnotator].removeClass('selected')
        }
        this._currentAnnotator = operator;
        this._operatorsTilesCollection[operator].addClass('selected');
        const stats = this._data[operator].stats;
        Object.keys(stats).sort((a, b) => new Date(b) - new Date(a)).forEach((key) => {
            stats[key].forEach((item, i) => {
                let row = {data: item, spanRows: []};
                if (i === 0) {
                    const totalBoxes = stats[key].map(item => item['boxes_count']).reduce((a, b) => a + b, 0);
                    row.spanRows = [
                        {count: stats[key].length, text: key},
                        {count: stats[key].length, text: totalBoxes}
                    ];
                    this.createTableRow(row)
                } else {
                    this.createTableRow(row)
                }
            })
        })
    }
}
