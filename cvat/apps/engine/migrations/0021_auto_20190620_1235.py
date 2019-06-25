# Generated by Django 2.1.7 on 2019-06-20 09:35

import cvat.apps.engine.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('engine', '0020_remove_task_flipped'),
    ]

    operations = [
        migrations.AddField(
            model_name='job',
            name='estimated_completion_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='job',
            name='progress',
            field=cvat.apps.engine.fields.PercentField(default=0),
        ),
    ]