import os
import logging
import re
import subprocess

from django.conf import settings


# Util service functions


def get_pts_times(video_file: str) -> list:
    ffmpeg_cmd_line = 'ffmpeg -i "{video_file}" -an -vsync 0 -debug_ts -f null - 2>&1 | grep filter'.format(
        video_file=video_file)
    rv = subprocess.run(ffmpeg_cmd_line,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        shell=True)

    if rv.returncode != 0:
        logging.fatal(rv.stdout)
        raise Exception('Error during executing subprocess command')

    pts_time_pattern = re.compile(r"(?<=pts_time\:)\S+")
    pts_times = []

    for line in rv.stdout.decode().split('\n'):
        pts_time_matches = pts_time_pattern.findall(line)
        if pts_time_matches:
            pts_time = round(float(pts_time_matches[0]) * 1000)
            pts_times.append(pts_time)
    return pts_times


def get_source_path(task_id: int, source: str) -> str:
    """
    Get path to video source.

    :param task_id: task ID.
    :type task_id: int.
    :param source: video source file name.
    :type source: str.
    :return: path to video source.
    :rtype: str.
    """

    return os.path.join(settings.DATA_ROOT, str(task_id), '.upload', source)
