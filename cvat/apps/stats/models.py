from django.conf import settings
from django.db import models
from model_utils.models import TimeStampedModel


class JobStatsSave(TimeStampedModel):
    job = models.ForeignKey('engine.Job', null=True, on_delete=models.SET_NULL)
    annotator = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='job_saves', on_delete=models.PROTECT)

    start = models.DateTimeField(blank=True, null=True)
    end = models.DateTimeField(blank=True, null=True)

    system_tracked_time = models.IntegerField(blank=True, null=True)

    annotated_manually = models.IntegerField()  # Annotated objects after last save
    total_annotated_manually = models.IntegerField()  # Total count of manually annotated objects
    total_interpolated = models.IntegerField()  # Total count of interpolated objects

    class Meta:
        verbose_name = 'Job stats save'
        verbose_name_plural = 'Jobs stats saves'

    def __str__(self):
        return 'Save for job {} at {}'.format(self.job_id, self.created)
