from django.contrib.auth.decorators import user_passes_test
from django.http import JsonResponse
from django.shortcuts import render

from cvat.apps.authentication.decorators import login_required
from cvat.apps.stats.utils import collect_annotators_stats


def stats_index_view(request):
    return render(request, 'stats/index.html')


@user_passes_test(lambda u: u.is_staff)
@login_required
def get_operators_stats_view(request, operator_id=9):
    stats = collect_annotators_stats(operator_id)
    return JsonResponse(stats)
