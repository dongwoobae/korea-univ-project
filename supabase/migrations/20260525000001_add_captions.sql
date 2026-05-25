alter table building_photos
  add column if not exists caption text;

alter table building_facilities
  add column if not exists video_caption text;
