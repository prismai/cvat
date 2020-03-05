format_spec = {
    "name": "Prism Virtual Camera",
    "dumpers": [
        {
            "display_name": "{name} {format} {version}",
            "format": "JSON",
            "version": "1.0",
            "handler": "dump"
        },
    ],
    "loaders": [
        {
            "display_name": "{name} {format} {version}",
            "format": "JSON",
            "version": "1.0",
            "handler": "load"
        },
    ],
}


def dump(file_object, annotations):
    """
    Prism.ai virtual camera json annotations dumper.

    :param file_object: file object to write result to.
    :type file_object: file.
    :param annotations: task annotations object.
    :type annotations: cvat.apps.annotation.Annotation.
    """

    # local imports because dumpers loader mechanism clean builtins functions include import
    import json
    from cvat.apps.engine.services import (
        get_pts_times,
        get_source_path,
    )

    data = {}
    pts_times = get_pts_times(video_file=get_source_path(task_id=annotations.meta["task"]["id"],
                                                         source=annotations.meta["source"]))
    idx = 0  # track index

    for track in annotations.tracks:
        boxes = {}
        for shape in track.shapes:
            if shape.type == "rectangle":  # dump only boxes
                boxes.update({
                    shape.frame: {
                        # ugly conversions according to old xml to json code
                        "xtl": round(float("{:.2f}".format(shape.points[0]))),
                        "ytl": round(float("{:.2f}".format(shape.points[1]))),
                        "xbr": round(float("{:.2f}".format(shape.points[2]))),
                        "ybr": round(float("{:.2f}".format(shape.points[3]))),
                        "occluded": int(shape.occluded),
                        "outside": int(shape.outside),
                        "time_ms": pts_times[shape.frame],
                    }
                })
        # do not write track without rectangle shapes
        if boxes.keys():
            data.update({
                str(idx): {
                    "label": track.label,
                    "boxes": boxes,
                }
            })
            idx += 1

    file_object.write(json.dumps(data).encode())
    file_object.flush()


def load(file_object, annotations):
    import json
    data = json.loads(open(file_object.name).read())
    for track_id, track_data in data.items():
        shapes = []
        for frame, box in track_data['boxes'].items():
            shape = annotations.TrackedShape(
                type="rectangle",
                points=[box['xtl'], box['ytl'], box['xbr'], box['ybr']],
                occluded=box['occluded'],
                attributes=[],
                outside=box['outside'],
                frame=frame,
                keyframe=1,
            )
            shapes.append(shape)
        track = annotations.Track(
            label=track_data['label'],
            group=track_id,
            shapes=shapes,
        )
        annotations.add_track(track)
