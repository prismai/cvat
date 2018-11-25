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
            .append($('<p>', {text: tileData.name, class: 'operator-name'}));
        let tile = $('<div>', {
            id: `operator-tile-${operator}`,
            class: 'row operator-tile',
        }).append(tileContainer);
        this._tilesContainer.append(tile);
        return tile
    }

    createTableRow(rowSpan, rowSpanCount, rowData) {
        let row = $('<tr>');
        if (rowSpan !== null && rowSpanCount !== null) {
            row.append($('<th>', {rowspan: rowSpanCount, text: rowSpan}))
        }
        row
            .append($('<th>', {text: rowData.job}))
            .append($('<td>', {text: rowData.hours}))
            .append($('<td>', {text: rowData.boxes_count}))
            .append($('<td>', {text: rowData.ratio}));
        this._tableBody.append(row)
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
                if (i === 0) {
                    this.createTableRow(key, stats[key].length, item)
                } else {
                    this.createTableRow(null, null, item)
                }
            })
        })
    }
}
