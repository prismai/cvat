# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT

import os

path_prefix = os.path.join('cvat', 'apps', 'annotation')
BUILTIN_FORMATS = (
    os.path.join(path_prefix, 'cvat.py'),
    os.path.join(path_prefix, 'pascal_voc.py'),
    os.path.join(path_prefix, 'yolo.py'),
    os.path.join(path_prefix, 'coco.py'),
    os.path.join(path_prefix, 'mask.py'),
    os.path.join(path_prefix, 'prism_virtual_camera.py'),
    os.path.join(path_prefix, 'prism_timestamps.py'),
    os.path.join(path_prefix, 'tfrecord.py'),
)