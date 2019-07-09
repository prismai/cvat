/*
* Copyright (C) 2018 Intel Corporation
* SPDX-License-Identifier: MIT
*/

/* global
    require:false
*/

(() => {
    const serverProxy = require('./server-proxy');
    const ObjectState = require('./object-state');

    class Annotation {
        constructor(data, clientID, injection) {
            this.clientID = clientID;
            this.serverID = data.id;
            this.labelID = data.label_id;
            this.frame = data.frame;
            this.attributes = data.attributes.reduce((attributeAccumulator, attr) => {
                attributeAccumulator[attr.spec_id] = attr.value;
                return attributeAccumulator;
            }, {});
            this.taskLabels = injection.labels;
        }
    }

    class Shape extends Annotation {
        constructor(data, clientID, color, injection) {
            super(data, clientID, injection);
            this.points = data.points;
            this.occluded = data.occluded;
            this.zOrder = data.z_order;
            this.group = data.group;
            this.color = color;
            this.shape = null;
        }

        toJSON() {
            return {
                occluded: this.occluded,
                z_order: this.zOrder,
                points: [...this.points],
                attributes: Object.keys(this.attributes).reduce((attributeAccumulator, attrId) => {
                    attributeAccumulator.push({
                        spec_id: attrId,
                        value: this.attributes[attrId],
                    });

                    return attributeAccumulator;
                }, []),
                id: this.serverID,
                frame: this.frame,
                label_id: this.labelID,
                group: this.group,
            };
        }

        get(frame) {
            if (frame !== this.frame) {
                throw new window.cvat.exceptions.ScriptingError(
                    'Got frame is not equal to the frame of the shape',
                );
            }

            return {
                type: window.cvat.enums.ObjectType.SHAPE,
                shape: this.shape,
                clientID: this.clientID,
                occluded: this.occluded,
                zOrder: this.zOrder,
                points: [...this.points],
                attributes: Object.assign({}, this.attributes),
                label: this.taskLabels[this.labelID],
                group: this.group,
            };
        }
    }

    class Track extends Annotation {
        constructor(data, clientID, color, injection) {
            super(data, clientID, injection);
            this.shapes = data.shapes.reduce((shapeAccumulator, value) => {
                shapeAccumulator[value.frame] = {
                    serverID: value.id,
                    occluded: value.occluded,
                    zOrder: value.z_order,
                    points: value.points,
                    id: value.id,
                    frame: value.frame,
                    outside: value.outside,
                    attributes: value.attributes.reduce((attributeAccumulator, attr) => {
                        attributeAccumulator[attr.spec_id] = attr.value;
                        return attributeAccumulator;
                    }, {}),
                };

                return shapeAccumulator;
            }, {});

            this.group = data.group;
            this.attributes = data.attributes.reduce((attributeAccumulator, attr) => {
                attributeAccumulator[attr.spec_id] = attr.value;
                return attributeAccumulator;
            }, {});
            this.color = color;
            this.shape = null;
        }

        toJSON() {
            return {
                occluded: this.occluded,
                z_order: this.zOrder,
                points: [...this.points],
                attributes: Object.keys(this.attributes).reduce((attributeAccumulator, attrId) => {
                    attributeAccumulator.push({
                        spec_id: attrId,
                        value: this.attributes[attrId],
                    });

                    return attributeAccumulator;
                }, []),

                id: this.serverID,
                frame: this.frame,
                label_id: this.labelID,
                group: this.group,
                shapes: Object.keys(this.shapes).reduce((shapesAccumulator, frame) => {
                    shapesAccumulator.push({
                        type: this.type,
                        occluded: this.shapes[frame].occluded,
                        z_order: this.shapes[frame].zOrder,
                        points: [...this.shapes[frame].points],
                        outside: [...this.shapes[frame].outside],
                        attributes: Object.keys(...this.shapes[frame].attributes)
                            .reduce((attributeAccumulator, attrId) => {
                                attributeAccumulator.push({
                                    spec_id: attrId,
                                    value: this.shapes[frame].attributes[attrId],
                                });

                                return attributeAccumulator;
                            }, []),
                        id: this.shapes[frame].serverID,
                        frame: +frame,
                    });

                    return shapesAccumulator;
                }, []),
            };
        }

        get(targetFrame) {
            return Object.assign(
                {}, this.getPosition(targetFrame),
                {
                    attributes: this.getAttributes(targetFrame),
                    label: this.taskLabels[this.labelID],
                    group: this.group,
                    type: window.cvat.enums.ObjectType.TRACK,
                    shape: this.shape,
                    clientID: this.clientID,
                },
            );
        }

        neighborsFrames(targetFrame) {
            const frames = Object.keys(this.shapes).map(frame => +frame);
            let lDiff = Number.MAX_SAFE_INTEGER;
            let rDiff = Number.MAX_SAFE_INTEGER;

            for (const frame of frames) {
                const diff = Math.abs(targetFrame - frame);
                if (frame <= targetFrame && diff < lDiff) {
                    lDiff = diff;
                } else if (diff < rDiff) {
                    rDiff = diff;
                }
            }

            const leftFrame = lDiff === Number.MAX_SAFE_INTEGER ? null : targetFrame - lDiff;
            const rightFrame = rDiff === Number.MAX_SAFE_INTEGER ? null : targetFrame + rDiff;

            return {
                leftFrame,
                rightFrame,
            };
        }

        getAttributes(targetFrame) {
            const result = {};

            // First of all copy all unmutable attributes
            for (const attrID in this.attributes) {
                if (Object.prototype.hasOwnProperty.call(this.attributes, attrID)) {
                    result[attrID] = this.attributes[attrID];
                }
            }

            // Secondly get latest mutable attributes up to target frame
            const frames = Object.keys(this.shapes).sort((a, b) => +a - +b);
            for (const frame of frames) {
                if (frame <= targetFrame) {
                    const { attributes } = this.shapes[frame];

                    for (const attrID in attributes) {
                        if (Object.prototype.hasOwnProperty.call(attributes, attrID)) {
                            result[attrID] = attributes[attrID];
                        }
                    }
                }
            }

            // Finally fill up remained attributes if they exist
            const labelAttributes = this.taskLabels[this.labelID].attributes;
            const defValuesByID = labelAttributes.reduce((accumulator, attr) => {
                accumulator[attr.id] = attr.defaultValue;
                return accumulator;
            }, {});

            for (const attrID of Object.keys(defValuesByID)) {
                if (!(attrID in result)) {
                    result[attrID] = defValuesByID[attrID];
                }
            }

            return result;
        }

        getPosition(targetFrame) {
            const {
                leftFrame,
                rightFrame,
            } = this.neighborsFrames(targetFrame);

            const rightPosition = Number.isInteger(rightFrame) ? this.shapes[rightFrame] : null;
            const leftPosition = Number.isInteger(leftFrame) ? this.shapes[leftFrame] : null;

            if (leftPosition && leftFrame === targetFrame) {
                return {
                    points: [...leftPosition.points],
                    occluded: leftPosition.occluded,
                    outside: leftPosition.outside,
                    zOrder: leftPosition.zOrder,
                };
            }

            if (rightPosition && leftPosition) {
                return this.interpolatePosition(
                    leftPosition,
                    rightPosition,
                    targetFrame,
                );
            }

            if (rightPosition) {
                return {
                    points: [...rightPosition.points],
                    occluded: rightPosition.occluded,
                    outside: true,
                    zOrder: 0,
                };
            }

            if (leftPosition) {
                return {
                    points: [...leftPosition.points],
                    occluded: leftPosition.occluded,
                    outside: leftPosition.outside,
                    zOrder: 0,
                };
            }

            throw new window.cvat.exceptions.ScriptingError(
                `No one neightbour frame found for the track with client ID: "${this.id}"`,
            );
        }
    }

    class Tag extends Annotation {
        constructor(data, clientID, injection) {
            super(data, clientID, injection);
        }

        toJSON() {
            // TODO: Tags support
            return {};
        }

        get(frame) {
            if (frame !== this.frame) {
                throw new window.cvat.exceptions.ScriptingError(
                    'Got frame is not equal to the frame of the shape',
                );
            }
        }
    }

    class RectangleShape extends Shape {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.RECTANGLE;
        }
    }

    class PolyShape extends Shape {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
        }
    }

    class PolygonShape extends PolyShape {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POLYGON;
        }
    }

    class PolylineShape extends PolyShape {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POLYLINE;
        }
    }

    class PointsShape extends PolyShape {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POINTS;
        }
    }

    class RectangleTrack extends Track {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.RECTANGLE;
        }

        interpolatePosition(leftPosition, rightPosition, targetFrame) {
            const offset = (targetFrame - leftPosition.frame) / (
                rightPosition.frame - leftPosition.frame);
            const positionOffset = [
                rightPosition.points[0] - leftPosition.points[0],
                rightPosition.points[1] - leftPosition.points[1],
                rightPosition.points[2] - leftPosition.points[2],
                rightPosition.points[3] - leftPosition.points[3],
            ];

            return { // xtl, ytl, xbr, ybr
                points: [
                    leftPosition.points[0] + positionOffset[0] * offset,
                    leftPosition.points[1] + positionOffset[1] * offset,
                    leftPosition.points[2] + positionOffset[2] * offset,
                    leftPosition.points[3] + positionOffset[3] * offset,
                ],
                occluded: leftPosition.occluded,
                outside: leftPosition.outside,
                zOrder: leftPosition.zOrder,
            };
        }
    }

    class PolyTrack extends Track {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
        }

        interpolatePosition(leftPosition, rightPosition, targetFrame) {
            function findBox(points) {
                let xmin = Number.MAX_SAFE_INTEGER;
                let ymin = Number.MAX_SAFE_INTEGER;
                let xmax = Number.MIN_SAFE_INTEGER;
                let ymax = Number.MIN_SAFE_INTEGER;

                for (let i = 0; i < points.length; i += 2) {
                    if (points[i] < xmin) xmin = points[i];
                    if (points[i + 1] < ymin) ymin = points[i + 1];
                    if (points[i] > xmax) xmax = points[i];
                    if (points[i + 1] > ymax) ymax = points[i + 1];
                }

                return {
                    xmin,
                    ymin,
                    xmax,
                    ymax,
                };
            }

            function normalize(points, box) {
                const normalized = [];
                const width = box.xmax - box.xmin;
                const height = box.ymax - box.ymin;

                for (let i = 0; i < points.length; i += 2) {
                    normalized.push(
                        (points[i] - box.xmin) / width,
                        (points[i + 1] - box.ymin) / height,
                    );
                }

                return normalized;
            }

            function denormalize(points, box) {
                const denormalized = [];
                const width = box.xmax - box.xmin;
                const height = box.ymax - box.ymin;

                for (let i = 0; i < points.length; i += 2) {
                    denormalized.push(
                        points[i] * width + box.xmin,
                        points[i + 1] * height + box.ymin,
                    );
                }

                return denormalized;
            }

            function toPoints(array) {
                const points = [];
                for (let i = 0; i < array.length; i += 2) {
                    points.push({
                        x: array[i],
                        y: array[i + 1],
                    });
                }

                return points;
            }

            function toArray(points) {
                const array = [];
                for (const point of points) {
                    array.push(point.x, point.y);
                }

                return array;
            }

            function computeDistances(source, target) {
                const distances = {};
                for (let i = 0; i < source.length; i++) {
                    distances[i] = distances[i] || {};
                    for (let j = 0; j < target.length; j++) {
                        const dx = source[i].x - target[j].x;
                        const dy = source[i].y - target[j].y;

                        distances[i][j] = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
                    }
                }

                return distances;
            }

            function truncateByThreshold(mapping, threshold) {
                for (const key of Object.keys(mapping)) {
                    if (mapping[key].distance > threshold) {
                        delete mapping[key];
                    }
                }
            }

            // https://en.wikipedia.org/wiki/Stable_marriage_problem
            // TODO: One of important part of the algorithm is to correctly match
            // "corner" points. Thus it is possible for each of such point calculate
            // a descriptor (d) and use (x, y, d) to calculate the distance. One more
            // idea is to be sure that order or matched points is preserved. For example,
            // if p1 matches q1 and p2 matches q2 and between p1 and p2 we don't have any
            // points thus we should not have points between q1 and q2 as well.
            function stableMarriageProblem(men, women, distances) {
                const menPreferences = {};
                for (const man of men) {
                    menPreferences[man] = women.concat()
                        .sort((w1, w2) => distances[man][w1] - distances[man][w2]);
                }

                // Start alghoritm with max N^2 complexity
                const womenMaybe = {}; // id woman:id man,distance
                const menBusy = {}; // id man:boolean
                let prefIndex = 0;

                // While there is at least one free man
                while (Object.values(menBusy).length !== men.length) {
                    // Every man makes offer to the best woman
                    for (const man of men) {
                        // The man have already found a woman
                        if (menBusy[man]) {
                            continue;
                        }

                        const woman = menPreferences[man][prefIndex];
                        const distance = distances[man][woman];

                        // A women chooses the best offer and says "maybe"
                        if (woman in womenMaybe && womenMaybe[woman].distance > distance) {
                            // A woman got better offer
                            const prevChoice = womenMaybe[woman].value;
                            delete womenMaybe[woman];
                            delete menBusy[prevChoice];
                        }

                        if (!(woman in womenMaybe)) {
                            womenMaybe[woman] = {
                                value: man,
                                distance,
                            };

                            menBusy[man] = true;
                        }
                    }

                    prefIndex++;
                }

                const result = {};
                for (const woman of Object.keys(womenMaybe)) {
                    result[womenMaybe[woman].value] = {
                        value: woman,
                        distance: womenMaybe[woman].distance,
                    };
                }

                return result;
            }

            function getMapping(source, target) {
                function sumEdges(points) {
                    let result = 0;
                    for (let i = 1; i < points.length; i += 2) {
                        const distance = Math.sqrt(Math.pow(points[i].x - points[i - 1].x, 2)
                            + Math.pow(points[i].y - points[i - 1].y, 2));
                        result += distance;
                    }

                    // Corner case when work with one point
                    // Mapping in this case can't be wrong
                    if (!result) {
                        return Number.MAX_SAFE_INTEGER;
                    }

                    return result;
                }

                function computeDeviation(points, average) {
                    let result = 0;
                    for (let i = 1; i < points.length; i += 2) {
                        const distance = Math.sqrt(Math.pow(points[i].x - points[i - 1].x, 2)
                            + Math.pow(points[i].y - points[i - 1].y, 2));
                        result += Math.pow(distance - average, 2);
                    }

                    return result;
                }

                const processedSource = [];
                const processedTarget = [];

                const distances = computeDistances(source, target);
                const mapping = stableMarriageProblem(Array.from(source.keys()),
                    Array.from(target.keys()), distances);

                const average = (sumEdges(target)
                    + sumEdges(source)) / (target.length + source.length);
                const meanSquareDeviation = Math.sqrt((computeDeviation(source, average)
                    + computeDeviation(target, average)) / (source.length + target.length));
                const threshold = average + 3 * meanSquareDeviation; // 3 sigma rule
                truncateByThreshold(mapping, threshold);
                for (const key of Object.keys(mapping)) {
                    mapping[key] = mapping[key].value;
                }

                // const receivingOrder = Object.keys(mapping).map(x => +x).sort((a,b) => a - b);
                const receivingOrder = this.appendMapping(mapping, source, target);

                for (const pointIdx of receivingOrder) {
                    processedSource.push(source[pointIdx]);
                    processedTarget.push(target[mapping[pointIdx]]);
                }

                return [processedSource, processedTarget];
            }

            let leftBox = findBox(leftPosition.points);
            let rightBox = findBox(rightPosition.points);

            // Sometimes (if shape has one point or shape is line),
            // We can get box with zero area
            // Next computation will be with NaN in this case
            // We have to prevent it
            const delta = 1;
            if (leftBox.xmax - leftBox.xmin < delta || rightBox.ymax - rightBox.ymin < delta) {
                leftBox = {
                    xmin: 0,
                    xmax: 1024, // TODO: Get actual image size
                    ymin: 0,
                    ymax: 768,
                };

                rightBox = leftBox;
            }

            const leftPoints = toPoints(normalize(leftPosition.points, leftBox));
            const rightPoints = toPoints(normalize(rightPosition.points, rightBox));

            let newLeftPoints = [];
            let newRightPoints = [];
            if (leftPoints.length > rightPoints.length) {
                const [
                    processedRight,
                    processedLeft,
                ] = getMapping.call(this, rightPoints, leftPoints);
                newLeftPoints = processedLeft;
                newRightPoints = processedRight;
            } else {
                const [
                    processedLeft,
                    processedRight,
                ] = getMapping.call(this, leftPoints, rightPoints);
                newLeftPoints = processedLeft;
                newRightPoints = processedRight;
            }

            const absoluteLeftPoints = denormalize(toArray(newLeftPoints), leftBox);
            const absoluteRightPoints = denormalize(toArray(newRightPoints), rightBox);

            const offset = (targetFrame - leftPosition.frame) / (
                rightPosition.frame - leftPosition.frame);

            const interpolation = [];
            for (let i = 0; i < absoluteLeftPoints.length; i++) {
                interpolation.push(absoluteLeftPoints[i] + (
                    absoluteRightPoints[i] - absoluteLeftPoints[i]) * offset);
            }

            return {
                points: interpolation,
                occluded: leftPosition.occluded,
                outside: leftPosition.outside,
                zOrder: leftPosition.zOrder,
            };
        }

        // mapping is predicted order of points sourse_idx:target_idx
        // some points from source and target can absent in mapping
        // source, target - arrays of points. Target array size >= sourse array size
        appendMapping(mapping, source, target) {
            const targetMatched = Object.values(mapping).map(x => +x);
            const sourceMatched = Object.keys(mapping).map(x => +x);
            const orderForReceive = [];

            function findNeighbors(point) {
                let prev = point;
                let next = point;

                if (!targetMatched.length) {
                    // Prevent infinity loop
                    throw window.cvat.exceptions.ScriptingError('Interpolation mapping is empty');
                }

                while (!targetMatched.includes(prev)) {
                    prev--;
                    if (prev < 0) {
                        prev = target.length - 1;
                    }
                }

                while (!targetMatched.includes(next)) {
                    next++;
                    if (next >= target.length) {
                        next = 0;
                    }
                }

                return [prev, next];
            }

            function computeOffset(point, prev, next) {
                const pathPoints = [];

                while (prev !== next) {
                    pathPoints.push(target[prev]);
                    prev++;
                    if (prev >= target.length) {
                        prev = 0;
                    }
                }
                pathPoints.push(target[next]);

                let curveLength = 0;
                let offset = 0;
                let iCrossed = false;
                for (let k = 1; k < pathPoints.length; k++) {
                    const p1 = pathPoints[k];
                    const p2 = pathPoints[k - 1];
                    const distance = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

                    if (!iCrossed) {
                        offset += distance;
                    }
                    curveLength += distance;
                    if (target[point] === pathPoints[k]) {
                        iCrossed = true;
                    }
                }

                if (!curveLength) {
                    return 0;
                }

                return offset / curveLength;
            }

            for (let i = 0; i < target.length; i++) {
                const index = targetMatched.indexOf(i);
                if (index === -1) {
                    // We have to find a neighbours which have been mapped
                    const [prev, next] = findNeighbors(i);

                    // Now compute edge offset
                    const offset = computeOffset(i, prev, next);

                    // Get point between two neighbors points
                    const prevPoint = target[prev];
                    const nextPoint = target[next];
                    const autoPoint = {
                        x: prevPoint.x + (nextPoint.x - prevPoint.x) * offset,
                        y: prevPoint.y + (nextPoint.y - prevPoint.y) * offset,
                    };

                    // Put it into matched
                    source.push(autoPoint);
                    mapping[source.length - 1] = i;
                    orderForReceive.push(source.length - 1);
                } else {
                    orderForReceive.push(sourceMatched[index]);
                }
            }

            return orderForReceive;
        }
    }

    class PolygonTrack extends PolyTrack {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POLYGON;
        }
    }

    class PolylineTrack extends PolyTrack {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POLYLINE;
        }

        appendMapping(leftRightMapping, leftPoints, rightPoints) {
            // TODO after checking how it works with polygons
        }
    }

    class PointsTrack extends PolyTrack {
        constructor(data, clientID, color, injection) {
            super(data, clientID, color, injection);
            this.shape = window.cvat.enums.ObjectShape.POINTS;
        }
    }

    const colors = [
        '#0066FF', '#AF593E', '#01A368', '#FF861F', '#ED0A3F', '#FF3F34', '#76D7EA',
        '#8359A3', '#FBE870', '#C5E17A', '#03BB85', '#FFDF00', '#8B8680', '#0A6B0D',
        '#8FD8D8', '#A36F40', '#F653A6', '#CA3435', '#FFCBA4', '#FF99CC', '#FA9D5A',
        '#FFAE42', '#A78B00', '#788193', '#514E49', '#1164B4', '#F4FA9F', '#FED8B1',
        '#C32148', '#01796F', '#E90067', '#FF91A4', '#404E5A', '#6CDAE7', '#FFC1CC',
        '#006A93', '#867200', '#E2B631', '#6EEB6E', '#FFC800', '#CC99BA', '#FF007C',
        '#BC6CAC', '#DCCCD7', '#EBE1C2', '#A6AAAE', '#B99685', '#0086A7', '#5E4330',
        '#C8A2C8', '#708EB3', '#BC8777', '#B2592D', '#497E48', '#6A2963', '#E6335F',
        '#00755E', '#B5A895', '#0048ba', '#EED9C4', '#C88A65', '#FF6E4A', '#87421F',
        '#B2BEB5', '#926F5B', '#00B9FB', '#6456B7', '#DB5079', '#C62D42', '#FA9C44',
        '#DA8A67', '#FD7C6E', '#93CCEA', '#FCF686', '#503E32', '#FF5470', '#9DE093',
        '#FF7A00', '#4F69C6', '#A50B5E', '#F0E68C', '#FDFF00', '#F091A9', '#FFFF66',
        '#6F9940', '#FC74FD', '#652DC1', '#D6AEDD', '#EE34D2', '#BB3385', '#6B3FA0',
        '#33CC99', '#FFDB00', '#87FF2A', '#6EEB6E', '#FFC800', '#CC99BA', '#7A89B8',
        '#006A93', '#867200', '#E2B631', '#D9D6CF',
    ];


    class Collection {
        constructor(labels) {
            this.labels = labels.reduce((labelAccumulator, label) => {
                labelAccumulator[label.id] = label;
                return labelAccumulator;
            }, {});

            this.empty();
        }

        import(data) {
            this.empty();
            const injection = {
                labels: this.labels,
            };

            function shapeFactory(shapeData, clientID) {
                const { type } = shapeData;
                const color = colors[clientID % colors.length];
                let shapeModel = null;
                switch (type) {
                case 'rectangle':
                    shapeModel = new RectangleShape(shapeData, clientID, color, injection);
                    break;
                case 'polygon':
                    shapeModel = new PolygonShape(shapeData, clientID, color, injection);
                    break;
                case 'polyline':
                    shapeModel = new PolylineShape(shapeData, clientID, color, injection);
                    break;
                case 'points':
                    shapeModel = new PointsShape(shapeData, clientID, color, injection);
                    break;
                default:
                    throw new window.cvat.exceptions.DataError(
                        `An unexpected type of shape "${type}"`,
                    );
                }

                return shapeModel;
            }


            function trackFactory(trackData, clientID) {
                if (trackData.shapes.length) {
                    const { type } = trackData.shapes[0];
                    const color = colors[clientID % colors.length];


                    let trackModel = null;
                    switch (type) {
                    case 'rectangle':
                        trackModel = new RectangleTrack(trackData, clientID, color, injection);
                        break;
                    case 'polygon':
                        trackModel = new PolygonTrack(trackData, clientID, color, injection);
                        break;
                    case 'polyline':
                        trackModel = new PolylineTrack(trackData, clientID, color, injection);
                        break;
                    case 'points':
                        trackModel = new PointsTrack(trackData, clientID, color, injection);
                        break;
                    default:
                        throw new window.cvat.exceptions.DataError(
                            `An unexpected type of track "${type}"`,
                        );
                    }

                    return trackModel;
                }

                console.warn('The track without any shapes had been found. It was ignored.');
                return null;
            }

            for (const tag of data.tags) {
                const clientID = ++this.count;
                const tagModel = new Tag(tag, clientID, injection);
                this.tags[tagModel.frame] = this.tags[tagModel.frame] || [];
                this.tags[tagModel.frame].push(tagModel);
                this.objects[clientID] = tagModel;
            }

            for (const shape of data.shapes) {
                const clientID = ++this.count;
                const shapeModel = shapeFactory(shape, clientID);
                this.shapes[shapeModel.frame] = this.shapes[shapeModel.frame] || [];
                this.shapes[shapeModel.frame].push(shapeModel);
                this.objects[clientID] = shapeModel;
            }

            for (const track of data.tracks) {
                const clientID = ++this.count;
                const trackModel = trackFactory(track, clientID);
                // The function can return null if track doesn't have any shapes.
                // In this case a corresponded message will be sent to the console
                if (trackModel) {
                    this.tracks.push(trackModel);
                    this.objects[clientID] = trackModel;
                }
            }
        }

        export() {
            const data = {
                tracks: Object.values(this.tracks).reduce((accumulator, value) => {
                    accumulator.push(...value);
                    return accumulator;
                }, []).map(track => track.toJSON()),
                shapes: this.shapes.map(shape => shape.toJSON()),
                tags: this.shapes.map(tag => tag.toJSON()),
            };

            return data;
        }

        empty() {
            this.shapes = {};
            this.tags = {};
            this.tracks = [];
            this.objects = {}; // by id
            this.count = 0;
        }

        get(frame) {
            const { tracks } = this;
            const shapes = this.shapes[frame] || [];
            const tags = this.tags[frame] || [];

            const states = tracks.map(track => track.get(frame))
                .concat(shapes.map(shape => shape.get(frame)))
                .concat(tags.map(tag => tag.get(frame)));

            // filtering here

            const objectStates = [];
            for (const state of states) {
                const objectState = new ObjectState(state);
                objectStates.push(objectState);
            }

            return objectStates;
        }
    }

    const jobCache = {};
    const taskCache = {};

    async function getJobAnnotations(job, frame, filter) {
        if (!(job.id in jobCache)) {
            const rawAnnotations = await serverProxy.annotations.getJobAnnotations(job.id);
            jobCache[job.id] = new Collection(job.task.labels);
            jobCache[job.id].import(rawAnnotations);
        }

        return jobCache[job.id].get(frame, filter);
    }

    async function getTaskAnnotations(task, frame, filter) {
        if (!(task.id in jobCache)) {
            const rawAnnotations = await serverProxy.annotations.getTaskAnnotations(task.id);
            taskCache[task.id] = new Collection(task.labels);
            taskCache[task.id].import(rawAnnotations);
        }

        return taskCache[task.id].get(frame, filter);
    }

    module.exports = {
        getJobAnnotations,
        getTaskAnnotations,
    };
})();
