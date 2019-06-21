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
        this._tableBody = $('.stats-table').find('tbody');

        this._operatorsTilesCollection = {}
    }

    init() {
        $.get('api/get_stats/', (data) => {
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

    createTableRow(rowData) {
        let row = $('<tr>')
            .append($('<th>', {scope: 'row', text: rowData.date}))
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
        this._data[operator].stats.forEach((item) => this.createTableRow(item))
    }
}
