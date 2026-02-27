"""Cloud Storage service — uploads generated images and returns public URLs."""
import datetime
import logging
import uuid

from google.cloud import storage as gcs

from config import settings

logger = logging.getLogger(__name__)

_bucket = None


def _get_bucket():
    global _bucket
    if _bucket is None:
        client = gcs.Client(project=settings.google_cloud_project)
        _bucket = client.bucket(settings.gcs_bucket_name)
    return _bucket


async def upload_image_bytes(
    image_bytes: bytes,
    destination_name: str | None = None,
    content_type: str = "image/png",
) -> str:
    """Upload image bytes to GCS and return a signed URL valid for 1 hour."""
    bucket = _get_bucket()

    if destination_name is None:
        destination_name = f"images/{uuid.uuid4().hex}.png"
    else:
        destination_name = f"images/{uuid.uuid4().hex}_{destination_name}"

    blob = bucket.blob(destination_name)
    blob.upload_from_string(image_bytes, content_type=content_type)

    # Generate a signed URL valid for 1 hour
    url = blob.generate_signed_url(
        expiration=datetime.timedelta(hours=1),
        method="GET",
        version="v4",
    )

    logger.info("Uploaded %d bytes to gs://%s/%s", len(image_bytes), settings.gcs_bucket_name, destination_name)
    return url
