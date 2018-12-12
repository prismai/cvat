import datetime
from itertools import groupby

from django.contrib.auth import get_user_model
from django.db import models, IntegrityError
from django.db.models import F
from django.db.models.functions import Cast

from cvat.apps.engine.logging import job_logger
from cvat.apps.stats.models import JobStatsSave

User = get_user_model()


def save_job_stats(job_id, annotator_id, data: dict):
    """
    Service function to create job annotation state log
    """
    if not data:
        return None
    system_tracked_time = data.get('trackedTime', None)
    start = data.get('start')
    end = data.get('end')
    to_save = {
        'job_id': job_id,
        'annotator_id': annotator_id,
        'start': start,
        'end': end,
        'annotated_manually': data.get('manually'),
        'total_annotated_manually': data.get('totalManually'),
        'total_interpolated': data.get('totalInterpolated'),
        'system_tracked_time': system_tracked_time
    }
    try:
        save = JobStatsSave.objects.create(**to_save)
    except IntegrityError:
        job_logger[job_id].error('error saving job stats interval {} - {}'.format(start, end))
        return None
    return save


def calc_spent_time(saves: list, key='interval_length') -> float:
    """
    Util function which calculates total time of all saves interval in list
    """
    time = sum([x[key] for x in saves], datetime.timedelta())
    return time.total_seconds()


def calc_group_stats(saves: list) -> dict:
    """
    Util function which calculates stats for saves group
    """
    spent_time = calc_spent_time(saves)
    boxes_count = sum([i['annotated_manually'] for i in saves])
    return {
        'boxes_count': boxes_count,
        'time': spent_time,
        'ratio': round(boxes_count / (spent_time / 60 / 60), 2) if spent_time else 0
    }


def collect_annotators_stats(users) -> dict:
    """
    Service function for collecting annotation statistics grouped by users (annotators)
    and save date
    """

    # Setup default dict grouped by users
    stats = {user.id: {'name': user.username, 'full_name': user.get_full_name(), 'stats': {}} for user in users}

    for user_id, item in stats.items():
        # get all saves for user with casting datetime field to date field (to group saves by date)
        jobs_saves = JobStatsSave.objects.filter(annotator_id=user_id).annotate(
            date=Cast('start', models.DateField()),
            interval_length=F('end') - F('start')
        ).values('job_id', 'annotated_manually', 'created', 'date', 'interval_length').order_by('date')

        # iterating over saves grouped by date
        for date, date_group in groupby(jobs_saves, lambda x: x['date']):
            date = str(date)
            item['stats'].setdefault(date, [])

            date_group = list(date_group)
            date_group.sort(key=lambda x: x['job_id'])

            # iterating over saves for every date grouped by job id
            for job_id, job_group in groupby(date_group, lambda x: x['job_id']):
                job_group = list(job_group)
                job_stats = {'job': job_id}

                job_stats.update(calc_group_stats(job_group))
                item['stats'][date].append(job_stats)
    return stats
