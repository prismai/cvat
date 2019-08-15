import json
import os

from django.conf import settings

from cvat.apps.engine.services import get_pts_times


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
    "loaders": [],
}


def dump(file_object, annotations):
    """
    Prism.ai virtual camera json annotations dumper.

    :param file_object: file object to write result to.
    :type file_object: file.
    :param annotations: task annotations object.
    :type annotations: cvat.apps.annotation.Annotation.
    """

    data = {}
    pts_times = get_pts_times(os.path.join(settings.DATA_ROOT, annotations.meta["task"]["id"], '.upload',
                                           annotations.meta["source"]))
    idx = 0  # track index

    for track in annotations.tracks:
        boxes = {}
        for shape in track.shapes:
            if shape.type == "rectangle":  # dump only boxes
                boxes.update({
                    shape.frame: {
                        # ugly conversations according to old xml 2 json conversation
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
