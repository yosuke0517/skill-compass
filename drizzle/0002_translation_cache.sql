CREATE TABLE `translation_cache` (
  `id` varchar(64) NOT NULL,
  `source_hash` varchar(64) NOT NULL,
  `source_text` text NOT NULL,
  `source_locale` varchar(8) NOT NULL,
  `target_locale` varchar(8) NOT NULL,
  `purpose` varchar(64) NOT NULL,
  `translated_text` text NOT NULL,
  `provider` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `translation_cache_id` PRIMARY KEY(`id`),
  CONSTRAINT `translation_cache_source_hash_idx` UNIQUE(`source_hash`)
);
