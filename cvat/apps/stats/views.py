from django.contrib.auth import get_user_model
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render

from cvat.apps.authentication.decorators import login_required
from cvat.apps.stats.services import collect_annotators_stats, save_job_stats


User = get_user_model()


@login_required
def stats_index_view(request):
    return render(request, 'stats/index.html')


@login_required
def save_interval_stats(request):
    data = request.POST
    job_id = data.get('job')
    save = save_job_stats(job_id, request.user.id, data)
    status = 201
    if not save:
        status = 400
    return HttpResponse(status=status)


@login_required
def get_operators_stats_view(request):
    if not request.user.is_superuser:
        users = [request.user, ]
    else:
        users = User.objects.all()
    stats = collect_annotators_stats(users)
    return JsonResponse(stats)
