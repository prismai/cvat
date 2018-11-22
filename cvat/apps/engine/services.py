import json
import logging
import re
import subprocess
import xml.etree.ElementTree as ET

from cvat.apps.engine.task import find_video_in_dir


# Util service functions


def is_version_valid(xml_el: ET.Element) -> bool:
    version_el = xml_el.find('version')
    if version_el is None:
        logging.error('Expect <version> tag in input XML')
        return False
    if version_el.text != '1.1':
        logging.error('Only version 1.1 is supported. Got version {version}'.format(version=version_el.text))
        return False
    return True


def get_boxes(track_el: ET.Element, pts_times: list) -> dict:
    rv = {}

    for box_el in track_el.iter('box'):
        # <box frame="1352" xtl="989.39" ytl="225.35" xbr="1055.18" ybr="271.84" outside="0"
        # occluded="0" keyframe="1"></box>
        frame = box_el.get('frame')
        xtl = round(float(box_el.get('xtl')))
        ytl = round(float(box_el.get('ytl')))
        xbr = round(float(box_el.get('xbr')))
        ybr = round(float(box_el.get('ybr')))
        outside = int(box_el.get('outside'))
        occluded = int(box_el.get('occluded'))

        # "0": {"occluded": 0, "time_ms": 0, "ybr": 188, "outside": 0, "xbr": 592, "ytl": 97,
        # "xtl": 549}
        rv[frame] = {"time_ms": pts_times[int(frame)],
                     "xtl": xtl,
                     "ytl": ytl,
                     "xbr": xbr,
                     "ybr": ybr,
                     "occluded": occluded,
                     "outside": outside}

    return rv


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


# Service functions


def convert_dump_to_vc_json(dump_path: str, video_path: str) -> str:
    xml_el = ET.parse(dump_path)
    if not is_version_valid(xml_el):
        raise Exception('Invalid dump version')

    video = find_video_in_dir(video_path)
    pts_times = get_pts_times(video)
    res = {}

    for track_el in xml_el.findall('track'):
        id_ = track_el.get('id')
        label = track_el.get('label')
        res[str(id_)] = {"boxes": get_boxes(track_el, pts_times), "label": label}

    with open(dump_path, "w") as file:
        json.dump(res, file, separators=(',', ':'))
    return dump_path


def convert_dump_to_timestamps(dump_path: str, video_path: str) -> str:
    xml_el = ET.parse(dump_path)
    if not is_version_valid(xml_el):
        raise Exception('Invalid dump version')

    video = find_video_in_dir(video_path)
    pts_times = get_pts_times(video)

    with open(dump_path, mode='wt', encoding='utf-8') as f:
        f.writelines([str(len(pts_times)) + '\n'])
        f.write('\n'.join([str(pts) for pts in pts_times]))

    return dump_path
