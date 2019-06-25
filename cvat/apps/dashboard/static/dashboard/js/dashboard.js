/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* global
    AnnotationParser:false
    userConfirm:false
    dumpAnnotationRequest: false
    LabelsInfo:false
    showMessage:false
    showOverlay:false
*/

'use strict';


const XML_DUMP_FORMAT = 'o_xml';
const VIRTUAL_CAMERA_JSON_DUMP_FORMAT = 'vc_json';
const TIMESTAMPS_DUMP_FORMAT = 'tsp';


class TaskView {
    constructor(task, availableAssignees) {
        this.init(task);
        this._availableAssignees = availableAssignees;
        this._UI = null;
    }

    _disable() {
        this._UI.find('*').attr('disabled', true).css('opacity', 0.5);
        this._UI.find('.dashboardJobList').empty();
    }

    async _remove() {
        try {
            await this._task.delete();
        } catch (exception) {
            let { message } = exception;
            if (exception instanceof window.cvat.exceptions.ServerError) {
                message += ` Code: ${exception.code}`;
            }
            showMessage(message);
        }

        this._disable();
    }

    _update() {
        $('#dashboardUpdateModal').remove();

        const dashboardUpdateModal = $($('#dashboardUpdateTemplate').html()).appendTo('body');

        // TODO: Use JSON labels format instead of custom
        $('#dashboardOldLabels').prop('value', LabelsInfo.serialize(this._task.labels.map(el => el.toJSON())));
        $('#dashboardCancelUpdate').on('click', () => {
            dashboardUpdateModal.remove();
        });
        $('#dashboardSubmitUpdate').on('click', () => {
            let jsonLabels = null;
            try {
                jsonLabels = LabelsInfo.deserialize($('#dashboardNewLabels').prop('value'));
            } catch (exception) {
                showMessage(exception);
                return;
            }

            try {
                const labels = jsonLabels.map(label => new window.cvat.classes.Label(label));
                this._task.labels = labels;
                this._task.save();
                showMessage('Task has been successfully updated');
            } catch (exception) {
                let { message } = exception;
                if (exception instanceof window.cvat.exceptions.ServerError) {
                    message += ` Code: ${exception.code}`;
                }
                showMessage(message);
            }

            dashboardUpdateModal.remove();
        });
    }

    _upload() {
        async function saveChunk(parsed) {
            const CHUNK_SIZE = 30000;
            let chunk = null;

            class Chunk {
                constructor() {
                    this.shapes = [];
                    this.tracks = [];
                    this.tags = [];
                    this.capasity = CHUNK_SIZE;
                    this.version = 0;
                }

                length() {
                    return this.tags.length
                           + this.shapes.length
                           + this.tracks.reduce((sum, track) => sum + track.shapes.length, 0);
                }

                isFull() {
                    return this.length() >= this.capasity;
                }

                isEmpty() {
                    return this.length() === 0;
                }

                clear() {
                    this.shapes = [];
                    this.tracks = [];
                    this.tags = [];
                }

                export() {
                    return {
                        shapes: this.shapes,
                        tracks: this.tracks,
                        tags: this.tags,
                        version: this.version,
                    };
                }

                async save(taskID) {
                    try {
                        const response = await $.ajax({
                            url: `/api/v1/tasks/${taskID}/annotations?action=create`,
                            type: 'PATCH',
                            data: JSON.stringify(chunk.export()),
                            contentType: 'application/json',
                        });
                        this.version = response.version;
                        this.clear();
                    } catch (error) {
                        throw error;
                    }
                }
            }

            const splitAndSave = async (chunkForSave, prop, splitStep) => {
                for (let start = 0; start < parsed[prop].length; start += splitStep) {
                    Array.prototype.push.apply(chunkForSave[prop],
                        parsed[prop].slice(start, start + splitStep));
                    if (chunkForSave.isFull()) {
                        await chunkForSave.save(this._task.id);
                    }
                }
                // save tail
                if (!chunkForSave.isEmpty()) {
                    await chunkForSave.save(this._task.id);
                }
            };

            chunk = new Chunk();
            // TODO tags aren't supported by parser
            // await split(chunk, "tags", CHUNK_SIZE);
            await splitAndSave(chunk, 'shapes', CHUNK_SIZE);
            await splitAndSave(chunk, 'tracks', 1);
        }

        async function save(parsed) {
            await $.ajax({
                url: `/api/v1/tasks/${this._task.id}/annotations`,
                type: 'DELETE',
            });

            await saveChunk.call(this, parsed);
        }

        async function onload(overlay, text) {
            try {
                overlay.setMessage('Required data are being downloaded from the server..');
                const imageCache = await $.get(`/api/v1/tasks/${this._task.id}/frames/meta`);
                const labelsCopy = JSON.parse(JSON.stringify(this._task.labels
                    .map(el => el.toJSON())));
                const parser = new AnnotationParser({
                    start: 0,
                    stop: this._task.size,
                    image_meta_data: imageCache,
                }, new LabelsInfo(labelsCopy));

                overlay.setMessage('The annotation file is being parsed..');
                const parsed = parser.parse(text);

                overlay.setMessage('The annotation is being saved..');
                await save.call(this, parsed);

                const message = 'Annotation have been successfully uploaded';
                showMessage(message);
            } catch (errorData) {
                let message = null;
                if (typeof (errorData) === 'string') {
                    message = `Can not upload annotations. ${errorData}`;
                } else {
                    message = `Can not upload annotations. Code: ${errorData.status}. `
                        + `Message: ${errorData.responseText || errorData.statusText}`;
                }
                showMessage(message);
            } finally {
                overlay.remove();
            }
        }

        $('<input type="file" accept="text/xml">').on('change', (onChangeEvent) => {
            const file = onChangeEvent.target.files[0];
            $(onChangeEvent.target).remove();
            if (file) {
                const overlay = showOverlay('File is being parsed..');
                const fileReader = new FileReader();
                fileReader.onload = (onloadEvent) => {
                    onload.call(this, overlay, onloadEvent.target.result);
                };
                fileReader.readAsText(file);
            }
        }).click();
    }

    async _dump(button) {
        button.disabled = true;
        try {
            await dumpAnnotationRequest(this._task.id, this._task.name, XML_DUMP_FORMAT);
        } catch (error) {
            showMessage(error.message);
        } finally {
            button.disabled = false;
        }
    }

    async _dumpJSON(button) {
        button.disabled = true;
        try {
            await dumpAnnotationRequest(this._task.id, this._task.name, VIRTUAL_CAMERA_JSON_DUMP_FORMAT);
        } catch (error) {
            showMessage(error.message);
        } finally {
            button.disabled = false;
        }
    }

    async _dumpTimestamps(button) {
        button.disabled = true;
        try {
            await dumpAnnotationRequest(this._task.id, this._task.name, TIMESTAMPS_DUMP_FORMAT);
        } catch (error) {
            showMessage(error.message);
        } finally {
            button.disabled = false;
        }
    }

    serializeForm(form) {
        return form.serializeArray()
            .reduce(function (a, x) {
                a[x.name] = x.value;
                return a;
            }, {})
    }

    _updateJobDetails(form) {
        let formData = this.serializeForm(form);

        try {
            $.ajax({
                url: `/api/v1/jobs/${formData.id}`,
                type: 'PATCH',
                contentType: 'application/json',
                data: JSON.stringify(formData)
            }).done(() => {
                this.render();
                showMessage('Job has been successfully updated');
            }).fail((errorData) => {
                const message = `Can not build CVAT dashboard. Code: ${errorData.status}. ` +
                    `Message: ${errorData.responseText || errorData.statusText}`;
                showMessage(message);
            });
        } catch (exception) {
            showMessage(exception);
        }
    }

    _customDateFormatter(date) {
        let estimatedCompletionDate = (date === null ? null: new Date(date));

        return (estimatedCompletionDate === null ? null: `${estimatedCompletionDate.getFullYear()}-${("0" + (estimatedCompletionDate.getMonth() + 1)).slice(-2)}-${("0" + (estimatedCompletionDate.getDate())).slice(-2)}`);
    }

    _renderAvailableAssignees(job) {
        let availableAssignees = [];
        if (!job.assignee) {
            availableAssignees.push(`<option disabled="disabled" selected="selected" value=""></option>`);
        }
        for (let assignee of this._availableAssignees) {
            if (job.assignee !== null && job.assignee === assignee.id) {
                availableAssignees.push(`<option selected="selected" value="${assignee.id}">${assignee.name}</option>`);
            } else {
                availableAssignees.push(`<option value="${assignee.id}">${assignee.name}</option>`);
            }
        }

        return availableAssignees;
    }


    init(task) {
        this._task = task;
    }

    render(baseURL) {
        self = this;
        this._UI = $(`<div tid=${this._task.id} class="dashboardItem"> </div>`).append(
            $(`<center class="dashboardTitleWrapper">
                <label class="semiBold h1 selectable"> ${this._task.name} </label>
            </center>`),
        ).append(
            $(`<center class="dashboardTitleWrapper">
                <label class="regular selectable"> ${this._task.status} </label>
            </center>`),
        ).append(
            $('<div class="dashboardTaskIntro"> </div>').css({
                'background-image': `url("/api/v1/tasks/${this._task.id}/frames/0")`,
            }),
        );


        const buttonsContainer = $('<div class="dashboardButtonsUI"> </div>').appendTo(this._UI);
        $('<button class="regular dashboardButtonUI"> Dump Annotation </button>').on('click', (e) => {
            this._dump(e.target);
        }).appendTo(buttonsContainer);
        $('<button class="regular dashboardButtonUI"> Dump JSON </button>').on('click', (e) => {
            self._dumpJSON(e.target);
        }).appendTo(buttonsContainer);
        $('<button class="regular dashboardButtonUI"> Dump Timestamps </button>').on('click', (e) => {
            self._dumpTimestamps(e.target);
        }).appendTo(buttonsContainer);

        $('<button class="regular dashboardButtonUI"> Upload Annotation </button>').on('click', () => {
            userConfirm('The current annotation will be lost. Are you sure?', () => this._upload());
        }).appendTo(buttonsContainer);

        $('<button class="regular dashboardButtonUI"> Update Task </button>').on('click', () => {
            this._update();
        }).appendTo(buttonsContainer);

        $('<button class="regular dashboardButtonUI"> Delete Task </button>').on('click', () => {
            userConfirm('The task will be removed. Are you sure?', () => this._remove());
        }).appendTo(buttonsContainer);

        if (this._task.bugTracker) {
            $('<button class="regular dashboardButtonUI"> Open Bug Tracker </button>').on('click', () => {
                window.open.call(window, this._task.bugTracker);
            }).appendTo(buttonsContainer);
        }

        const jobsContainer = $(`<table class="dashboardJobList regular">`);
        for (let job of this._task.jobs) {
            let availableAssignees = self._renderAvailableAssignees(job),
                estimatedCompletionDate = self._customDateFormatter(job.estimated_completion_date);

            let jobContainer = $(`
                <tr class="job-block">
                    <form id="id-job-form-${job.id}"></form>
                    <td><input hidden name="id" value="${job.id}" form="id-job-form-${job.id}"></td>
                    <td><a href="${baseURL}?id=${job.id}">Job #${job.id}</a></td>
                    <td>
                        <select class="form-field job-form-field" name="assignee" form="id-job-form-${job.id}">
                            ${availableAssignees}
                        </select>
                    </td>
                    <td><input
                            form="id-job-form-${job.id}"
                            class="form-field job-form-field"
                            type="date"
                            name="estimated_completion_date"
                            value="${estimatedCompletionDate}">
                    </td>
                    <td><input
                            form="id-job-form-${job.id}"
                            class="form-field job-form-field"
                            type="number"
                            value="${job.progress}"
                            min="1" max="100" step="1"
                            name="progress"
                            placeholder="job progress">
                    </td>
                </tr>`);
            jobContainer.find('.job-form-field').on('change', (e) => {
                let el = $(e.currentTarget),
                    form = $(`#${el.attr('form')}`);
                self._updateJobDetails(form);
            });
            jobsContainer.append(jobContainer);
        }

        this._UI.append($(`
            <div class="dashboardJobsUI">
                <center class="dashboardTitleWrapper">
                    <label class="regular h1"> Jobs </label>
                </center>
            </div>
        `).append(jobsContainer));

        if (this._removed) {
            this._disable();
        }

        return this._UI;
    }
}


class DashboardView {
    constructor(metaData, taskData, availableAssignees) {
        this._dashboardList = taskData.results;
        this._maxUploadSize = metaData.max_upload_size;
        this._maxUploadCount = metaData.max_upload_count;
        this._baseURL = metaData.base_url;
        this._sharePath = metaData.share_path;
        this.availableAssignees = availableAssignees;
        this._params = {};

        this._setupList();
        this._setupTaskSearch();
        this._setupCreateDialog();
    }

    _setupList() {
        const dashboardList = $('#dashboardList');
        const dashboardPagination = $('#dashboardPagination');
        const baseURL = this._baseURL;

        const defaults = {
            totalPages: 1,
            visiblePages: 7,
            onPageClick: async (_, page) => {
                dashboardPagination.css({
                    visibility: 'hidden',
                });

                const overlay = showOverlay('Loading..');
                dashboardList.empty();

                let tasks = null;
                try {
                    tasks = await window.cvat.tasks.get(Object.assign({}, {
                        page,
                    }, this._params));
                } catch (exception) {
                    let { message } = exception;
                    if (exception instanceof window.cvat.exceptions.ServerError) {
                        message += ` Code: ${exception.code}`;
                    }
                    showMessage(message);
                    return;
                } finally {
                    overlay.remove();
                }

                let startPage = dashboardPagination.twbsPagination('getCurrentPage');
                if (!Number.isInteger(startPage)) {
                    startPage = 1;
                }

                dashboardPagination.twbsPagination('destroy');
                dashboardPagination.twbsPagination(Object.assign({}, defaults, {
                    totalPages: Math.max(1, Math.ceil(tasks.count / 10)),
                    startPage,
                    initiateStartPageClick: false,
                }));

                for (const task of tasks) {
                    const taskView = new TaskView(task, this.availableAssignees);
                    dashboardList.append(taskView.render(baseURL));
                }

                dashboardPagination.css({
                    'margin-left': (window.screen.width - dashboardPagination.width()) / 2,
                    visibility: 'visible',
                });

                window.dispatchEvent(new CustomEvent('dashboardReady', {
                    detail: tasks,
                }));
            },
        };

        dashboardPagination.twbsPagination(defaults);
    }

    _setupTaskSearch() {
        const dashboardPagination = $('#dashboardPagination');
        const searchInput = $('#dashboardSearchInput');
        const searchSubmit = $('#dashboardSearchSubmit');

        searchInput.on('keypress', (e) => {
            if (e.keyCode !== 13) {
                return;
            }

            this._params = {};
            const search = e.target.value.replace(/\s+/g, ' ').replace(/\s*:+\s*/g, ':').trim();
            for (const field of ['name', 'mode', 'owner', 'assignee', 'status', 'id']) {
                for (let param of search.split(/[\s]+and[\s]+|[\s]+AND[\s]+/)) {
                    if (param.includes(':')) {
                        param = param.split(':');
                        if (param[0] === field && param[1]) {
                            [, this._params[field]] = param;
                        }
                    }
                }
            }

            if ('id' in this._params) {
                this._params.id = +this._params.id;
            }

            if (!Object.keys(this._params).length) {
                this._params.search = search;
            }

            dashboardPagination.twbsPagination('show', 1);
        });

        searchSubmit.on('click', () => {
            const e = $.Event('keypress');
            e.keyCode = 13;
            searchInput.trigger(e);
        });
    }

    _setupCreateDialog() {
        function updateSelectedFiles() {
            switch (files.length) {
            case 0:
                filesLabel.text('No Files');
                break;
            case 1:
                filesLabel.text(typeof(files[0]) === 'string' ? files[0] : files[0].name);
                break;
            default:
                filesLabel.text(files.length + ' files');
            }
        }


        function validateName(name) {
            const math = name.match('[a-zA-Z0-9_]+');
            return math !== null;
        }

        function validateLabels(labels) {
            try {
                LabelsInfo.deserialize(labels);
                return true;
            } catch (error) {
                return false;
            }
        }

        function validateBugTracker(bugTracker) {
            return !bugTracker || !!bugTracker.match(/^http[s]?/);
        }

        function validateSegmentSize(segmentSize) {
            return (segmentSize >= 100 && segmentSize <= 50000);
        }

        function validateOverlapSize(overlapSize, segmentSize) {
            return (overlapSize >= 0 && overlapSize <= segmentSize - 1);
        }

        function validateStopFrame(stopFrame, startFrame) {
            return !customStopFrame.prop('checked') || stopFrame >= startFrame;
        }

        function requestCreatingStatus(tid, onUpdateStatus, onSuccess, onError) {
            function checkCallback() {
                $.get(`/api/v1/tasks/${tid}/status`).done((data) => {
                    if (['Queued', 'Started'].includes(data.state)) {
                        if (data.message !== '') {
                            onUpdateStatus(data.message);
                        }
                        setTimeout(checkCallback, 1000);
                    } else {
                        if (data.state === 'Finished') {
                            onSuccess();
                        }
                        else if (data.state === 'Failed') {
                            const message = `Can not create task. ${data.message}`;
                            onError(message);
                        } else {
                            const message = `Unknown state has been received: ${data.state}`;
                            onError(message);
                        }

                    }
                }).fail((errorData) => {
                    const message = `Can not check task status. Code: ${errorData.status}. ` +
                        `Message: ${errorData.responseText || errorData.statusText}`;
                    onError(message);
                });
            }

            setTimeout(checkCallback, 1000);
        }

        const dashboardCreateTaskButton = $('#dashboardCreateTaskButton');
        const createModal = $('#dashboardCreateModal');
        const nameInput = $('#dashboardNameInput');
        const labelsInput = $('#dashboardLabelsInput');
        const bugTrackerInput = $('#dashboardBugTrackerInput');
        const localSourceRadio = $('#dashboardLocalSource');
        const shareSourceRadio = $('#dashboardShareSource');
        const selectFiles = $('#dashboardSelectFiles');
        const filesLabel = $('#dashboardFilesLabel');
        const localFileSelector = $('#dashboardLocalFileSelector');
        const shareFileSelector = $('#dashboardShareBrowseModal');
        const shareBrowseTree = $('#dashboardShareBrowser');
        const cancelBrowseServer = $('#dashboardCancelBrowseServer');
        const submitBrowseServer = $('#dashboardSubmitBrowseServer');
        const zOrderBox = $('#dashboardZOrder');
        const segmentSizeInput = $('#dashboardSegmentSize');
        const customSegmentSize = $('#dashboardCustomSegment');
        const overlapSizeInput = $('#dashboardOverlap');
        const customOverlapSize = $('#dashboardCustomOverlap');
        const imageQualityInput = $('#dashboardImageQuality');
        const customCompressQuality = $('#dashboardCustomQuality');
        const startFrameInput = $('#dashboardStartFrame');
        const customStartFrame = $('#dashboardCustomStart');
        const stopFrameInput = $('#dashboardStopFrame');
        const customStopFrame = $('#dashboardCustomStop');
        const frameFilterInput = $('#dashboardFrameFilter');
        const customFrameFilter = $('#dashboardCustomFilter');

        const taskMessage = $('#dashboardCreateTaskMessage');
        const submitCreate = $('#dashboardSubmitTask');
        const cancelCreate = $('#dashboardCancelTask');

        let name = nameInput.prop('value');
        let labels = labelsInput.prop('value');
        let bugTrackerLink = bugTrackerInput.prop('value').trim();
        let source = 'local';
        let zOrder = false;
        let segmentSize = 5000;
        let overlapSize = 0;
        let compressQuality = 50;
        let startFrame = 0;
        let stopFrame = 0;
        let frameFilter = '';
        let files = [];

        function updateSelectedFiles() {
            switch (files.length) {
            case 0:
                filesLabel.text('No Files');
                break;
            case 1:
                filesLabel.text(typeof (files[0]) === 'string' ? files[0] : files[0].name);
                break;
            default:
                filesLabel.text(`${files.length} files`);
            }
        }


        function validateName() {
            const math = name.match('[a-zA-Z0-9_]+');
            return math !== null;
        }

        function validateLabels() {
            try {
                const result = LabelsInfo.deserialize(labels);
                return result.length;
            } catch (error) {
                return false;
            }
        }

        function validateBugTracker() {
            return !bugTrackerLink || !!bugTrackerLink.match(/^http[s]?/);
        }

        function validateSegmentSize() {
            return (segmentSize >= 100 && segmentSize <= 50000);
        }

        function validateOverlapSize() {
            return (overlapSize >= 0 && overlapSize <= segmentSize - 1);
        }

        dashboardCreateTaskButton.on('click', () => {
            $('#dashboardCreateModal').removeClass('hidden');
        });

        nameInput.on('change', (e) => {
            name = e.target.value;
        });

        bugTrackerInput.on('change', (e) => {
            bugTrackerLink = e.target.value.trim();
        });

        labelsInput.on('change', (e) => {
            labels = e.target.value;
        });

        localSourceRadio.on('click', () => {
            if (source === 'local') {
                return;
            }
            source = 'local';
            files = [];
            updateSelectedFiles();
        });

        shareSourceRadio.on('click', () => {
            if (source === 'share') {
                return;
            }
            source = 'share';
            files = [];
            updateSelectedFiles();
        });

        selectFiles.on('click', () => {
            if (source === 'local') {
                localFileSelector.click();
            } else {
                shareBrowseTree.jstree('refresh');
                shareFileSelector.removeClass('hidden');
                shareBrowseTree.jstree({
                    core: {
                        async data(obj, callback) {
                            const directory = obj.id === '#' ? '' : `${obj.id}/`;

                            let shareFiles = await window.cvat.server.share(directory);
                            shareFiles = Array.from(shareFiles, (element) => {
                                const shareFileInfo = {
                                    id: `${directory}${element.name}`,
                                    children: element.type === 'DIR',
                                    text: element.name,
                                    icon: element.type === 'DIR' ? 'jstree-folder' : 'jstree-file',
                                };

                                return shareFileInfo;
                            });

                            callback.call(this, shareFiles);
                        },
                    },
                    plugins: ['checkbox', 'sort'],
                });
            }
        });

        localFileSelector.on('change', (e) => {
            const localFiles = e.target.files;
            files = localFiles;
            updateSelectedFiles();
        });

        cancelBrowseServer.on('click', () => shareFileSelector.addClass('hidden'));
        submitBrowseServer.on('click', () => {
            if (!createModal.hasClass('hidden')) {
                files = Array.from(shareBrowseTree.jstree(true).get_selected());
                cancelBrowseServer.click();
                updateSelectedFiles();
            }
        });

        zOrderBox.on('click', (e) => {
            zOrder = e.target.checked;
        });

        customSegmentSize.on('change', (e) => segmentSizeInput.prop('disabled', !e.target.checked));
        customOverlapSize.on('change', (e) => overlapSizeInput.prop('disabled', !e.target.checked));
        customCompressQuality.on('change', (e) => imageQualityInput.prop('disabled', !e.target.checked));
        customStartFrame.on('change', (e) => startFrameInput.prop('disabled', !e.target.checked));
        customStopFrame.on('change', (e) => stopFrameInput.prop('disabled', !e.target.checked));
        customFrameFilter.on('change', (e) => frameFilterInput.prop('disabled', !e.target.checked));

        segmentSizeInput.on('change', () => {
            const value = Math.clamp(
                +segmentSizeInput.prop('value'),
                +segmentSizeInput.prop('min'),
                +segmentSizeInput.prop('max'),
            );

            segmentSizeInput.prop('value', value);
            segmentSize = value;
        });

        overlapSizeInput.on('change', () => {
            const value = Math.clamp(
                +overlapSizeInput.prop('value'),
                +overlapSizeInput.prop('min'),
                +overlapSizeInput.prop('max'),
            );

            overlapSizeInput.prop('value', value);
            overlapSize = value;
        });

        imageQualityInput.on('change', () => {
            const value = Math.clamp(
                +imageQualityInput.prop('value'),
                +imageQualityInput.prop('min'),
                +imageQualityInput.prop('max'),
            );

            imageQualityInput.prop('value', value);
            compressQuality = value;
        });

        startFrameInput.on('change', function() {
            let value = Math.max(
                +startFrameInput.prop('value'),
                +startFrameInput.prop('min')
            );

            startFrameInput.prop('value', value);
            startFrame = value;
        });
        stopFrameInput.on('change', function() {
            let value = Math.max(
                +stopFrameInput.prop('value'),
                +stopFrameInput.prop('min')
            );

            stopFrameInput.prop('value', value);
            stopFrame = value;
        });
        frameFilterInput.on('change', function() {
            frameFilter = frameFilterInput.prop('value');
        });

        submitCreate.on('click', async () => {
            if (!validateName(name)) {
                taskMessage.css('color', 'red');
                taskMessage.text('Bad task name');
                return;
            }

            if (!validateLabels()) {
                taskMessage.css('color', 'red');
                taskMessage.text('Bad labels specification');
                return;
            }

            if (!validateSegmentSize()) {
                taskMessage.css('color', 'red');
                taskMessage.text('Segment size out of range');
                return;
            }

            if (!validateBugTracker()) {
                taskMessage.css('color', 'red');
                taskMessage.text('Bad bag tracker link');
                return;
            }

            if (!validateOverlapSize()) {
                taskMessage.css('color', 'red');
                taskMessage.text('Overlap size must be positive and not more then segment size');
                return;
            }

            if (!validateStopFrame(stopFrame, startFrame)) {
                taskMessage.css('color', 'red');
                taskMessage.text('Stop frame must be greater than or equal to start frame');
                return;
            }

            if (files.length <= 0) {
                taskMessage.css('color', 'red');
                taskMessage.text('No files specified for the task');
                return;
            }

            if (files.length > window.maxUploadCount && source === 'local') {
                taskMessage.css('color', 'red');
                taskMessage.text('Too many files were specified. Please use share to upload');
                return;
            }

            if (source === 'local') {
                let commonSize = 0;

                for (const file of files) {
                    commonSize += file.size;
                }

                if (commonSize > window.maxUploadSize) {
                    taskMessage.css('color', 'red');
                    taskMessage.text('Too big files size. Please use share to upload');
                    return;
                }
            }

            const description = {
                name,
                labels: LabelsInfo.deserialize(labels),
                image_quality: compressQuality,
                z_order: zOrder,
                bug_tracker: bugTrackerLink,
            };

            if (customSegmentSize.prop('checked')) {
                description.segment_size = segmentSize;
            }

            if (customOverlapSize.prop('checked')) {
                description.overlap = overlapSize;
            }
            if (customStartFrame.prop('checked')) {
                description.start_frame = startFrame;
            }
            if (customStopFrame.prop('checked')) {
                description.stop_frame = stopFrame;
            }
            if (customFrameFilter.prop('checked')) {
                description.frame_filter = frameFilter;
            }

            try {
                let task = new window.cvat.classes.Task(description);
                if (source === 'local') {
                    task.clientFiles = Array.from(files);
                } else {
                    task.serverFiles = Array.from(files);
                }
                submitCreate.attr('disabled', true);
                cancelCreate.attr('disabled', true);
                task = await task.save((message) => {
                    taskMessage.css('color', 'green');
                    taskMessage.text(message);
                });
                window.location.reload();
            } catch (exception) {
                let { message } = exception;
                if (exception instanceof window.cvat.exceptions.ServerError) {
                    message += ` Code: ${exception.code}`;
                }
                taskMessage.css('color', 'red');
                taskMessage.text(message);
                submitCreate.attr('disabled', false);
                cancelCreate.attr('disabled', false);
            }
        });

        cancelCreate.on('click', () => createModal.addClass('hidden'));
    }
}


DashboardView.registerDecorator = (action, decorator) => {
    DashboardView._decorators = DashboardView._decorators || {};
    DashboardView._decorators[action] = DashboardView._decorators[action] || [];
    DashboardView._decorators[action].push(decorator);
};


// DASHBOARD ENTRYPOINT
window.addEventListener('DOMContentLoaded', () => {
    window.cvat.config.backendAPI = `${window.location.origin}/api/v1`;
    $.when(
        // TODO: Use REST API in order to get meta
        $.get('/dashboard/meta'),
        $.get(`/api/v1/tasks${window.location.search}`),
        $.get(`/api/v1/users/availableAssignees`),
    ).then((metaData, taskData, availableAssignees) => {
        try {
            new DashboardView(metaData[0], taskData[0], availableAssignees[0]);
        }
        catch(exception) {
            $('#content').empty();
            const message = `Can not build CVAT dashboard. Exception: ${exception}.`;
            showMessage(message);
        }
    }).fail((errorData) => {
        $('#content').empty();
        const message = `Can not build CVAT dashboard. Code: ${errorData.status}. `
            + `Message: ${errorData.responseText || errorData.statusText}`;
        showMessage(message);
    }).always(() => {
        $('#loadingOverlay').remove();
    });
});
