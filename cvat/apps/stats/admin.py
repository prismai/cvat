from django.contrib import admin
from django.utils import timezone

from cvat.apps.stats.models import JobStatsSave


class JobStatsSaveAdmin(admin.ModelAdmin):
    list_display = ('job_id', 'name', 'start_time', 'end', 'annotated_manually')

    def name(self, obj):
        return obj.annotator.get_full_name() or obj.annotator.username

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('annotator')

    def start_time(self, obj):
        tz = timezone.get_current_timezone()
        return timezone.localtime(obj.start, tz)


admin.site.register(JobStatsSave, JobStatsSaveAdmin)
