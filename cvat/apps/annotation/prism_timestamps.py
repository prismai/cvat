format_spec = {
    "name": "Prism Timestamps",
    "dumpers": [
        {
            "display_name": "{name} {format} {version}",
            "format": "TXT",
            "version": "1.0",
            "handler": "dump"
        },
    ],
    "loaders": [],
}


def dump(file_object, annotations):
    """
    Prism.ai timestamps dumper.

    :param file_object: file object to write result to.
    :type file_object: file.
    :param annotations: task annotations object.
    :type annotations: cvat.apps.annotation.Annotation.
    """

    # local imports because dumpers loader mechanism clean builtins functions include import
    from cvat.apps.engine.services import (
        get_pts_times,
        get_source_path,
    )

    pts_times = get_pts_times(video_file=get_source_path(task_id=annotations.meta["task"]["id"],
                                                         source=annotations.meta["source"]))
    file_object.writelines([str(len(pts_times)).encode() + '\n'.encode()])
    file_object.write('\n'.join([str(pts) for pts in pts_times]).encode())
    file_object.flush()
