from django.contrib.auth.decorators import user_passes_test
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render

from cvat.apps.authentication.decorators import login_required
from cvat.apps.stats.services import collect_annotators_stats, save_job_stats


@user_passes_test(lambda u: u.is_staff, '/admin')
@login_required
def stats_index_view(request):
    return render(request, 'stats/index.html')


@login_required
def save_interval_stats(request):
    data = request.POST
    job_id = data.get('job')
    save_job_stats(job_id, request.user.id, data)
    return HttpResponse(status=201)


@user_passes_test(lambda u: u.is_staff, '/admin')
@login_required
def get_operators_stats_view(request):
    stats = collect_annotators_stats()
    return JsonResponse(stats)
