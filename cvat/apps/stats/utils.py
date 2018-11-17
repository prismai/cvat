import datetime
from itertools import groupby

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models.functions import Cast

from cvat.apps.stats.models import JobStatsSave

User = get_user_model()


def save_job_stats(job_id, annotator_id, data):
    if not data:
        return None
    to_save = {
        'job_id': job_id,
        'annotator_id': annotator_id,
        'total_annotated_manually': data.get('manually'),
        'total_interpolated': data.get('interpolated')
    }
    previous_save = JobStatsSave.objects.filter(
        job_id=job_id,
        annotator_id=annotator_id
    ).order_by('-created').first()
    if previous_save:
        to_save['annotated_manually'] = to_save['total_annotated_manually'] - previous_save.total_annotated_manually
    else:
        to_save['annotated_manually'] = to_save['total_annotated_manually']
    save = None
    if None not in to_save.values():
        save = JobStatsSave.objects.create(**to_save)
    return save


def sum_intervals(date_list: list, start_step=1):
    if not date_list:
        return datetime.timedelta(hours=0, minutes=0, seconds=0)
    date_list.sort()
    start_date = next(iter(date_list)) - datetime.timedelta(hours=start_step)
    previous_date = start_date
    total_time = datetime.timedelta(hours=0, minutes=0, seconds=0)
    for date in date_list:
        total_time += date - previous_date
        previous_date = date
    return total_time


def collect_annotators_stats(annotator_id=None):
    users = User.objects.all()
    if annotator_id:
        users = users.filter(id=annotator_id)

    # Setup default dict grouped by users
    stats = {user.id: {'name': user.get_full_name(), 'stats': []} for user in users}

    # calculate base stats
    for user in users:
        jobs_saves = JobStatsSave.objects.filter(
            annotator_id=user.id
        ).annotate(date=Cast('created', models.DateField())).values(
            'job_id', 'annotated_manually', 'created', 'date').order_by('date')
        for date, group in groupby(jobs_saves, lambda x: x['date']):
            group = list(group)
            spent_time = sum_intervals([i['created'] for i in group])
            spent_time = round(spent_time.total_seconds() / 60 / 60)
            boxes_count = sum([i['annotated_manually'] for i in group])
            stats[user.id]['stats'].append({
                'date': date,
                'boxes_count': boxes_count,
                'hours': spent_time,
                'ratio': boxes_count / spent_time
            })
        stats[user.id]['stats'].sort(key=lambda x: x['date'], reverse=True)
    return stats
