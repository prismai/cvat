
# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT
from django.contrib.auth import get_user_model
from django.http import HttpResponse, JsonResponse, HttpResponseBadRequest
from django.shortcuts import redirect, get_object_or_404
from django.shortcuts import render
from django.conf import settings
from django.contrib.auth.decorators import permission_required
from cvat.apps.authentication.decorators import login_required
from cvat.apps.dashboard.forms import UpdateTaskJobForm

from cvat.apps.engine.models import Task as TaskModel, Job
from cvat.settings.base import JS_3RDPARTY

import os


User = get_user_model()


def ScanNode(directory):
    if '..' in directory.split(os.path.sep):
        return HttpResponseBadRequest('Permission Denied')

    act_dir = os.path.normpath(settings.SHARE_ROOT + directory)
    result = []

    nodes = os.listdir(act_dir)
    files = filter(os.path.isfile, map(lambda f: os.path.join(act_dir, f), nodes))
    dirs = filter(os.path.isdir, map(lambda d: os.path.join(act_dir, d), nodes))

    for d in dirs:
        name = os.path.basename(d)
        children = len(os.listdir(d)) > 0
        node = {'id': directory + name + '/', 'text': name, 'children': children}
        result.append(node)

    for f in files:
        name = os.path.basename(f)
        node = {'id': directory + name, 'text': name, "icon" : "jstree-file"}
        result.append(node)

    return result

@login_required
@permission_required('engine.add_task', raise_exception=True)
def JsTreeView(request):
    node_id = None
    if 'id' in request.GET:
        node_id = request.GET['id']

    if node_id is None or node_id == '#':
        node_id = '/'
        response = [{"id": node_id, "text": node_id, "children": ScanNode(node_id)}]
    else:
        response = ScanNode(node_id)

    return JsonResponse(response, safe=False,
        json_dumps_params=dict(ensure_ascii=False))


def MainTaskInfo(task, dst_dict):
    dst_dict["status"] = task.status
    dst_dict["num_of_segments"] = task.segment_set.count()
    dst_dict["mode"] = task.mode.capitalize()
    dst_dict["name"] = task.name
    dst_dict["task_id"] = task.id
    dst_dict["created_date"] = task.created_date
    dst_dict["updated_date"] = task.updated_date
    dst_dict["bug_tracker_link"] = task.bug_tracker
    dst_dict["has_bug_tracker"] = len(task.bug_tracker) > 0
    dst_dict["owner"] = 'undefined'
    dst_dict["id"] = task.id
    dst_dict["segments"] = []

def DetailTaskInfo(request, task, dst_dict):
    scheme = request.scheme
    host = request.get_host()
    dst_dict['segments'] = []

    for segment in task.segment_set.all():
        for job in segment.job_set.all():
            annotator = None
            if job.annotator:
                annotator = {'id': job.annotator.id, 'name': job.annotator.get_full_name()}
            segment_url = "{0}://{1}/?id={2}".format(scheme, host, job.id)
            dst_dict["segments"].append({
                'id': job.id,
                'annotator': annotator,
                'estimated_completion_date': job.estimated_completion_date,
                'progress': job.progress,
                'start': segment.start_frame,
                'stop': segment.stop_frame,
                'url': segment_url
            })

    db_labels = task.label_set.prefetch_related('attributespec_set').all()
    attributes = {}
    for db_label in db_labels:
        attributes[db_label.id] = {}
        for db_attrspec in db_label.attributespec_set.all():
            attributes[db_label.id][db_attrspec.id] = db_attrspec.text

    dst_dict['labels'] = attributes

@login_required
@permission_required('engine.view_task', raise_exception=True)
def DashboardView(request):
    filter_name = request.GET['search'] if 'search' in request.GET else None
    tasks_query_set = list(TaskModel.objects.prefetch_related('segment_set').order_by('-created_date').all())
    if filter_name is not None:
        tasks_query_set = list(filter(lambda x: filter_name.lower() in x.name.lower(), tasks_query_set))

    data = []
    for task in tasks_query_set:
        task_info = {}
        MainTaskInfo(task, task_info)
        DetailTaskInfo(request, task, task_info)
        data.append(task_info)

    return render(request, 'dashboard/dashboard.html', {
        'data': data,
        'max_upload_size': settings.LOCAL_LOAD_MAX_FILES_SIZE,
        'max_upload_count': settings.LOCAL_LOAD_MAX_FILES_COUNT,
        'available_annotators': [{'id': u.id, 'name': u.get_full_name()} for u in User.objects.filter(is_active=True)],
        'share_path': os.getenv('CVAT_SHARE_URL', default=r'${cvat_root}/share'),
        'js_3rdparty': JS_3RDPARTY.get('dashboard', [])
    })


@login_required
@permission_required('engine.view_task', raise_exception=True)
def task_job_update_view(request, job_id):
    job = get_object_or_404(Job.objects.all(), id=job_id)
    form = UpdateTaskJobForm(data=request.POST or None, instance=job)
    if form.is_valid():
        form.save()
        return HttpResponse('Resource updated successfully', status=204)

    return HttpResponse(form.errors, status=400)
