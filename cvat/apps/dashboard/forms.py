from django import forms

from cvat.apps.engine.models import Job


class UpdateTaskJobForm(forms.ModelForm):
    class Meta:
        model = Job
        fields = ('annotator', 'estimated_completion_date', 'progress')
