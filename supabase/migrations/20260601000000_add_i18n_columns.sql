alter table building_facilities
  add column if not exists name_en text,
  add column if not exists name_zh text,
  add column if not exists description_en text,
  add column if not exists description_zh text,
  add column if not exists floor_info_en text,
  add column if not exists floor_info_zh text;

alter table building_facilities
  add column if not exists video_caption_en text,
  add column if not exists video_caption_zh text;

alter table building_photos
  add column if not exists caption_en text,
  add column if not exists caption_zh text;
