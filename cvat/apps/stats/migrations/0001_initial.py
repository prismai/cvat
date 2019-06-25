# Generated by Django 2.0.3 on 2018-11-17 22:26

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import model_utils.fields


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('engine', '0009_auto_20180917_1424'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='JobStatsSave',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created', model_utils.fields.AutoCreatedField(default=django.utils.timezone.now, editable=False, verbose_name='created')),
                ('modified', model_utils.fields.AutoLastModifiedField(default=django.utils.timezone.now, editable=False, verbose_name='modified')),
                ('annotated_manually', models.IntegerField()),
                ('total_annotated_manually', models.IntegerField()),
                ('total_interpolated', models.IntegerField()),
                ('annotator', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ('job', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='engine.Job')),
            ],
            options={
                'verbose_name': 'Job stats save',
                'verbose_name_plural': 'Jobs stats saves',
            },
        ),
    ]
