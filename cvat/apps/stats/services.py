import datetime
from itertools import groupby

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models.functions import Cast

from cvat.apps.stats.models import JobStatsSave

User = get_user_model()


def save_job_stats(job_id, annotator_id, data):
    """
    Service function to create job annotation state log
    """
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
    # Calculating manually set objects after last save
    if previous_save:
        to_save['annotated_manually'] = to_save['total_annotated_manually'] - previous_save.total_annotated_manually
    else:
        # if first time save
        to_save['annotated_manually'] = to_save['total_annotated_manually']
    save = None
    if None not in to_save.values():
        save = JobStatsSave.objects.create(**to_save)
    return save


def sum_intervals(date_list: list, first_interval=15):
    """
    Util function to calculate sum of intervals between dates in array
    with adding extra date to the start of array to minimize losses of time
    before first save
    """
    if not date_list:
        return datetime.timedelta()
    date_list.sort()
    start_date = next(iter(date_list)) - datetime.timedelta(minutes=first_interval)
    previous_date = start_date
    total_time = datetime.timedelta()
    for date in date_list:
        total_time += date - previous_date
        previous_date = date
    return total_time


def collect_annotators_stats():
    """
    Service function for collecting annotation statistics grouped by users (annotators)
    and save date
    """

    # Setup default dict grouped by users
    stats = {user.id: {'name': user.get_full_name(), 'stats': []} for user in User.objects.all()}

    for key, item in stats.items():
        # get all saves for user with casting datetime field to date field (to group saves by date)
        jobs_saves = JobStatsSave.objects.filter(annotator_id=key).annotate(
            date=Cast('created', models.DateField())
        ).values('job_id', 'annotated_manually', 'created', 'date').order_by('date')
        for date, group in groupby(jobs_saves, lambda x: x['date']):
            group = list(group)
            # get sum of intervals of dates in array of saves
            spent_time = sum_intervals([i['created'] for i in group])
            # round to hours
            spent_time = round(spent_time.total_seconds() / 60 / 60)
            # get sum of manually changed/added boxes for date
            boxes_count = sum([i['annotated_manually'] for i in group])
            item['stats'].append({
                'date': date,
                'boxes_count': boxes_count,
                'hours': spent_time,
                'ratio': (boxes_count / spent_time) if spent_time else 0
            })
            # sorting stats by desc date
            item['stats'].sort(key=lambda x: x['date'], reverse=True)
    return stats
