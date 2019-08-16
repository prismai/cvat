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
    import os
    from django.conf import settings
    from cvat.apps.engine.services import get_pts_times

    pts_times = get_pts_times(os.path.join(settings.DATA_ROOT, annotations.meta["task"]["id"], '.upload',
                                           annotations.meta["source"]))
    file_object.writelines([str(len(pts_times)).encode() + '\n'.encode()])
    file_object.write('\n'.join([str(pts) for pts in pts_times]).encode())
    file_object.flush()
